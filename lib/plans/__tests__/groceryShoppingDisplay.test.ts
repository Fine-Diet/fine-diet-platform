import {
  formatCanonicalFoodShoppingLabel,
  hasUserShoppingCustomization,
  resolveGroceryShoppingDisplayName,
} from '../groceryShoppingDisplay';
import type { GroceryShoppingOverride } from '../types';

function sampleOverride(
  partial: Partial<GroceryShoppingOverride> = {},
): GroceryShoppingOverride {
  return {
    id: 'override-1',
    person_id: 'person-1',
    plan_id: 'plan-1',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    match_key: 'food-1::cup',
    food_object_id: 'food-1',
    unresolved_name: null,
    unresolved_unit: null,
    shopping_display_name: null,
    purchase_quantity: null,
    purchase_unit: null,
    preferred_product: null,
    aisle_category: null,
    note: null,
    match_status: 'active',
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('groceryShoppingDisplay', () => {
  it('formats branded canonical food labels', () => {
    expect(
      formatCanonicalFoodShoppingLabel({
        canonical_name: 'Baby Spinach',
        brand_name: 'Organic Girl',
      }),
    ).toBe('Organic Girl — Baby Spinach');
  });

  it('applies display precedence: explicit override, resolved product, required name', () => {
    expect(
      resolveGroceryShoppingDisplayName({
        requiredName: 'spinach',
        override: sampleOverride({ shopping_display_name: 'Family-size frozen spinach' }),
        resolvedProductLabel: 'Brand — Baby Spinach',
      }),
    ).toBe('Family-size frozen spinach');

    expect(
      resolveGroceryShoppingDisplayName({
        requiredName: 'spinach',
        override: null,
        resolvedProductLabel: 'Brand — Baby Spinach',
      }),
    ).toBe('Brand — Baby Spinach');

    expect(
      resolveGroceryShoppingDisplayName({
        requiredName: 'spinach',
        override: null,
        resolvedProductLabel: null,
      }),
    ).toBe('spinach');
  });

  it('treats resolution-seeded display names as non-customized until user edits', () => {
    const resolvedLabel = 'Brand — Baby Spinach';
    expect(
      hasUserShoppingCustomization(
        sampleOverride({ shopping_display_name: resolvedLabel }),
        resolvedLabel,
      ),
    ).toBe(false);
    expect(
      hasUserShoppingCustomization(
        sampleOverride({
          shopping_display_name: 'Different shopper label',
        }),
        resolvedLabel,
      ),
    ).toBe(true);
    expect(
      hasUserShoppingCustomization(
        sampleOverride({ purchase_quantity: 1, purchase_unit: 'bag' }),
        resolvedLabel,
      ),
    ).toBe(true);
  });
});
