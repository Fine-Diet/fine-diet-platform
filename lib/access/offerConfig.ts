/**
 * Offer configuration — code-owned source of truth for the app subscription /
 * start surface.
 *
 * This is intentionally pure data (no server imports) so it can be consumed by
 * both server (SSR, API) and client code. Charging truth still lives in the
 * `offers` DB row + Stripe; this config owns *presentation* + *behavior* per
 * offer (slug routing, trial length, checkout mode, pricing label, access state
 * granted, marketing copy).
 *
 * Stripe price IDs and final entitlement counts are placeholders/TODOs until
 * confirmed — see `stripePriceId` and `entitlementKeys` below.
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
  /** Display-only price label (e.g. "$19/mo"). Not the charge source of truth. */
  priceLabel: string;
  priceSuffix?: string;
  /** TODO(stripe): real Stripe price ID. Checkout reads offers DB today; placeholder here. */
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
 * NOTE: offerKeys reference existing `offers` rows so the existing checkout
 * (/api/checkout/create) keeps working. Replace with the dedicated app
 * subscription offer keys when the offers table rows are created.
 *
 * Pricing source: Google Sheet "REVENUE STRATEGY — Fine Diet™"
 * - METHOD: $24.99/month, $199.99/year
 * - FOUNDER'S LAUNCH — ONE YEAR: $129.99/year
 * Stripe IDs below are sandbox/test-mode prices in the connected
 * FINE DIET Platform sandbox account. Billing truth still lives in Stripe +
 * the offers DB; these values are presentation/reference only until the DB rows
 * are wired.
 */
export const OFFER_CONFIGS: OfferConfig[] = [
  {
    slug: 'fine-diet-app',
    offerKey: 'journal-annual', // TODO(offer): swap to dedicated app subscription offer key
    role: 'default-public',
    isActive: true,
    trialDays: 14,
    checkoutMode: 'trial',
    priceLabel: '$24.99',
    priceSuffix: '/mo',
    stripePriceId: 'price_1TeqtSARcbgSDadAsYHKrUMC', // sandbox METHOD monthly
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'], // TODO(entitlements): finalize counts
    copy: {
      eyebrow: 'Fine Diet Subscription',
      title: 'Your full Fine Diet app and programs',
      subtitle:
        'One subscription unlocks the app and every Fine Diet program as it runs — journaling, insights, recipes, meal scheduling, and guided programs.',
      ctaLabel: 'Start 14-day trial',
      trialNote:
        'Start with a 14-day trial. Payment method required. You will not be charged today.',
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
    offerKey: 'journal-annual', // TODO(offer): dedicated launch-event offer key
    role: 'launch-event',
    isActive: true,
    trialDays: 30, // launch event gets a longer trial than the public default
    checkoutMode: 'trial',
    priceLabel: '$129.99',
    priceSuffix: '/yr',
    stripePriceId: 'price_1TequOARcbgSDadAU4olnYXJ', // sandbox founder launch annual
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'], // TODO(entitlements)
    copy: {
      eyebrow: 'Launch Event',
      title: 'Launch offer: extended free trial',
      subtitle:
        'Join during launch and get an extended trial of the full Fine Diet app and programs, then continue with the founder launch annual offer.',
      ctaLabel: 'Claim 30-day launch trial',
      trialNote:
        'Launch offer: 30-day trial. Payment method required. You will not be charged today.',
      bullets: [
        'Extended 30-day trial (launch only)',
        'Founder launch annual access at $129.99/year after trial unless canceled',
        'Full app access plus Fine Diet programs',
      ],
    },
    image: APP_HERO_IMAGE,
  },
  {
    slug: 'buy-now',
    offerKey: 'journal-onetime', // TODO(offer): dedicated buy-now/subscription offer key
    role: 'buy-now',
    isActive: true,
    trialDays: 0, // buy-now skips trial
    checkoutMode: 'buy_now',
    priceLabel: '$199.99',
    priceSuffix: '/yr',
    stripePriceId: 'price_1TeqtlARcbgSDadACTTRYdaA', // sandbox METHOD annual
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'], // TODO(entitlements)
    copy: {
      eyebrow: 'Fine Diet Subscription',
      title: 'Get full access now',
      subtitle:
        'Skip the trial and unlock the full Fine Diet app and programs right away.',
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
    slug: 'practitioner',
    offerKey: 'integrative-care-3pay', // existing care offer
    role: 'default-public',
    isActive: true,
    trialDays: 0,
    checkoutMode: 'subscription',
    priceLabel: '$79–$149',
    priceSuffix: '/mo',
    stripePriceId: null, // TODO(stripe): care pricing remains separate from baseline app checkout
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

export function getPractitionerOffers(): OfferConfig[] {
  return OFFER_CONFIGS.filter((o) => o.isPractitionerSupported && isOfferConfigActive(o));
}
