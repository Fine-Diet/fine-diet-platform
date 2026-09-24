import type { GroceryHaulItem, GroceryListPriceObservation } from '@/lib/plans/types';

import {
  assertHaulListQuoteCompatible,
  haulListQuoteCompatibleWithPreparedProduct,
} from '../haulListQuoteCompatibility';

function item(
  overrides: Partial<Pick<GroceryHaulItem, 'selected_food_object_id' | 'product_title'>> = {},
): Pick<GroceryHaulItem, 'selected_food_object_id' | 'product_title'> {
  return {
    selected_food_object_id: 'food-a',
    product_title: 'Baby Spinach',
    ...overrides,
  };
}

function observation(
  overrides: Partial<
    Pick<GroceryListPriceObservation, 'food_object_id' | 'product_title' | 'currency'>
  > = {},
): Pick<GroceryListPriceObservation, 'food_object_id' | 'product_title' | 'currency'> {
  return {
    food_object_id: 'food-a',
    product_title: 'Organic Baby Spinach',
    currency: 'USD',
    ...overrides,
  };
}

describe('haulListQuoteCompatibility', () => {
  it('matches quotes by food_object_id and haul currency', () => {
    expect(haulListQuoteCompatibleWithPreparedProduct(observation(), item(), 'USD')).toBe(true);
    expect(haulListQuoteCompatibleWithPreparedProduct(observation({ currency: 'EUR' }), item(), 'USD')).toBe(
      false,
    );
    expect(
      haulListQuoteCompatibleWithPreparedProduct(observation({ food_object_id: 'food-b' }), item(), 'USD'),
    ).toBe(false);
  });

  it('falls back to conservative title-only match when neither side has a food id', () => {
    expect(
      haulListQuoteCompatibleWithPreparedProduct(
        observation({ food_object_id: null, product_title: 'Baby Spinach 5oz' }),
        item({ selected_food_object_id: null, product_title: 'Baby Spinach' }),
        'USD',
      ),
    ).toBe(true);
    expect(
      haulListQuoteCompatibleWithPreparedProduct(
        observation({ food_object_id: null, product_title: 'Pineapple' }),
        item({ selected_food_object_id: null, product_title: 'Apple' }),
        'USD',
      ),
    ).toBe(false);
  });

  it('throws when a quote is incompatible with prepared product context', () => {
    expect(() =>
      assertHaulListQuoteCompatible(observation({ food_object_id: 'food-b' }), item(), 'USD'),
    ).toThrow(/not compatible/i);
  });
});
