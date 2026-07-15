import type { GroceryItem, GroceryShoppingOverride } from '../types';
import { buildShoppingOverrideBundle } from '../groceryShoppingOverrideMatching';

function sampleOverride(matchKey: string, status: GroceryShoppingOverride['match_status'] = 'active'): GroceryShoppingOverride {
  return {
    id: `override-${matchKey}`,
    person_id: 'person-1',
    plan_id: 'plan-1',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    match_key: matchKey,
    food_object_id: matchKey.startsWith('food') ? 'food-1' : null,
    unresolved_name: matchKey.startsWith('food') ? null : 'spinach',
    unresolved_unit: 'cup',
    shopping_display_name: 'Frozen chopped spinach',
    purchase_quantity: 1,
    purchase_unit: 'bag',
    preferred_product: null,
    aisle_category: null,
    note: null,
    match_status: status,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
  };
}

function sampleItem(matchKey: string): Pick<GroceryItem, 'food_object_id' | 'name' | 'unit'> {
  if (matchKey.startsWith('food')) {
    return { food_object_id: 'food-1', name: 'Spinach', unit: 'cup' };
  }
  return { food_object_id: null, name: 'spinach', unit: 'cup' };
}

describe('buildShoppingOverrideBundle', () => {
  it('reapplies active overrides only to exact match keys', () => {
    const bundle = buildShoppingOverrideBundle(
      [sampleOverride('food-1::cup'), sampleOverride('kale::cup')],
      new Set(['food-1::cup']),
    );
    expect(bundle.by_match_key['food-1::cup']?.shopping_display_name).toBe('Frozen chopped spinach');
    expect(bundle.unmatched).toHaveLength(1);
    expect(bundle.unmatched[0]?.match_key).toBe('kale::cup');
  });

  it('keeps unmatched overrides explicit instead of moving them', () => {
    const bundle = buildShoppingOverrideBundle(
      [sampleOverride('spinach::cup', 'unmatched')],
      new Set(['kale::cup']),
    );
    expect(bundle.by_match_key['spinach::cup']).toBeUndefined();
    expect(bundle.unmatched[0]?.match_status).toBe('unmatched');
  });

  it('does not attach a similar but different ingredient override', () => {
    const bundle = buildShoppingOverrideBundle(
      [sampleOverride('spinach::cup')],
      new Set(['baby spinach::cup']),
    );
    expect(Object.keys(bundle.by_match_key)).toHaveLength(0);
    expect(bundle.unmatched[0]?.match_key).toBe('spinach::cup');
  });
});
