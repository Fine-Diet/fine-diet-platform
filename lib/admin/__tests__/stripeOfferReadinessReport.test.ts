import { describe, expect, test } from '@jest/globals';
import {
  buildStripeOfferReadinessReport,
  isStripePriceId,
  type StripeReadinessOfferInput,
} from '../stripeOfferReadinessReport';
import type { OfferReadinessEntitlementMapping } from '@/lib/access/offerReadinessAudit';

const FIXED_AT = '2026-06-03T00:00:00.000Z';

// Mirrors the documented Packet 24/25 catalog state plus a clean offer.
// Canonical Stripe price IDs are alphanumeric after the `price_` prefix
// (no extra underscores), matching the admin UI's isStripePriceId regex.
const offers: StripeReadinessOfferInput[] = [
  {
    offer_key: 'journal-monthly',
    is_active: true,
    billing_model: 'subscription',
    stripe_price_id: 'price_sharedJournal01',
  },
  {
    offer_key: 'journal-annual',
    is_active: true,
    billing_model: 'subscription',
    stripe_price_id: 'price_sharedJournal01',
  },
  {
    offer_key: 'integrative-care-3pay',
    is_active: true,
    billing_model: 'installment',
    stripe_price_id: '189.89',
    stripe_phase_price_ids: ['price_phaseA01', 'price_phaseB01', 'price_phaseC01'],
    stripe_phase_iterations: [1, 1, 1],
  },
  {
    offer_key: 'inegrative-care-3pay',
    is_active: false,
    billing_model: 'installment',
    stripe_price_id: '189.89',
  },
  {
    offer_key: 'clean-one-time',
    is_active: true,
    billing_model: 'one_time',
    stripe_price_id: 'price_clean01',
  },
];

const mappings: OfferReadinessEntitlementMapping[] = [
  { offer_key: 'journal-monthly', entitlement_key: 'journal', is_active: true },
  { offer_key: 'journal-annual', entitlement_key: 'journal', is_active: true },
  { offer_key: 'integrative-care-3pay', entitlement_key: 'care:integrative', is_active: true },
  { offer_key: 'clean-one-time', entitlement_key: 'journal', is_active: true },
];

describe('isStripePriceId', () => {
  test('accepts canonical price IDs and rejects dollar-like values', () => {
    expect(isStripePriceId('price_123Abc')).toBe(true);
    expect(isStripePriceId('189.89')).toBe(false);
    expect(isStripePriceId('')).toBe(false);
    expect(isStripePriceId(null)).toBe(false);
  });
});

describe('buildStripeOfferReadinessReport', () => {
  const report = buildStripeOfferReadinessReport(offers, mappings, FIXED_AT);

  test('counts offers and active offers', () => {
    expect(report.offer_count).toBe(5);
    expect(report.active_offer_count).toBe(4);
  });

  test('flags the shared journal price as a warning, not a blocker', () => {
    const dup = report.findings.find((f) => f.code === 'duplicate_active_price_id');
    expect(dup?.severity).toBe('warning');
    expect(report.raw.duplicate_active_price_ids[0].offer_keys).toEqual([
      'journal-annual',
      'journal-monthly',
    ]);
  });

  test('flags the integrative installment dollar-like primary price as cleanup warning only', () => {
    const cleanup = report.findings.find(
      (f) => f.code === 'installment_primary_price_cleanup',
    );
    expect(cleanup?.offer_key).toBe('integrative-care-3pay');
    expect(cleanup?.severity).toBe('warning');
  });

  test('does not raise blocking issues for a correctly configured catalog', () => {
    // The fixture has valid phase config + mappings, so nothing should block.
    expect(report.summary.blocking_count).toBe(0);
    expect(report.summary.ok).toBe(true);
  });

  test('reports the inactive typo offer as info and keeps it out of active checks', () => {
    const typo = report.findings.find((f) => f.code === 'inactive_typo_offer');
    expect(typo?.offer_key).toBe('inegrative-care-3pay');
    expect(typo?.severity).toBe('info');
  });

  test('blocks active offers missing a price ID', () => {
    const broken = buildStripeOfferReadinessReport(
      [{ offer_key: 'broken', is_active: true, billing_model: 'one_time', stripe_price_id: null }],
      [{ offer_key: 'broken', entitlement_key: 'journal', is_active: true }],
      FIXED_AT,
    );
    expect(broken.summary.ok).toBe(false);
    expect(broken.findings.some((f) => f.code === 'missing_price_id')).toBe(true);
  });

  test('blocks active offers with no entitlement mapping', () => {
    const noMapping = buildStripeOfferReadinessReport(
      [
        {
          offer_key: 'orphan',
          is_active: true,
          billing_model: 'one_time',
          stripe_price_id: 'price_ok',
        },
      ],
      [],
      FIXED_AT,
    );
    expect(noMapping.findings.some((f) => f.code === 'no_entitlement_mapping')).toBe(true);
  });

  test('does not flag journal-annual as missing mappings (code-owned supplement)', () => {
    const journalAnnualOnly = buildStripeOfferReadinessReport(
      [
        {
          offer_key: 'journal-annual',
          is_active: true,
          billing_model: 'subscription',
          stripe_price_id: 'price_ok',
        },
      ],
      [],
      FIXED_AT,
    );
    expect(
      journalAnnualOnly.findings.some((f) => f.code === 'no_entitlement_mapping'),
    ).toBe(false);
  });
});
