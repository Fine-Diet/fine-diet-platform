import {
  addLogNutritionDraftEntry,
  createLogNutritionDraft,
  type LogNutritionDraftContextV1,
} from '../logNutritionDraft';
import {
  exactPendingPlannedMealDraftEntry,
  retireConsumedPlannedMealDraftContext,
} from '../plannedMealDraftStaging';
import type { PlannedMeal } from '@/lib/plans/types';

const CONTEXT: LogNutritionDraftContextV1 = {
  personId: 'person-1',
  date: '2026-09-09',
  time: '17:00',
  occasionKey: 'occasion_7@17:00',
  mealSlot: 'occasion_7',
  plannedMealId: 'planned-exact',
  redirect: '/app/plans',
};

function plannedMeal(
  id: string,
  executionState: PlannedMeal['execution_state'] = 'pending',
): PlannedMeal {
  return {
    id,
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: 'person-1',
    name: `Meal ${id}`,
    meal_type: 'dinner',
    payload: {
      items: [
        {
          name: 'Chicken',
          quantity: 1,
          unit: 'serving',
          calories: 400,
          macros: { protein: 35, carbs: 20, fat: 12 },
        },
      ],
      totals: { calories: 400, protein_g: 35, carbs_g: 20, fat_g: 12 },
    },
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: executionState,
    journal_entry_id: executionState === 'eaten' ? 'entry-1' : null,
    protein_score_10: null,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'medium',
    nds_version: '1',
    classifier_version: '1',
    created_at: '',
    updated_at: '',
  };
}

describe('exact pending planned Meal draft staging', () => {
  it('stages only the authoritative plannedMealId as one grouped Meal', () => {
    const exact = plannedMeal('planned-exact');
    const other = plannedMeal('planned-other');

    const entry = exactPendingPlannedMealDraftEntry(
      [other, exact],
      exact.id,
    );

    expect(entry).toEqual(
      expect.objectContaining({
        kind: 'meal',
        sourceKey: 'planned:planned-exact',
        plannedMealId: 'planned-exact',
        plannedMode: 'exact',
        quantity: 1,
        unit: 'serving',
      }),
    );
    expect(entry?.mealDocument.components).toHaveLength(1);
  });

  it('does not restage a handled planned Meal', () => {
    expect(
      exactPendingPlannedMealDraftEntry(
        [plannedMeal('planned-exact', 'eaten')],
        'planned-exact',
      ),
    ).toBeNull();
    expect(
      exactPendingPlannedMealDraftEntry(
        [plannedMeal('planned-exact', 'skipped')],
        'planned-exact',
      ),
    ).toBeNull();
  });

  it('dedupes rerender and restored-draft staging by planned source identity', () => {
    const entry = exactPendingPlannedMealDraftEntry(
      [plannedMeal('planned-exact')],
      'planned-exact',
    )!;
    const draft = createLogNutritionDraft(CONTEXT);
    const restored = addLogNutritionDraftEntry(draft, entry).draft;
    const rerenderedEntry = exactPendingPlannedMealDraftEntry(
      [plannedMeal('planned-exact')],
      'planned-exact',
    )!;

    const result = addLogNutritionDraftEntry(restored, rerenderedEntry);

    expect(result.duplicate).toBe(true);
    expect(result.draft.entries).toHaveLength(1);
    expect(result.draft.entries[0]?.kind).toBe('meal');
  });

  it('retires consumed Quick Log intent while preserving ordinary occasion context', () => {
    expect(
      retireConsumedPlannedMealDraftContext(CONTEXT),
    ).toEqual({
      ...CONTEXT,
      plannedMealId: null,
    });
    expect(
      retireConsumedPlannedMealDraftContext({
        ...CONTEXT,
        plannedMealId: null,
      }),
    ).toEqual({
      ...CONTEXT,
      plannedMealId: null,
    });
  });
});
