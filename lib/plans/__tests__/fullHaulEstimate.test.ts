import {
  computeFullHaulEstimate,
  type FullHaulContributionShare,
} from '../fullHaulEstimate';
import type { GroceryItem } from '../types';
import type { GroceryPriceObservation } from '../groceryPricingTypes';

function item(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id' | 'name'>): GroceryItem {
  return {
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    quantity: 1,
    unit: 'each',
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

function obs(
  overrides: Partial<GroceryPriceObservation> & Pick<GroceryPriceObservation, 'match_key' | 'line_total'>,
): Pick<
  GroceryPriceObservation,
  'line_total' | 'currency' | 'source' | 'match_confidence' | 'retrieved_at' | 'package_size'
> & { match_key: string } {
  return {
    currency: 'USD',
    source: 'manual',
    match_confidence: 0.9,
    retrieved_at: '2026-07-30T00:00:00.000Z',
    package_size: 1,
    ...overrides,
  };
}

describe('computeFullHaulEstimate', () => {
  it('counts each priced row once and discloses excluded tax by default', () => {
    const spinach = item({
      id: 'item-1',
      name: 'spinach',
      food_object_id: 'food-spinach',
      unit: 'cup',
      quantity: 2,
      source_type: 'planned_meal',
      source_id: 'plan-a',
    });
    const oats = item({
      id: 'item-2',
      name: 'oats',
      food_object_id: 'food-oats',
      unit: 'cup',
      quantity: 1,
      source_type: 'manual',
    });

    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [spinach, oats],
      observationsByMatchKey: new Map([
        ['food-spinach::cup', obs({ match_key: 'food-spinach::cup', line_total: 4 })],
        ['food-oats::cup', obs({ match_key: 'food-oats::cup', line_total: 6 })],
      ]),
      planLabels: { 'plan-a': 'Weeknight dinners' },
    });

    expect(estimate.estimated_merchandise_subtotal).toBe(10);
    expect(estimate.estimated_tax).toBeNull();
    expect(estimate.tax_status).toBe('excluded');
    expect(estimate.tax_disclosure).toMatch(/tax is excluded/i);
    expect(estimate.estimated_total).toBe(10);
    expect(estimate.priced_item_count).toBe(2);
    expect(estimate.unpriced_item_count).toBe(0);
    expect(estimate.priced_coverage_percent).toBe(100);

    const planSeg = estimate.segments.find((s) => s.segment_key === 'plan:plan-a');
    const manualSeg = estimate.segments.find((s) => s.segment_key === 'household_manual');
    expect(planSeg?.estimated_merchandise_subtotal).toBe(4);
    expect(planSeg?.label).toBe('Weeknight dinners');
    expect(manualSeg?.estimated_merchandise_subtotal).toBe(6);

    const segmentSum = estimate.segments.reduce(
      (acc, s) => acc + s.estimated_merchandise_subtotal,
      0,
    );
    expect(segmentSum).toBe(estimate.estimated_merchandise_subtotal);
  });

  it('never double-counts a merged item across quantity-share segments', () => {
    const milk = item({
      id: 'item-milk',
      name: 'milk',
      food_object_id: 'food-milk',
      unit: 'cup',
      quantity: 4,
      source_type: 'planned_meal',
      source_id: 'plan-a',
    });

    const shares: FullHaulContributionShare[] = [
      {
        segment_key: 'plan:plan-a',
        kind: 'plan',
        label: 'Plan A',
        source_id: 'plan-a',
        quantity: 3,
      },
      {
        segment_key: 'plan:plan-b',
        kind: 'plan',
        label: 'Plan B',
        source_id: 'plan-b',
        quantity: 1,
      },
    ];

    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [milk],
      observationsByMatchKey: new Map([
        ['food-milk::cup', obs({ match_key: 'food-milk::cup', line_total: 8 })],
      ]),
      contributionSharesByItemId: { 'item-milk': shares },
    });

    expect(estimate.estimated_merchandise_subtotal).toBe(8);
    expect(estimate.priced_item_count).toBe(1);

    const a = estimate.segments.find((s) => s.segment_key === 'plan:plan-a');
    const b = estimate.segments.find((s) => s.segment_key === 'plan:plan-b');
    expect(a?.estimated_merchandise_subtotal).toBe(6);
    expect(b?.estimated_merchandise_subtotal).toBe(2);
    expect(a?.allocation_mode).toBe('quantity_share');
    expect(estimate.segments.find((s) => s.kind === 'shared_unallocated')).toBeUndefined();

    const segmentSum = estimate.segments.reduce(
      (acc, s) => acc + s.estimated_merchandise_subtotal,
      0,
    );
    expect(segmentSum).toBe(8);
  });

  it('puts unreliable multi-source costs into Shared / Unallocated', () => {
    const eggs = item({
      id: 'item-eggs',
      name: 'eggs',
      food_object_id: 'food-eggs',
      unit: 'each',
      quantity: 12,
      source_type: 'planned_meal',
      source_id: 'plan-a',
    });

    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [eggs],
      observationsByMatchKey: new Map([
        ['food-eggs::item', obs({ match_key: 'food-eggs::item', line_total: 5 })],
      ]),
      contributionSharesByItemId: {
        'item-eggs': [
          {
            segment_key: 'plan:plan-a',
            kind: 'plan',
            label: 'Plan A',
            source_id: 'plan-a',
            quantity: 8,
          },
          {
            segment_key: 'plan:plan-b',
            kind: 'plan',
            label: 'Plan B',
            source_id: 'plan-b',
            // Sum 8+8=16 ≠ required 12 → unreliable
            quantity: 8,
          },
        ],
      },
    });

    expect(estimate.estimated_merchandise_subtotal).toBe(5);
    expect(estimate.segments).toHaveLength(1);
    expect(estimate.segments[0]?.kind).toBe('shared_unallocated');
    expect(estimate.segments[0]?.estimated_merchandise_subtotal).toBe(5);
  });

  it('falls back to list plan id when foundation provenance is absent', () => {
    const rice = item({
      id: 'item-rice',
      name: 'rice',
      food_object_id: 'food-rice',
      unit: 'cup',
      quantity: 2,
    });

    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [rice],
      listPlanId: 'plan-scoped',
      planLabels: { 'plan-scoped': 'Summer plan' },
      observationsByMatchKey: new Map([
        ['food-rice::cup', obs({ match_key: 'food-rice::cup', line_total: 3.5 })],
      ]),
    });

    expect(estimate.segments[0]).toMatchObject({
      segment_key: 'plan:plan-scoped',
      label: 'Summer plan',
      estimated_merchandise_subtotal: 3.5,
      allocation_mode: 'exclusive',
    });
  });

  it('adds estimated tax only into Full Haul total, not segment merchandise', () => {
    const bread = item({
      id: 'item-bread',
      name: 'bread',
      food_object_id: 'food-bread',
      unit: 'loaf',
      quantity: 1,
      source_type: 'manual',
    });

    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [bread],
      observationsByMatchKey: new Map([
        ['food-bread::loaf', obs({ match_key: 'food-bread::loaf', line_total: 4 })],
      ]),
      tax: { status: 'estimated', estimated_tax: 0.35 },
    });

    expect(estimate.estimated_merchandise_subtotal).toBe(4);
    expect(estimate.estimated_tax).toBe(0.35);
    expect(estimate.tax_status).toBe('estimated');
    expect(estimate.estimated_total).toBe(4.35);
    expect(estimate.segments[0]?.estimated_merchandise_subtotal).toBe(4);
  });

  it('skips skipped items and reports unpriced coverage', () => {
    const priced = item({
      id: 'item-a',
      name: 'apples',
      food_object_id: 'food-a',
      unit: 'each',
      source_type: 'manual',
    });
    const unpriced = item({
      id: 'item-b',
      name: 'bananas',
      food_object_id: 'food-b',
      unit: 'each',
      source_type: 'manual',
    });
    const skipped = item({
      id: 'item-c',
      name: 'candy',
      food_object_id: 'food-c',
      unit: 'each',
      status: 'skipped',
      source_type: 'manual',
    });

    const estimate = computeFullHaulEstimate({
      groceryListId: 'list-1',
      items: [priced, unpriced, skipped],
      observationsByMatchKey: new Map([
        ['food-a::item', obs({ match_key: 'food-a::item', line_total: 2 })],
      ]),
    });

    expect(estimate.eligible_item_count).toBe(2);
    expect(estimate.priced_item_count).toBe(1);
    expect(estimate.unpriced_item_count).toBe(1);
    expect(estimate.priced_coverage_percent).toBe(50);
    expect(estimate.estimated_merchandise_subtotal).toBe(2);
  });
});
