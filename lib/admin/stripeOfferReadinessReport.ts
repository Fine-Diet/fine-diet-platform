/**
 * Packet C — Stripe Live Offer Readiness (pure report builder)
 *
 * Pure, database-free logic for the readiness report. Kept separate from
 * `stripeOfferReadinessService.ts` (which loads Supabase data) so it can be
 * unit-tested without env/IO, mirroring `lib/access/offerReadinessAudit.ts`.
 *
 * This module performs NO writes and reads NO external state.
 */

import {
  findActiveOffersWithoutEntitlementMappings,
  findDuplicateActiveStripePriceIds,
  findInactiveTypoLikeOffers,
  findUnknownActiveOfferEntitlementKeys,
  type DuplicateStripePriceFinding,
  type OfferReadinessEntitlementMapping,
  type OfferReadinessOffer,
  type OfferWithoutMappingsFinding,
  type TypoLikeOfferFinding,
  type UnknownEntitlementFinding,
} from '@/lib/access/offerReadinessAudit';
import { getCodeOwnedOfferEntitlementMappings } from '@/lib/access/offerEntitlementMappings';

export type StripeBillingModel = 'one_time' | 'subscription' | 'installment';

export interface StripeReadinessOfferInput {
  offer_key: string;
  is_active: boolean;
  billing_model: StripeBillingModel | string | null;
  stripe_price_id?: string | null;
  stripe_phase_price_ids?: string[] | null;
  stripe_phase_iterations?: number[] | null;
}

export type ReadinessSeverity = 'blocking' | 'warning' | 'info';

export interface StripeReadinessFinding {
  severity: ReadinessSeverity;
  code: string;
  offer_key: string | null;
  message: string;
}

export interface StripeOfferReadinessReport {
  generated_at: string;
  offer_count: number;
  active_offer_count: number;
  summary: {
    blocking_count: number;
    warning_count: number;
    info_count: number;
    /** True when there are no blocking findings. */
    ok: boolean;
  };
  findings: StripeReadinessFinding[];
  raw: {
    duplicate_active_price_ids: DuplicateStripePriceFinding[];
    unknown_active_entitlement_keys: UnknownEntitlementFinding[];
    inactive_typo_like_offers: TypoLikeOfferFinding[];
    active_offers_without_mappings: OfferWithoutMappingsFinding[];
  };
}

/** A canonical Stripe price ID looks like `price_XXXXXXXX`. */
export function isStripePriceId(value: string | null | undefined): boolean {
  return /^price_[A-Za-z0-9]+$/.test(value?.trim() ?? '');
}

