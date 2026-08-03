import {
  buildTemplateMealFromDocument,
  cloneTemplateMealForSnapshot,
  countTemplateMeals,
  duplicatePatternDaySnapshot,
  duplicateTemplateMeal,
  moveArrayItem,
} from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplate, PlanDayTemplateMeal } from '@/lib/plans/types';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';

describe('reusableAuthoringHelpers', () => {
  const baseMeal: PlanDayTemplateMeal = {
    source_planned_meal_id: 'meal-1',
    name: 'Salad',
    meal_type: 'lunch',
    payload: { items: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } },
    protein_score_10: null,
    is_main_meal: false,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: null,
      is_main_meal: false,
      meal_calories: 0,
      meal_protein_g: 0,
      psq_multiplier: 1,
    },
    nds_confidence: 'medium',
    source_template_id: null,
    source_imported_meal_id: null,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };

  const template: PlanDayTemplate = {
    id: 'tpl-1',
    person_id: 'person-1',
    name: 'Test',
    scope: 'day',
    source_plan_id: 'plan-1',
    source_plan_day_id: 'day-1',
    source_date_local: '2026-07-18',
    slots: [
      {
        source_plan_slot_id: 'slot-1',
        slot_ordinal: 1,
        slot_block: 'midday',
        slot_label: 'Lunch',
        target_time: '12:00',
        meals: [baseMeal],
      },
    ],
    apply_policy: 'append',
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
  };

  test('countTemplateMeals includes slot meals', () => {
    expect(countTemplateMeals(template)).toBe(1);
  });

  test('moveArrayItem swaps adjacent entries', () => {
    expect(moveArrayItem(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
  });

  test('duplicateTemplateMeal assigns a new source id', () => {
    const copy = duplicateTemplateMeal(baseMeal);
    expect(copy.source_planned_meal_id).not.toBe(baseMeal.source_planned_meal_id);
    expect(copy.name).toBe('Salad (Copy)');
  });

  test('buildTemplateMealFromDocument preserves existing nds stamps', () => {
    const doc = {
      schema_version: 'meal.v1',
      id: null,
      person_id: null,
      kind: 'meal' as const,
      review_state: 'confirmed' as const,
      title: 'Updated',
      description: null,
      intents: [],
      meal_type_hint: 'lunch' as const,
      components: [],
      yield: null,
      recipe_yield_servings: null,
      serving_label: null,
      prep_notes: null,
      per_serving: null,
      totals: null,
      nds: null,
      source: null,
      provenance: null,
    };
    const next = buildTemplateMealFromDocument(doc, 'lunch', baseMeal);
    expect(next.name).toBe('Updated');
    expect(next.nds_version).toBe(NDS_VERSION);
  });

  test('buildTemplateMealFromDocument stamps source_meal_document_id on snapshot payload', () => {
    const doc = {
      schema_version: 'meal.v1',
      id: 'doc-123',
      person_id: 'person-1',
      kind: 'meal' as const,
      review_state: 'confirmed' as const,
      title: 'Saved bowl',
      description: null,
      intents: [],
      meal_type_hint: 'lunch' as const,
      components: [],
      yield: null,
      recipe_yield_servings: null,
      serving_label: null,
      prep_notes: null,
      per_serving: null,
      totals: null,
      nds: null,
      source: null,
      provenance: null,
    };
    const meal = buildTemplateMealFromDocument(doc, 'lunch');
    expect(meal.payload).toMatchObject({
      source_meal_document_id: 'doc-123',
      planned_servings: 1,
      meal_document_snapshot: true,
    });
  });

  test('cloneTemplateMealForSnapshot assigns a new id and deep-copies payload', () => {
    const copy = cloneTemplateMealForSnapshot(baseMeal);
    expect(copy.source_planned_meal_id).not.toBe(baseMeal.source_planned_meal_id);
    expect(copy.payload).toEqual(baseMeal.payload);
    expect(copy.payload).not.toBe(baseMeal.payload);
  });

  test('duplicatePatternDaySnapshot clones meals with fresh ids', () => {
    const sourceDay = {
      day_offset: 0,
      source_plan_day_id: 'day-a',
      source_date_local: 'Day 1',
      slots: template.slots,
    };
    const copy = duplicatePatternDaySnapshot(sourceDay, 1, {
      day_offset: 1,
      source_plan_day_id: 'day-b',
      source_date_local: 'Day 2',
      slots: [],
    });
    expect(copy.day_offset).toBe(1);
    expect(copy.slots[0]?.meals[0]?.source_planned_meal_id).not.toBe(
      baseMeal.source_planned_meal_id,
    );
  });
});
