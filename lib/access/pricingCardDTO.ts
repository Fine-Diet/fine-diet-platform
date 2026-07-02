/**
 * Pricing card DTO — the frontend-safe rendering contract for pricing cards.
 *
 * SAFETY BOUNDARY (do not blur this):
 * - This shape is what the FRONTEND receives and renders. It contains ONLY
 *   display data. It MUST NEVER contain Stripe price IDs, phase price IDs, or
 *   any other charge-sensitive identifier.
 * - The card submits IDENTIFIERS (offerKey + priceOptionKey) to checkout, never
 *   prices. Billing truth is resolved server-side from `price_options`/`offers`.
 *
 * The card is a set of FIXED OPTIONAL ZONES. Every zone is optional except
 * `title`, `primaryPrice`, `billingDisclosure`, and `ctaLabel`.
 */

/** How checkout should behave for this price option. Display/behavior hint only. */
export type PricingCheckoutMode =
  | 'one_time'
  | 'subscription'
  | 'trial'
  | 'installment'
  | 'intro_then_subscription';

export type PricingCardDTO = {
  offerKey: string;
  priceOptionKey: string;

  zones: {
    badge?: string | null;
    savingsBadge?: string | null;
    eyebrow?: string | null;
    title: string;
    description?: string | null;

    primaryPrice: string;
    primarySuffix?: string | null;
    billingQualifier?: string | null;
    compareAt?: string | null;
    savingsLine?: string | null;

    trialCallout?: string | null;
    introCallout?: string | null;
    inclusionHeading?: string | null;
    inclusionBullets?: string[];

    billingDisclosure: string;
    finePrint?: string | null;
    ctaLabel: string;
  };

  behavior: {
    checkoutMode: PricingCheckoutMode;
    isFeatured?: boolean;
    isDisabled?: boolean;
  };
};

/** Layout hint for how a pricing module arranges its cards. */
export type PricingModuleLayout = 'grid' | 'stack' | 'compare';

/**
 * A pricing module = one offer rendered as one-or-more selectable price-option
 * cards. This is the unit `/start` consumes instead of hand-building copy.
 */
export type PricingModuleDTO = {
  offerKey: string;
  layout: PricingModuleLayout;
  cards: PricingCardDTO[];
};
