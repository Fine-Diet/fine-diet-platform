/**
 * Offer resolution for the /start surface.
 *
 * Resolves a slug to a configured offer, falling back to the default public
 * offer when the slug is unknown, inactive, or outside its active window.
 */

import {
  type OfferConfig,
  getDefaultPublicOffer,
  getOfferConfigBySlug,
  isOfferConfigActive,
} from './offerConfig';

export type OfferResolutionReason =
  | 'matched'
  | 'fallback_unknown'
  | 'fallback_inactive';

export interface ResolvedOffer {
  offer: OfferConfig;
  usedFallback: boolean;
  reason: OfferResolutionReason;
  /** The slug originally requested (if any), for messaging. */
  requestedSlug: string | null;
}

/**
 * Resolve the offer for /start or /start/[offerSlug].
 * - No slug -> default public offer.
 * - Unknown slug -> default public offer (fallback_unknown).
 * - Known but inactive/expired -> default public offer (fallback_inactive).
 */
export function resolveOfferForSlug(slug?: string | null): ResolvedOffer {
  const requestedSlug = slug ? slug.trim().toLowerCase() : null;

  if (!requestedSlug) {
    return {
      offer: getDefaultPublicOffer(),
      usedFallback: false,
      reason: 'matched',
      requestedSlug: null,
    };
  }

  const match = getOfferConfigBySlug(requestedSlug);

  if (!match) {
    return {
      offer: getDefaultPublicOffer(),
      usedFallback: true,
      reason: 'fallback_unknown',
      requestedSlug,
    };
  }

  if (!isOfferConfigActive(match)) {
    return {
      offer: getDefaultPublicOffer(),
      usedFallback: true,
      reason: 'fallback_inactive',
      requestedSlug,
    };
  }

  return {
    offer: match,
    usedFallback: false,
    reason: 'matched',
    requestedSlug,
  };
}
