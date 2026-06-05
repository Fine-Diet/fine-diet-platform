/**
 * Offer configuration — PRESENTATION / ROUTING config for the app subscription
 * /start surface.
 *
 * SOURCE-OF-TRUTH BOUNDARY (do not blur this):
 * - Supabase `offers` rows + Stripe Prices are the BILLING truth. Checkout
 *   (`/api/checkout/create`) loads the offer by `offerKey` from Supabase and
 *   charges using `offers.stripe_price_id` — never a value from this file.
 * - This file owns *presentation* + *routing* only: slug -> offerKey mapping,
 *   trial length used for display copy, checkout framing, price label, access
 *   tier granted (for owned-state UI), and marketing copy.
 *
 * `stripePriceId` below is REFERENCE-ONLY (cross-check/debugging). It is NOT
 * read by checkout and is intentionally excluded from the marketing DTO
 * (`offerCatalogService.toMarketingDTO`) so it is never exposed via /api/offers.
 *
 * `offerKey` values MUST match dedicated Supabase `offers` rows (see
 * `scripts/sql/seedFineDietAppOffers.sql`). Pricing reflects the Revenue
 * Strategy sheet ("REVENUE STRATEGY — Fine Diet™"): METHOD monthly $24.99 /
 * annual $199.99, FOUNDER'S LAUNCH annual $129.99. CORE pricing is intentionally
 * NOT surfaced in this pass.
 */

import type { GrantedAccessTier } from './accessStateTypes';

export type OfferRole = 'default-public' | 'launch-event' | 'buy-now';

/** How checkout should behave / be framed for this offer. */
export type OfferCheckoutMode = 'trial' | 'buy_now' | 'subscription';

export interface OfferCopy {
  eyebrow?: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  /** Trial framing line; omit (or empty) for buy-now offers that skip trial copy. */
  trialNote?: string;
  bullets: string[];
}

export interface OfferConfig {
  /** URL slug for /start/[offerSlug]. */
  slug: string;
  /** Links to the `offers` DB row + existing checkout (offer_key). */
  offerKey: string;
  role: OfferRole;
  /** Manual on/off. Combined with the optional active window below. */
  isActive: boolean;
  /** Optional active window (ISO strings). Outside the window -> treated inactive. */
  startsAt?: string | null;
  endsAt?: string | null;
  /** Trial length in days. 0 = no trial (buy-now). Configurable per offer. */
  trialDays: number;
  checkoutMode: OfferCheckoutMode;
  /** Display-only price label (e.g. "$24.99/mo"). Not the charge source of truth. */
  priceLabel: string;
  priceSuffix?: string;
  /**
   * REFERENCE-ONLY Stripe price ID (sandbox). NOT used by checkout — checkout
   * reads `offers.stripe_price_id` from Supabase. Kept here only to cross-check
   * the seed against this config. Never serialized into the marketing DTO.
   */
  stripePriceId?: string | null;
  /** Access tier a successful subscribe grants. Baseline = app_plus_programs. */
  grantsAccessState: GrantedAccessTier;
  /** Practitioner-supported premium offers are layered above the baseline subscription. */
  isPractitionerSupported?: boolean;
  /** TODO(entitlements): final entitlement counts/keys. Placeholders for v1. */
  entitlementKeys: string[];
  copy: OfferCopy;
  image?: string;
}

const APP_HERO_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

/**
 * Offer catalogue.
 *
 * offerKeys reference dedicated Supabase `offers` rows seeded by
 * `scripts/sql/seedFineDietAppOffers.sql`. Trial length is enforced at checkout
 * via `offers.trial_period_days` (Supabase), NOT from this file — `trialDays`
 * here drives presentation copy only. Pricing follows the Revenue Strategy
 * sheet; the sandbox Stripe price IDs below are reference-only.
 */
