import {
  canShowMoreOffers,
  capConfirmableOffers,
  getVisibleOfferCount,
  GROCERY_PRICE_INITIAL_OFFER_COUNT,
  GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS,
  sliceOffersForDisplay,
} from '../groceryPricingOfferDisplay';

function makeOffers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    provider: 'serpapi' as const,
    provider_result_id: `offer-${index}`,
    title: `Product ${index}`,
    retailer: 'Target',
    price: 1 + index,
    currency: 'USD',
    package_size: null,
    package_unit: null,
    product_url: null,
    image_url: null,
    location_label: null,
    match_confidence: 0.8,
    match_reasons: [],
  }));
}

describe('groceryPricingOfferDisplay', () => {
  it('caps confirmable offers at 12', () => {
    const offers = makeOffers(20);
    expect(capConfirmableOffers(offers)).toHaveLength(GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
    expect(capConfirmableOffers(offers)[11]?.provider_result_id).toBe('offer-11');
  });

  it('shows 5 offers initially and expands up to 12', () => {
    const offers = makeOffers(15);
    expect(getVisibleOfferCount(false, offers.length)).toBe(GROCERY_PRICE_INITIAL_OFFER_COUNT);
    expect(getVisibleOfferCount(true, offers.length)).toBe(GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
    expect(canShowMoreOffers(false, offers.length)).toBe(true);
    expect(canShowMoreOffers(true, offers.length)).toBe(false);
    expect(sliceOffersForDisplay(offers, false)).toHaveLength(GROCERY_PRICE_INITIAL_OFFER_COUNT);
    expect(sliceOffersForDisplay(offers, true)).toHaveLength(GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
  });

  it('does not offer show-more when total offers are at or below the initial count', () => {
    const offers = makeOffers(4);
    expect(canShowMoreOffers(false, offers.length)).toBe(false);
    expect(sliceOffersForDisplay(offers, false)).toHaveLength(4);
  });
});
