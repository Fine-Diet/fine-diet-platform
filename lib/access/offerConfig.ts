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
 * subscription offer keys + real Stripe price IDs when available.
 */
export const OFFER_CONFIGS: OfferConfig[] = [
  {
    slug: 'fine-diet-app',
    offerKey: 'journal-annual', // TODO(offer): swap to the dedicated app subscription offer key
    role: 'default-public',
    isActive: true,
    trialDays: 7,
    checkoutMode: 'trial',
    priceLabel: '$19',
    priceSuffix: '/mo',
    stripePriceId: null, // TODO(stripe)
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'], // TODO(entitlements): finalize counts
    copy: {
      eyebrow: 'Fine Diet Subscription',
      title: 'Your full Fine Diet app and programs',
      subtitle:
        'One subscription unlocks the app and every Fine Diet program as it runs — journaling, insights, recipes, meal scheduling, and guided programs.',
      ctaLabel: 'Start your free trial',
      trialNote: 'Start with a 7-day free trial. Cancel anytime.',
      bullets: [
        'Full app access: journal, insights, recipes, meal scheduling',
        'Fine Diet programs included as they run',
        'Keep your account and saved data even if you pause',
      ],
    },
    image: APP_HERO_IMAGE,
  },
  {
    slug: 'launch',
    offerKey: 'journal-annual', // TODO(offer): dedicated launch-event offer key
    role: 'launch-event',
    isActive: true,
    trialDays: 14, // launch event gets a longer trial than the public default
    checkoutMode: 'trial',
    priceLabel: '$19',
    priceSuffix: '/mo',
    stripePriceId: null, // TODO(stripe)
    grantsAccessState: 'app_plus_programs',
    entitlementKeys: ['journal', 'program:baseline'], // TODO(entitlements)
    copy: {
      eyebrow: 'Launch Event',
      title: 'Launch offer: extended free trial',
      subtitle:
        'Join during launch and get an extended trial of the full Fine Diet app and programs.',
      ctaLabel: 'Claim 14-day trial',
      trialNote: 'Launch offer: 14-day free trial. Cancel anytime.',
      bullets: [
        'Extended 14-day trial (launch only)',
        'Full app access plus Fine Diet programs',
        'Keep your account and saved data even if you pause',
      ],
    },
    image: APP_HERO_IMAGE,
  },
  {
    slug: 'buy-now',
    offerKey: 'journal-onetime', // TODO(offer): dedicated buy-now offer key
    role: 'buy-now',
    isActive: true,
    trialDays: 0, // buy-now skips trial
    checkoutMode: 'buy_now',
    priceLabel: '$199',
    priceSuffix: '/yr',
    stripePriceId: null, // TODO(stripe)
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
        'Keep your account and saved data even if you pause',
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
    priceLabel: 'From $525',
    stripePriceId: null, // TODO(stripe)
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
