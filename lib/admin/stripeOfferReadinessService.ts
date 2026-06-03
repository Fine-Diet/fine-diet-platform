/**
 * Packet C — Stripe Live Offer Readiness (data-loading wrapper)
 *
 * Loads `offers` + `offer_entitlements` (read-only) and delegates to the pure
 * report builder in `stripeOfferReadinessReport.ts`. The pure logic lives in a
 * separate module so it can be unit-tested without Supabase env/IO.
 *
 * This module is strictly READ-ONLY:
 *   - It never writes to Supabase or Stripe.
 *   - It never rotates keys, switches env vars, or mutates offer/Stripe config.
 *   - It only inspects existing `offers` + `offer_entitlements` rows and reports.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { OfferReadinessEntitlementMapping } from '@/lib/access/offerReadinessAudit';
import {
  buildStripeOfferReadinessReport,
  type StripeOfferReadinessReport,
  type StripeReadinessOfferInput,
} from '@/lib/admin/stripeOfferReadinessReport';

export type {
  ReadinessSeverity,
  StripeBillingModel,
  StripeOfferReadinessReport,
  StripeReadinessFinding,
  StripeReadinessOfferInput,
} from '@/lib/admin/stripeOfferReadinessReport';
export {
  buildStripeOfferReadinessReport,
  isStripePriceId,
} from '@/lib/admin/stripeOfferReadinessReport';

/**
 * Load offers + active entitlement mappings (read-only) and build the report.
 * Throws on Supabase read errors so the API can surface a 500.
 */
export async function getStripeOfferReadinessReport(): Promise<StripeOfferReadinessReport> {
  const { data: offers, error: offersErr } = await supabaseAdmin
    .from('offers')
    .select(
      'offer_key, is_active, billing_model, stripe_price_id, stripe_phase_price_ids, stripe_phase_iterations',
    );
  if (offersErr) {
    throw new Error(`Failed to load offers: ${offersErr.message}`);
  }

  const { data: mappings, error: mappingsErr } = await supabaseAdmin
    .from('offer_entitlements')
    .select('offer_key, entitlement_key, is_active');
  if (mappingsErr) {
    throw new Error(`Failed to load offer entitlements: ${mappingsErr.message}`);
  }

  const offerInputs: StripeReadinessOfferInput[] = (offers ?? []).map((o) => ({
    offer_key: o.offer_key,
    is_active: Boolean(o.is_active),
    billing_model: o.billing_model ?? null,
    stripe_price_id: o.stripe_price_id ?? null,
    stripe_phase_price_ids: Array.isArray(o.stripe_phase_price_ids)
      ? o.stripe_phase_price_ids
      : null,
    stripe_phase_iterations: Array.isArray(o.stripe_phase_iterations)
      ? o.stripe_phase_iterations
      : null,
  }));

  const mappingInputs: OfferReadinessEntitlementMapping[] = (mappings ?? []).map((m) => ({
    offer_key: m.offer_key,
    entitlement_key: m.entitlement_key,
    is_active: Boolean(m.is_active),
  }));

  return buildStripeOfferReadinessReport(offerInputs, mappingInputs);
}
