import { describe, expect, test } from '@jest/globals';
import {
  findActiveOffersWithoutEntitlementMappings,
  findDuplicateActiveStripePriceIds,
  findInactiveTypoLikeOffers,
  findUnknownActiveOfferEntitlementKeys,
  type OfferReadinessEntitlementMapping,
  type OfferReadinessOffer,
} from '../offerReadinessAudit';
import { isKnownEntitlementKey } from '../constants';

const packet25Offers: OfferReadinessOffer[] = [
  {
    offer_key: 'journal-monthly',
    is_active: true,
    stripe_price_id: 'price_shared_journal',
  },
  {
    offer_key: 'journal-annual',
    is_active: true,
    stripe_price_id: 'price_shared_journal',
  },
  {
    offer_key: 'integrative-care-3pay',
    is_active: true,
    stripe_price_id: '189.89',
  },
  {
    offer_key: 'inegrative-care-3pay',
    is_active: false,
    stripe_price_id: '189.89',
  },
];

const packet25Mappings: OfferReadinessEntitlementMapping[] = [
  {
    offer_key: 'journal-monthly',
    entitlement_key: 'journal',
    is_active: true,
  },
  {
    offer_key: 'journal-annual',
    entitlement_key: 'journal',
    is_active: true,
  },
  {
    offer_key: 'journal-annual',
    entitlement_key: 'program:baseline',
    is_active: true,
  },
  {
    offer_key: 'integrative-care-3pay',
    entitlement_key: 'care:integrative',
    is_active: true,
  },
  {
    offer_key: 'inegrative-care-3pay',
    entitlement_key: '__noop__',
    is_active: false,
  },
];

describe('offer readiness audit helpers', () => {
  test('recognizes care:integrative as the canonical Integrative Care key', () => {
    expect(isKnownEntitlementKey('care:integrative')).toBe(true);
  });

  test('detects active duplicate Stripe Price IDs', () => {
    expect(findDuplicateActiveStripePriceIds(packet25Offers)).toEqual([
      {
        stripe_price_id: 'price_shared_journal',
        offer_keys: ['journal-annual', 'journal-monthly'],
      },
    ]);
  });

  test('recognizes all active packet 25 entitlement mappings', () => {
    expect(
      findUnknownActiveOfferEntitlementKeys(packet25Offers, packet25Mappings),
    ).toEqual([]);
  });

  test('flags unknown active entitlement mappings', () => {
    expect(
      findUnknownActiveOfferEntitlementKeys(packet25Offers, [
        ...packet25Mappings,
        {
          offer_key: 'journal-monthly',
          entitlement_key: 'future:unknown',
          is_active: true,
        },
      ]),
    ).toEqual([
      {
        offer_key: 'journal-monthly',
        entitlement_key: 'future:unknown',
      },
    ]);
  });

  test('reports inactive typo-like offers without treating them as active readiness candidates', () => {
    expect(findInactiveTypoLikeOffers(packet25Offers)).toEqual([
      {
        offer_key: 'inegrative-care-3pay',
        similar_offer_key: 'integrative-care-3pay',
        distance: 1,
      },
    ]);

    expect(
      findActiveOffersWithoutEntitlementMappings(packet25Offers, packet25Mappings),
    ).toEqual([]);
  });
});
