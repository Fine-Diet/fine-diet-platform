import { computeFullHaulEstimate } from '../fullHaulEstimate';
import { extractPlanScopesFromPersistentItems } from '../persistentGroceryHaulScopes';
import type { GroceryItem } from '../types';

function item(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id' | 'name'>): GroceryItem {
  return {
    grocery_list_id: 'list-durable',
    person_id: 'person-1',
    quantity: 1,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-1',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('persistent grocery haul observation preference', () => {
  it('extracts distinct plan+date scopes from durable items', () => {
    const items = [
      item({
        id: 'a',
        name: 'spinach',
        source_type: 'planned_meal',
        source_id: 'plan-a',
        source_detail_json: { date_range_start: '2026-07-30', date_range_end: '2026-07-30' },
      }),
      item({
        id: 'b',
        name: 'spinach',
        food_object_id: 'food-1',
        source_type: 'planned_meal',
        source_id: 'plan-a',
        source_detail_json: { date_range_start: '2026-08-01', date_range_end: '2026-08-01' },
      }),
      item({
        id: 'c',
        name: 'oats',
        source_type: 'manual',
      }),
    ];

    expect(extractPlanScopesFromPersistentItems(items)).toEqual([
      { planId: 'plan-a', dateStart: '2026-07-30', dateEnd: '2026-07-30' },
      { planId: 'plan-a', dateStart: '2026-08-01', dateEnd: '2026-08-01' },
    ]);
  });

  it('prefers per-item observations so the same match_key can differ across batches', () => {
    const week1 = item({
      id: 'item-week1',
      name: 'spinach',
      food_object_id: 'food-spinach',
      unit: 'cup',
      source_type: 'planned_meal',
      source_id: 'plan-a',
      source_detail_json: { date_range_start: '2026-07-30', date_range_end: '2026-07-30' },
    });
    const week2 = item({
      id: 'item-week2',
      name: 'spinach',
      food_object_id: 'food-spinach',
      unit: 'cup',
      source_type: 'planned_meal',
      source_id: 'plan-a',
      source_detail_json: { date_range_start: '2026-08-06', date_range_end: '2026-08-06' },
    });

    // Ambiguous match-key map would only keep one price; item map keeps both.
    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-durable',
      items: [week1, week2],
      observationsByMatchKey: new Map([
        [
          'food-spinach::cup',
          {
            line_total: 3,
            currency: 'USD',
            source: 'manual',
            match_confidence: 0.9,
            retrieved_at: '2026-07-30T00:00:00.000Z',
            package_size: 1,
          },
        ],
      ]),
      observationsByItemId: new Map([
        [
          'item-week1',
          {
            line_total: 4,
            currency: 'USD',
            source: 'manual',
            match_confidence: 0.9,
            retrieved_at: '2026-07-30T00:00:00.000Z',
            package_size: 1,
          },
        ],
        [
          'item-week2',
          {
            line_total: 5,
            currency: 'USD',
            source: 'manual',
            match_confidence: 0.9,
            retrieved_at: '2026-08-06T00:00:00.000Z',
            package_size: 1,
          },
        ],
      ]),
      planLabels: { 'plan-a': 'Weekly plan' },
    });

    expect(estimate.estimated_merchandise_subtotal).toBe(9);
    expect(estimate.priced_item_count).toBe(2);
    expect(estimate.segments).toHaveLength(1);
    expect(estimate.segments[0]?.estimated_merchandise_subtotal).toBe(9);
  });
});
