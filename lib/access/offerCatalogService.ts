/**
 * Offer catalog service — marketing-safe projection of the offer config.
 *
 * Pure (no server-only imports) so SSR, API, and client can share it. NEVER
 * includes Stripe price IDs or other charge-sensitive fields in the DTO.
 */

import {
  OFFER_CONFIGS,
  isOfferConfigActive,
  type OfferConfig,
  type OfferCheckoutMode,
  type OfferRole,
} from './offerConfig';
import type { GrantedAccessTier } from './accessStateTypes';

/** Serializable copy (optionals are null, never undefined). */
export interface MarketingOfferCopy {
  eyebrow: string | null;
  title: string;
  subtitle: string;
  ctaLabel: string;
  trialNote: string | null;
  bullets: string[];
}

/** Marketing-safe offer shape sent to clients. No Stripe IDs. */
export interface OfferMarketingDTO {
  slug: string;
  offerKey: string;
  role: OfferRole;
  trialDays: number;
  checkoutMode: OfferCheckoutMode;
  priceLabel: string;
  /** null (not undefined) so it stays JSON-serializable through getServerSideProps. */
  priceSuffix: string | null;
  grantsAccessState: GrantedAccessTier;
  isPractitionerSupported: boolean;
  /** Entitlement keys this offer grants — used for client owned-state. */
  entitlementKeys: string[];
  copy: MarketingOfferCopy;
  image: string | null;
}

export function toMarketingDTO(offer: OfferConfig): OfferMarketingDTO {
  return {
    slug: offer.slug,
    offerKey: offer.offerKey,
    role: offer.role,
    trialDays: offer.trialDays,
    checkoutMode: offer.checkoutMode,
    priceLabel: offer.priceLabel,
    priceSuffix: offer.priceSuffix ?? null,
    grantsAccessState: offer.grantsAccessState,
    isPractitionerSupported: Boolean(offer.isPractitionerSupported),
    entitlementKeys: offer.entitlementKeys,
    copy: {
      eyebrow: offer.copy.eyebrow ?? null,
      title: offer.copy.title,
      subtitle: offer.copy.subtitle,
      ctaLabel: offer.copy.ctaLabel,
      trialNote: offer.copy.trialNote ?? null,
      bullets: offer.copy.bullets,
    },
    image: offer.image ?? null,
  };
}

export interface ListOffersParams {
  /** Only practitioner-supported, only baseline, or all. */
  kind?: 'all' | 'baseline' | 'practitioner';
  includeInactive?: boolean;
}

/** List marketing-safe offers, active-only by default. */
export function listMarketingOffers(params: ListOffersParams = {}): OfferMarketingDTO[] {
  const { kind = 'all', includeInactive = false } = params;
  return OFFER_CONFIGS.filter((o) => {
    if (!includeInactive && !isOfferConfigActive(o)) return false;
    if (kind === 'baseline' && o.isPractitionerSupported) return false;
    if (kind === 'practitioner' && !o.isPractitionerSupported) return false;
    return true;
  }).map(toMarketingDTO);
}
