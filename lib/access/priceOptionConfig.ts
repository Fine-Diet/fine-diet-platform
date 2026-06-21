/**
 * Price option presentation config — PURE, SSR/client-safe.
 *
 * SOURCE-OF-TRUTH BOUNDARY (mirrors offerConfig.ts):
 * - This file owns the *presentation* of a price option: the fixed pricing-card
 *   zones (badge, title, price labels, disclosures, CTA, ...) and a display-only
 *   `checkoutMode` behavior hint.
 * - It owns NO billing truth. Stripe price IDs, trial enforcement, and phase data
 *   live in the Supabase `price_options` table and are read ONLY server-side at
 *   checkout. Nothing chargeable is defined here.
 *
 * `priceOptionKey` values MUST match `price_options.price_option_key`
 * (see scripts/sql/seedFineDietPriceOptions.sql). `offerKey` MUST match the
 * parent `offers` row that grants entitlements (e.g. `fine-diet-method`).
 */

import type { PricingCardDTO, PricingCheckoutMode } from './pricingCardDTO';

/** Presentation record for one price option (one card). */
export interface PriceOptionPresentation {
  priceOptionKey: string;
  /** Parent offer (marketed package) this price option buys. */
  offerKey: string;
  /** Ascending display order within the offer's pricing module. */
  sortOrder: number;
  checkoutMode: PricingCheckoutMode;
  isFeatured?: boolean;
  isDisabled?: boolean;
  /** Fixed pricing-card zones. Same shape the card renders. */
  zones: PricingCardDTO['zones'];
}

const SHARED_INCLUSIONS = [
  'Full app access: journal, insights, recipes, meal scheduling',
  'Fine Diet programs included as they run',
  'Same access on every plan — only the billing differs',
];

/**
 * Price option presentation catalogue.
 *
 * Monthly / annual / founder-annual all buy the SAME offer
 * (`fine-diet-method`) and therefore grant the same access; only the billing
 * rhythm and framing differ.
 */
export const PRICE_OPTION_PRESENTATIONS: PriceOptionPresentation[] = [
  {
    priceOptionKey: 'fine-diet-method-monthly',
    offerKey: 'fine-diet-method',
    sortOrder: 10,
    checkoutMode: 'trial',
    zones: {
      eyebrow: 'Fine Diet Method',
      title: 'Monthly',
      description:
        'The full Fine Diet app and programs, billed month to month. Start with a free trial.',
      primaryPrice: '$24.99',
      primarySuffix: '/mo',
      billingQualifier: 'Billed monthly',
      trialCallout: '14-day free trial',
      inclusionBullets: SHARED_INCLUSIONS,
      billingDisclosure:
        'No charge today. Your 14-day free trial auto-converts to $24.99/mo unless you cancel before it ends.',
      ctaLabel: 'Start your 14-day free trial',
    },
  },
  {
    priceOptionKey: 'fine-diet-method-annual',
    offerKey: 'fine-diet-method',
    sortOrder: 20,
    checkoutMode: 'subscription',
    isFeatured: true,
    zones: {
      badge: 'Best value',
      savingsBadge: 'Save 33%',
      eyebrow: 'Fine Diet Method',
      title: 'Annual',
      description:
        'The full Fine Diet app and programs, billed once a year for the best rate.',
      primaryPrice: '$199.99',
      primarySuffix: '/yr',
      billingQualifier: 'Billed annually',
      compareAt: '$299.88/yr',
      savingsLine: 'About $16.67/mo — save vs. monthly.',
      inclusionBullets: SHARED_INCLUSIONS,
      billingDisclosure:
        'Billed $199.99 today for one year of full access, then renews annually unless you cancel.',
      ctaLabel: 'Get annual access',
    },
  },
  {
    priceOptionKey: 'fine-diet-method-founder-annual',
    offerKey: 'fine-diet-method',
    sortOrder: 30,
    checkoutMode: 'trial',
    zones: {
      badge: 'Founder’s Launch',
      savingsBadge: 'Save 56%',
      eyebrow: 'Founder’s Launch',
      title: 'Founder Annual',
      description:
        'A founder annual rate with an extended trial — full app and programs.',
      primaryPrice: '$129.99',
      primarySuffix: '/yr',
      billingQualifier: 'Billed annually',
      compareAt: '$299.88/yr',
      savingsLine: 'Founder pricing during launch only.',
      trialCallout: '30-day free trial',
      inclusionBullets: SHARED_INCLUSIONS,
      billingDisclosure:
        'No charge today. Your 30-day free trial auto-converts to $129.99/yr unless you cancel before it ends.',
      ctaLabel: 'Start your 30-day free trial',
    },
  },
];

function normalizeKey(key: string): string {
  return key?.trim() ?? '';
}

export function getPriceOptionPresentation(
  priceOptionKey: string,
): PriceOptionPresentation | null {
  const normalized = normalizeKey(priceOptionKey);
  if (!normalized) return null;
  return (
    PRICE_OPTION_PRESENTATIONS.find((p) => p.priceOptionKey === normalized) ??
    null
  );
}

/** All price option presentations for an offer, ascending by sortOrder. */
export function listPriceOptionPresentations(
  offerKey: string,
): PriceOptionPresentation[] {
  const normalized = normalizeKey(offerKey);
  if (!normalized) return [];
  return PRICE_OPTION_PRESENTATIONS.filter((p) => p.offerKey === normalized).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}
