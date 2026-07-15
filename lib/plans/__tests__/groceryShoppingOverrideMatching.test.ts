import type { GroceryShoppingOverride } from '../types';
import { buildShoppingOverrideBundle } from '../groceryShoppingOverrideMatching';

function sampleOverride(
  matchKey: string,
  scope: { start: string; end: string },
  status: GroceryShoppingOverride['match_status'] = 'active',
  idSuffix = 'a',
): GroceryShoppingOverride {
  return {
    id: `override-${idSuffix}`,
    person_id: 'person-1',
    plan_id: 'plan-1',
    date_range_start: scope.start,
    date_range_end: scope.end,
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

describe('buildShoppingOverrideBundle', () => {
  const dayScope = { planId: 'plan-1', dateStart: '2026-07-15', dateEnd: '2026-07-15' };

  it('reapplies active overrides only to exact match keys', () => {
    const bundle = buildShoppingOverrideBundle(
      [sampleOverride('food-1::cup', { start: '2026-07-15', end: '2026-07-15' }), sampleOverride('kale::cup', { start: '2026-07-15', end: '2026-07-15' }, 'active', 'b')],
      new Set(['food-1::cup']),
      dayScope,
    );
    expect(bundle.by_match_key['food-1::cup']?.shopping_display_name).toBe('Frozen chopped spinach');
    expect(bundle.unmatched).toHaveLength(1);
    expect(bundle.unmatched[0]?.match_key).toBe('kale::cup');
  });

  it('reattaches overrides when match key is present even if status is stale unmatched', () => {
    const bundle = buildShoppingOverrideBundle(
      [sampleOverride('food-1::cup', { start: '2026-07-15', end: '2026-07-15' }, 'unmatched')],
      new Set(['food-1::cup']),
      dayScope,
    );
    expect(bundle.by_match_key['food-1::cup']?.match_status).toBe('unmatched');
    expect(bundle.unmatched).toHaveLength(0);
  });

  it('prefers exact-scope overrides over broader containing-range overrides', () => {
    const bundle = buildShoppingOverrideBundle(
      [
        sampleOverride('food-1::cup', { start: '2026-07-14', end: '2026-07-20' }, 'active', 'week'),
        sampleOverride('food-1::cup', { start: '2026-07-15', end: '2026-07-15' }, 'active', 'day'),
      ],
      new Set(['food-1::cup']),
      dayScope,
    );
    expect(bundle.by_match_key['food-1::cup']?.id).toBe('override-day');
  });

  it('keeps unmatched overrides explicit instead of moving them', () => {
    const bundle = buildShoppingOverrideBundle(
      [sampleOverride('spinach::cup', { start: '2026-07-15', end: '2026-07-15' }, 'unmatched')],
      new Set(['kale::cup']),
      dayScope,
    );
    expect(bundle.by_match_key['spinach::cup']).toBeUndefined();
    expect(bundle.unmatched[0]?.match_status).toBe('unmatched');
  });
});