function severityRank(severity: ReadinessSeverity): number {
  if (severity === 'blocking') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

/** True when this active offer relies on a code-owned entitlement supplement. */
function hasCodeOwnedMappings(offerKey: string): boolean {
  return getCodeOwnedOfferEntitlementMappings(offerKey).length > 0;
}

function checkBillingConfig(offer: StripeReadinessOfferInput): StripeReadinessFinding[] {
  const findings: StripeReadinessFinding[] = [];
  const model = offer.billing_model;

  if (model === 'one_time' || model === 'subscription') {
    const price = offer.stripe_price_id?.trim() ?? '';
    if (!price) {
      findings.push({
        severity: 'blocking',
        code: 'missing_price_id',
        offer_key: offer.offer_key,
        message: `Active ${model} offer "${offer.offer_key}" has no stripe_price_id. Checkout will fail.`,
      });
    } else if (!isStripePriceId(price)) {
      findings.push({
        severity: 'blocking',
        code: 'malformed_price_id',
        offer_key: offer.offer_key,
        message: `Active ${model} offer "${offer.offer_key}" has a malformed stripe_price_id ("${price}"). Expected a Stripe price ID like price_XXXX.`,
      });
    }
    return findings;
  }

  if (model === 'installment') {
    const phasePriceIds = offer.stripe_phase_price_ids ?? [];
    const phaseIterations = offer.stripe_phase_iterations ?? [];

    if (phasePriceIds.length === 0) {
      findings.push({
        severity: 'blocking',
        code: 'installment_missing_phase_prices',
        offer_key: offer.offer_key,
        message: `Active installment offer "${offer.offer_key}" has no stripe_phase_price_ids. Phased checkout cannot be created.`,
      });
    } else {
      const malformed = phasePriceIds.filter((id) => !isStripePriceId(id));
      if (malformed.length > 0) {
        findings.push({
          severity: 'blocking',
          code: 'installment_malformed_phase_price',
          offer_key: offer.offer_key,
          message: `Active installment offer "${offer.offer_key}" has malformed phase price ID(s): ${malformed.join(', ')}.`,
        });
      }
      if (phaseIterations.length !== phasePriceIds.length) {
        findings.push({
          severity: 'blocking',
          code: 'installment_phase_iteration_mismatch',
          offer_key: offer.offer_key,
          message: `Active installment offer "${offer.offer_key}" has ${phasePriceIds.length} phase price(s) but ${phaseIterations.length} iteration value(s). They must align.`,
        });
      } else if (phaseIterations.some((n) => !Number.isInteger(n) || n <= 0)) {
        findings.push({
          severity: 'blocking',
          code: 'installment_invalid_iterations',
          offer_key: offer.offer_key,
          message: `Active installment offer "${offer.offer_key}" has non-positive or non-integer phase iterations.`,
        });
      }
    }

    // The checkout path ignores stripe_price_id for installments, but a
    // dollar-like value left in that column should still be cleaned up before
    // live use (documented: integrative-care-3pay).
    const primary = offer.stripe_price_id?.trim() ?? '';
    if (primary && !isStripePriceId(primary)) {
      findings.push({
        severity: 'warning',
        code: 'installment_primary_price_cleanup',
        offer_key: offer.offer_key,
        message: `Installment offer "${offer.offer_key}" has a non-price stripe_price_id ("${primary}"). Checkout ignores it for installments, but it should be cleaned up before live use.`,
      });
    }
    return findings;
  }

  if (!model) {
    findings.push({
      severity: 'blocking',
      code: 'missing_billing_model',
      offer_key: offer.offer_key,
      message: `Active offer "${offer.offer_key}" has no billing_model. It cannot create a checkout session.`,
    });
  } else {
    findings.push({
      severity: 'warning',
      code: 'unknown_billing_model',
      offer_key: offer.offer_key,
      message: `Active offer "${offer.offer_key}" has an unrecognized billing_model ("${model}").`,
    });
  }
  return findings;
}

/**
 * Build a full readiness report from already-loaded offers + mappings.
 * Pure and deterministic so it can be unit-tested without a database.
 */
export function buildStripeOfferReadinessReport(
  offers: StripeReadinessOfferInput[],
  mappings: OfferReadinessEntitlementMapping[],
  generatedAt: string = new Date().toISOString(),
): StripeOfferReadinessReport {
  const auditOffers: OfferReadinessOffer[] = offers.map((o) => ({
    offer_key: o.offer_key,
    is_active: o.is_active,
    stripe_price_id: o.stripe_price_id ?? null,
  }));

  const duplicatePriceIds = findDuplicateActiveStripePriceIds(auditOffers);
  const unknownKeys = findUnknownActiveOfferEntitlementKeys(auditOffers, mappings);
  const typoOffers = findInactiveTypoLikeOffers(auditOffers);
  const offersWithoutMappingsRaw = findActiveOffersWithoutEntitlementMappings(
    auditOffers,
    mappings,
  );
  // Don't flag offers whose entitlements come from the code-owned supplement
  // (e.g. journal-annual) as "missing mappings" — the grant path resolves them.
  const offersWithoutMappings = offersWithoutMappingsRaw.filter(
    (o) => !hasCodeOwnedMappings(o.offer_key),
  );

  const findings: StripeReadinessFinding[] = [];

  for (const offer of offers) {
    if (!offer.is_active) continue;
    findings.push(...checkBillingConfig(offer));
  }

  for (const finding of offersWithoutMappings) {
    findings.push({
      severity: 'blocking',
      code: 'no_entitlement_mapping',
      offer_key: finding.offer_key,
      message: `Active offer "${finding.offer_key}" has no active entitlement mapping. A successful payment would grant nothing.`,
    });
  }

  for (const finding of unknownKeys) {
    findings.push({
      severity: 'blocking',
      code: 'unknown_entitlement_key',
      offer_key: finding.offer_key,
      message: `Active offer "${finding.offer_key}" maps to unknown entitlement key "${finding.entitlement_key}" (not in the registry).`,
    });
  }

  for (const finding of duplicatePriceIds) {
    findings.push({
      severity: 'warning',
      code: 'duplicate_active_price_id',
      offer_key: null,
      message: `Active offers ${finding.offer_keys.join(', ')} share the same Stripe price ID (${finding.stripe_price_id}). Only live-ready if they intentionally sell the exact same recurring price/cadence (e.g. the documented journal-monthly/journal-annual case).`,
    });
  }

  for (const finding of typoOffers) {
    findings.push({
      severity: 'info',
      code: 'inactive_typo_offer',
      offer_key: finding.offer_key,
      message: `Inactive offer "${finding.offer_key}" looks like a typo of active "${finding.similar_offer_key}" (distance ${finding.distance}). Keep it inactive unless intentionally retained for audit history.`,
    });
  }

  const blocking_count = findings.filter((f) => f.severity === 'blocking').length;
  const warning_count = findings.filter((f) => f.severity === 'warning').length;
  const info_count = findings.filter((f) => f.severity === 'info').length;

  findings.sort((a, b) => {
    const rank = severityRank(a.severity) - severityRank(b.severity);
    if (rank !== 0) return rank;
    return `${a.code}:${a.offer_key ?? ''}`.localeCompare(`${b.code}:${b.offer_key ?? ''}`);
  });

  return {
    generated_at: generatedAt,
    offer_count: offers.length,
    active_offer_count: offers.filter((o) => o.is_active).length,
    summary: {
      blocking_count,
      warning_count,
      info_count,
      ok: blocking_count === 0,
    },
    findings,
    raw: {
      duplicate_active_price_ids: duplicatePriceIds,
      unknown_active_entitlement_keys: unknownKeys,
      inactive_typo_like_offers: typoOffers,
      active_offers_without_mappings: offersWithoutMappings,
    },
  };
}
