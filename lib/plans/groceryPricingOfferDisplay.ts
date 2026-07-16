/**
 * Offer list display limits for grocery price search UI.
 */

import type { GroceryPriceSearchOffer } from './groceryPricingTypes';

export const GROCERY_PRICE_INITIAL_OFFER_COUNT = 5;
export const GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS = 12;

export function capConfirmableOffers<T extends { provider_result_id: string }>(
  offers: T[],
): T[] {
  return offers.slice(0, GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
}

export function getVisibleOfferCount(
  expanded: boolean,
  totalOffers: number,
): number {
  const capped = Math.min(totalOffers, GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
  if (expanded) return capped;
  return Math.min(capped, GROCERY_PRICE_INITIAL_OFFER_COUNT);
}

export function canShowMoreOffers(
  expanded: boolean,
  totalOffers: number,
): boolean {
  const capped = Math.min(totalOffers, GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
  return !expanded && capped > GROCERY_PRICE_INITIAL_OFFER_COUNT;
}

export function sliceOffersForDisplay(
  offers: GroceryPriceSearchOffer[],
  expanded: boolean,
): GroceryPriceSearchOffer[] {
  return offers.slice(0, getVisibleOfferCount(expanded, offers.length));
}
