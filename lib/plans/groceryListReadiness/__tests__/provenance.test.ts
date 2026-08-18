import type { GeneratedGroceryList, GroceryItem } from '@/lib/plans/types';
import { resolveGroceryItemProvenance } from '../provenance';

function list(overrides: Partial<GeneratedGroceryList> = {}): GeneratedGroceryList {
  return {
    id: 'list-1',
    plan_id: null,
    person_id: 'person-1',
    title: 'My Grocery List',
    date_range_start: null,
    date_range_end: null,
    mode: 'manual',
    status: 'active',
    export_payload_json: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: 'list-1',
    person_id: 'person-1',
    name: 'Oats',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-oats',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('resolveGroceryItemProvenance', () => {
  it('keeps planless manual rows manual and does not fabricate a source plan', () => {
    const provenance = resolveGroceryItemProvenance(
      item({
        source_type: 'manual',
        source_id: 'plan-should-not-count',
        source_planned_meal_ids: ['meal-x'],
      }),
      list(),
    );
    expect(provenance.origin).toBe('manual');
    expect(provenance.sourcePlanId).toBeNull();
    expect(provenance.dateStart).toBeNull();
    expect(provenance.label).toBe('Added by you');
  });

  it('does not treat Packet 9 generated rows as manual when source_type defaults to manual', () => {
    const provenance = resolveGroceryItemProvenance(
      item({
        source_type: 'manual',
        source_planned_meal_ids: ['meal-1'],
      }),
      list({
        plan_id: 'plan-9',
        date_range_start: '2026-08-16',
        date_range_end: '2026-08-22',
      }),
    );
    expect(provenance.origin).toBe('plan_derived');
    expect(provenance.sourcePlanId).toBe('plan-9');
    expect(provenance.dateStart).toBe('2026-08-16');
    expect(provenance.label).toContain('From your plan');
    expect(provenance.label).not.toBe('Added by you');
  });

  it('preserves Pull-from-Plan source plan/range/planned-meal provenance', () => {
    const provenance = resolveGroceryItemProvenance(
      item({
        source_type: 'planned_meal',
        source_id: 'plan-2',
        source_planned_meal_ids: ['meal-1', 'meal-2'],
        source_detail_json: {
          date_range_start: '2026-08-16',
          date_range_end: '2026-08-18',
        },
      }),
      list(),
    );
    expect(provenance.origin).toBe('plan_derived');
    expect(provenance.sourcePlanId).toBe('plan-2');
    expect(provenance.dateStart).toBe('2026-08-16');
    expect(provenance.dateEnd).toBe('2026-08-18');
    expect(provenance.plannedMealIds).toEqual(['meal-1', 'meal-2']);
    expect(provenance.label).toContain('From a plan');
    expect(provenance.label).toContain('2026-08-16 to 2026-08-18');
    expect(provenance.label).toContain('2 planned meals');
  });

  it('uses Packet 9 list identity when generate omitted source_type', () => {
    const provenance = resolveGroceryItemProvenance(
      item({ source_planned_meal_ids: ['meal-1'] }),
      list({
        plan_id: 'plan-9',
        date_range_start: '2026-08-16',
        date_range_end: '2026-08-22',
      }),
    );
    expect(provenance.origin).toBe('plan_derived');
    expect(provenance.sourcePlanId).toBe('plan-9');
    expect(provenance.dateStart).toBe('2026-08-16');
    expect(provenance.dateEnd).toBe('2026-08-22');
    expect(provenance.label).toContain('From your plan');
  });

  it('does not label a plan-scoped row plan-derived from list.plan_id alone', () => {
    const provenance = resolveGroceryItemProvenance(
      item({
        source_type: 'manual',
        source_id: null,
        source_planned_meal_ids: [],
        source_detail_json: {},
      }),
      list({
        plan_id: 'plan-9',
        date_range_start: '2026-08-16',
        date_range_end: '2026-08-22',
      }),
    );
    expect(provenance.origin).toBe('manual');
    expect(provenance.sourcePlanId).toBeNull();
    expect(provenance.label).toBe('Added by you');
  });

  it('does not let pricing, purchasing choice, or status change provenance', () => {
    const planList = list({
      plan_id: 'plan-9',
      date_range_start: '2026-08-16',
      date_range_end: '2026-08-22',
    });
    const base = item({
      source_type: 'manual',
      source_planned_meal_ids: ['meal-1'],
      status: 'pending',
      name: 'Oats',
    });
    const mutated = item({
      source_type: 'manual',
      source_planned_meal_ids: ['meal-1'],
      status: 'bought',
      name: 'Store-brand oats',
      notes: 'list choice overlay',
    });
    expect(resolveGroceryItemProvenance(base, planList)).toMatchObject({
      origin: 'plan_derived',
      sourcePlanId: 'plan-9',
      plannedMealIds: ['meal-1'],
    });
    expect(resolveGroceryItemProvenance(mutated, planList)).toMatchObject({
      origin: 'plan_derived',
      sourcePlanId: 'plan-9',
      plannedMealIds: ['meal-1'],
    });

    expect(resolveGroceryItemProvenance(item({ source_type: 'manual', status: 'have' }), list()).origin).toBe(
      'manual',
    );
    expect(
      resolveGroceryItemProvenance(item({ source_type: 'manual', status: 'skipped' }), list()).origin,
    ).toBe('manual');
  });
});
