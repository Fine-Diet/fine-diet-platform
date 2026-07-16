import {
  buildShoppingOverridePayloadAfterPackageMerge,
  buildShoppingPackageMergeFromOffer,
  formatAvailablePackageLabel,
} from '../groceryPricePackageDetails';
import type { GroceryShoppingOverride } from '../types';

describe('groceryPricePackageDetails', () => {
  it('formats available package labels for preview display', () => {
    expect(formatAvailablePackageLabel(5, 'oz')).toBe('5 oz');
    expect(formatAvailablePackageLabel(5, null)).toBe('5');
    expect(formatAvailablePackageLabel(null, 'bag')).toBe('bag');
    expect(formatAvailablePackageLabel(null, null)).toBeNull();
  });

  it('fills only empty shopping package fields from an offer', () => {
    expect(
      buildShoppingPackageMergeFromOffer(
        { package_size: 5, package_unit: 'oz' },
        null,
      ),
    ).toEqual({
      purchase_quantity: 5,
      purchase_unit: 'oz',
    });

    expect(
      buildShoppingPackageMergeFromOffer(
        { package_size: 5, package_unit: 'oz' },
        { purchase_quantity: 2, purchase_unit: 'bag' },
      ),
    ).toBeNull();
  });

  it('fills only the missing shopping package field when one is already set', () => {
    expect(
      buildShoppingPackageMergeFromOffer(
        { package_size: 5, package_unit: 'oz' },
        { purchase_quantity: 2, purchase_unit: null },
      ),
    ).toEqual({
      purchase_quantity: 2,
      purchase_unit: 'oz',
    });
  });

  it('does not copy package count into purchase quantity', () => {
    const merged = buildShoppingPackageMergeFromOffer(
      { package_size: 5, package_unit: 'oz' },
      { purchase_quantity: null, purchase_unit: null },
    );
    expect(merged?.purchase_quantity).toBe(5);
    expect(merged?.purchase_quantity).not.toBe(3);
  });

  it('preserves existing shopping override fields when merging package details', () => {
    const existing = {
      id: 'override-1',
      person_id: 'person-1',
      plan_id: 'plan-1',
      date_range_start: '2026-07-15',
      date_range_end: '2026-07-15',
      match_key: 'food-1::cup',
      food_object_id: 'food-1',
      unresolved_name: null,
      unresolved_unit: 'cup',
      shopping_display_name: 'Baby Spinach',
      purchase_quantity: null,
      purchase_unit: 'bag',
      preferred_product: 'Organic Girl',
      aisle_category: 'Produce',
      note: 'Keep cold',
      match_status: 'active' as const,
      created_at: '',
      updated_at: '',
    } satisfies GroceryShoppingOverride;

    const payload = buildShoppingOverridePayloadAfterPackageMerge(
      {
        id: 'item-1',
        grocery_list_id: 'list-1',
        person_id: 'person-1',
        name: 'spinach',
        quantity: 2,
        unit: 'cup',
        aisle_category: 'Produce',
        food_object_id: 'food-1',
        source_planned_meal_ids: [],
        status: 'pending',
        notes: null,
      },
      existing,
      { purchase_quantity: 5, purchase_unit: 'bag' },
    );

    expect(payload.shopping_display_name).toBe('Baby Spinach');
    expect(payload.preferred_product).toBe('Organic Girl');
    expect(payload.note).toBe('Keep cold');
    expect(payload.purchase_quantity).toBe(5);
    expect(payload.purchase_unit).toBe('bag');
  });
});