export const OFFER_CONFIGS: OfferConfig[] = [
  {
    slug: 'fine-diet-app',
    // METHOD monthly — standard app + programs subscription (Supabase truth).
    offerKey: 'fine-diet-method-monthly',
    role: 'default-public',
    isActive: true,
    trialDays: 14,
    checkoutMode: 'trial',
    priceLabel: '$24.99',
    priceSuffix: '/mo',
    stripePriceId: 'price_1TeqtSARcbgSDadAsYHKrUMC', // reference-only (sandbox)
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'],
    copy: {
      eyebrow: 'Fine Diet Subscription',
      title: 'Your full Fine Diet app and programs',
      subtitle:
        'One subscription unlocks the app and every Fine Diet program as it runs — journaling, insights, recipes, meal scheduling, and guided programs.',
      ctaLabel: 'Start your 14-day free trial',
      trialNote:
        'Add a payment method to start your 14-day free trial. No charge today — it auto-converts to $24.99/mo unless you cancel.',
      bullets: [
        'Full app access: journal, insights, recipes, meal scheduling',
        'Fine Diet programs included as they run',
        'Your subscription begins automatically after trial unless canceled',
      ],
    },
    image: APP_HERO_IMAGE,
  },
  {
    slug: 'launch',
    // Founder's Launch — one-year offer with an extended trial (Supabase truth).
    offerKey: 'fine-diet-founder-launch-annual',
    role: 'launch-event',
    isActive: true,
    trialDays: 30, // launch event gets a longer trial than the public default
    checkoutMode: 'trial',
    priceLabel: '$129.99',
    priceSuffix: '/yr',
    stripePriceId: 'price_1TequOARcbgSDadAU4olnYXJ', // reference-only (sandbox)
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'],
    copy: {
      eyebrow: 'Founder’s Launch',
      title: 'Founder’s Launch: one year, extended trial',
      subtitle:
        'Join during launch and get an extended trial of the full Fine Diet app and programs, then a founder annual rate.',
      ctaLabel: 'Start your 30-day free trial',
      trialNote:
        'Add a payment method to start your 30-day free trial. No charge today — it auto-converts to $129.99/yr unless you cancel.',
      bullets: [
        'Extended 30-day trial (launch only)',
        'Founder annual rate: $129.99/yr',
        'Full app access plus Fine Diet programs',
      ],
    },
    image: APP_HERO_IMAGE,
  },
  {
    slug: 'buy-now',
    // METHOD annual — immediate-charge annual subscription (Supabase truth).
    offerKey: 'fine-diet-method-annual',
    role: 'buy-now',
    isActive: true,
    trialDays: 0, // buy-now skips trial
    checkoutMode: 'buy_now',
    priceLabel: '$199.99',
    priceSuffix: '/yr',
    stripePriceId: 'price_1TeqtlARcbgSDadACTTRYdaA', // reference-only (sandbox)
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'],
    copy: {
      eyebrow: 'Fine Diet Subscription',
      title: 'Get full access now',
      subtitle:
        'Skip the trial and unlock the full Fine Diet app and programs right away with an annual subscription.',
      ctaLabel: 'Get full access',
      // No trialNote — buy-now intentionally omits trial copy.
      bullets: [
        'Immediate full app access',
        'Fine Diet programs included as they run',
        'Annual access at $199.99/year',
      ],
    },
    image: APP_HERO_IMAGE,
  },
  {
    // Practitioner/care is a SEPARATE premium layer above the baseline app
    // subscription — never folded into the METHOD app-subscription checkout.
    // Pricing ($79–$149/mo) follows the Revenue Strategy sheet; care billing is
    // not wired into the app checkout in this pass.
    slug: 'practitioner',
    offerKey: 'integrative-care-3pay', // existing care offer (unchanged)
    role: 'default-public',
    isActive: true,
    trialDays: 0,
    checkoutMode: 'subscription',
    priceLabel: '$79–$149',
    priceSuffix: '/mo',
    stripePriceId: null, // care pricing remains separate from baseline app checkout
    grantsAccessState: 'practitioner',
    isPractitionerSupported: true,
    entitlementKeys: ['care:integrative'], // TODO(entitlements): + practitioner gate
    copy: {
      eyebrow: 'Practitioner-Supported',
      title: 'Practitioner-supported care',
      subtitle:
        'A separate premium experience layered above the app + program subscription, with practitioner guidance.',
      ctaLabel: 'Explore practitioner care',
      bullets: [
        'Everything in the app + programs subscription',
        'Direct practitioner support',
        'Premium, separate from the standard subscription',
      ],
    },
    image: APP_HERO_IMAGE,
  },
];

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Is the offer active right now (manual flag + optional time window)? */
export function isOfferConfigActive(offer: OfferConfig, now: Date = new Date()): boolean {
  if (!offer.isActive) return false;
  const ts = now.getTime();
  if (offer.startsAt && ts < new Date(offer.startsAt).getTime()) return false;
  if (offer.endsAt && ts > new Date(offer.endsAt).getTime()) return false;
  return true;
}

export function getDefaultPublicOffer(): OfferConfig {
  const def = OFFER_CONFIGS.find(
    (o) => o.role === 'default-public' && !o.isPractitionerSupported && isOfferConfigActive(o),
  );
  // Fall back to the first non-practitioner config so callers always get an offer.
  return def ?? OFFER_CONFIGS.find((o) => !o.isPractitionerSupported) ?? OFFER_CONFIGS[0];
}

export function getOfferConfigBySlug(slug: string): OfferConfig | null {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return OFFER_CONFIGS.find((o) => o.slug === normalized) ?? null;
}

/**
 * Resolve an offer config by its `offerKey` (the Supabase `offers.offer_key`
 * reference). Used by checkout-aware surfaces (e.g. /create-account?ctx=checkout)
 * that receive the offerKey rather than the URL slug. Presentation only — billing
 * truth still comes from Supabase at checkout.
 */
export function getOfferConfigByOfferKey(offerKey: string): OfferConfig | null {
  const normalized = offerKey?.trim();
  if (!normalized) return null;
  return OFFER_CONFIGS.find((o) => o.offerKey === normalized) ?? null;
}

export function getPractitionerOffers(): OfferConfig[] {
  return OFFER_CONFIGS.filter((o) => o.isPractitionerSupported && isOfferConfigActive(o));
}
