import {
  mealDocumentToPlannedMealPayload,
  plannedMealToComposerSeed,
} from '@/lib/meals/adapters';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import type { MealComponent, MealDocument } from '@/lib/meals/types';
import {
  clearPlanComposerDraft,
  loadPlanComposerDraft,
  planComposerDraftStorageKey,
  savePlanComposerDraft,
  type PlanComposerDraftIdentity,
} from '@/lib/plans/planComposerDraftStore';
import { resolvePlanSlotForCreateKey } from '@/lib/plans/resolvePlanSlotForCreateKey';
import type { PlannedMeal, PlanSlot, ResolvedScheduleSlot } from '@/lib/plans/types';

function component(id: string, name: string, calories: number): MealComponent {
  return {
    component_id: id,
    component_kind: 'user_entered',
    name,
    quantity: 1,
    unit: 'serving',
    food_object_id: null,
    calories,
    macros: { protein_g: calories / 10, carbs_g: 0, fat_g: 0 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'user_entered',
    needs_review: false,
  };
}

function savedMeal(): MealDocument {
  return {
    schema_version: 1,
    document_version: 1,
    id: 'template-protein-power',
    person_id: 'person-1',
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Protein Power Meal',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [
      component('chicken', 'Chicken', 200),
      component('rice', 'Rice', 300),
    ],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: {
      calories: 500,
      macros: { protein_g: 50, carbs_g: 0, fat_g: 0 },
    },
    source: {
      source_type: 'saved_meal',
      source_template_id: 'template-protein-power',
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}

function planned(payload: Record<string, unknown>): PlannedMeal {
  return {
    id: 'planned-1',
    person_id: 'person-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-am',
    name: 'Protein Power Meal',
    meal_type: 'snack',
    payload,
    source_template_id: 'template-protein-power',
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: 'pending',
    journal_entry_id: null,
    protein_score_10: null,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'high',
    nds_version: 'test',
    classifier_version: 'test',
    created_at: '2026-09-09T10:00:00.000Z',
    updated_at: '2026-09-09T10:00:00.000Z',
  } as unknown as PlannedMeal;
}

describe('Packet 13G Plans composition identity', () => {
  it('keeps repeated Mini Meal occasions isolated by exact schedule time', () => {
    const slots: PlanSlot[] = [
      {
        id: 'slot-pm',
        plan_day_id: 'day-1',
        person_id: 'person-1',
        slot_block: 'midday',
        // Deliberately contradictory legacy ordinal: time must win.
        slot_ordinal: 1,
        slot_label: 'Mini Meal',
        target_time: '14:00',
        created_at: '',
        updated_at: '',
      },
      {
        id: 'slot-am',
        plan_day_id: 'day-1',
        person_id: 'person-1',
        slot_block: 'morning',
        slot_ordinal: 2,
        slot_label: 'Mini Meal',
        target_time: '06:30',
        created_at: '',
        updated_at: '',
      },
    ];
    const schedule: ResolvedScheduleSlot[] = [
      {
        key: 'occasion_1',
        enabled: true,
        target_time: '06:30',
        label: 'Mini Meal',
        slot_block: 'morning',
        source: 'profile',
      },
      {
        key: 'occasion_5',
        enabled: true,
        target_time: '14:00',
        label: 'Mini Meal',
        slot_block: 'midday',
        source: 'profile',
      },
    ];

    expect(resolvePlanSlotForCreateKey('occasion_1', slots, { enabledSlots: schedule })?.id)
      .toBe('slot-am');
    expect(resolvePlanSlotForCreateKey('occasion_5', slots, { enabledSlots: schedule })?.id)
      .toBe('slot-pm');
  });

  it('round-trips a Saved Meal as one top-level serving-scaled Meal entry', () => {
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_SAVED_MEAL_GROUP',
      document: savedMeal(),
      groupId: 'capture-meal-1',
    });

    expect(state.authoringGroups).toHaveLength(1);
    expect(state.authoringGroups[0]).toMatchObject({
      title: 'Protein Power Meal',
      quantity: 1,
      unit: 'serving',
    });
    expect(state.document.components).toHaveLength(2);

    state = composerReducer(state, {
      type: 'ADD_BLANK_COMPONENT',
      componentId: 'capture-manual-1',
    });
    state = composerReducer(state, {
      type: 'UPDATE_COMPONENT_NAME',
      componentId: 'capture-manual-1',
      name: 'Bread Pudding',
    });
    const firstPayload = mealDocumentToPlannedMealPayload(
      state.document,
      state.authoringGroups,
    ) as Record<string, unknown>;
    expect(firstPayload.source_meal_document_id).toBeUndefined();

    const reopened = plannedMealToComposerSeed(planned(firstPayload));
    const groupedIds = new Set(reopened.authoringGroups[0]?.component_ids ?? []);
    const topLevelCount =
      reopened.authoringGroups.length +
      reopened.document.components.filter(
        (entry) => !groupedIds.has(entry.component_id),
      ).length;
    expect(topLevelCount).toBe(2);

    let edited = createComposerState('plan-edit', reopened.document, {
      authoringGroups: reopened.authoringGroups,
    });
    edited = composerReducer(edited, {
      type: 'UPDATE_AUTHORING_GROUP_QUANTITY',
      groupId: reopened.authoringGroups[0]!.group_id,
      quantity: 0.5,
    });
    const secondPayload = mealDocumentToPlannedMealPayload(
      edited.document,
      edited.authoringGroups,
    ) as {
      items: Array<{ quantity?: number }>;
      totals: { calories: number };
      authoring_composition: { groups: Array<{ quantity: number; unit: string }> };
    };
    expect(secondPayload.authoring_composition.groups[0]).toMatchObject({
      quantity: 0.5,
      unit: 'serving',
    });
    expect(secondPayload.totals.calories).toBe(250);
    expect(secondPayload.items.slice(0, 2).map((item) => item.quantity)).toEqual([0.5, 0.5]);
  });
});

describe('Packet 13G exact-slot draft persistence', () => {
  const identity: PlanComposerDraftIdentity = {
    personId: 'person-1',
    planId: 'plan-1',
    planDayId: 'day-1',
    planSlotId: 'slot-am',
    dateLocal: '2026-09-09',
  };

  function memoryStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
  }

  it('restores only the same person/plan/day/PlanSlot and matching baseline', () => {
    const storage = memoryStorage();
    const state = createComposerState('plan');
    savePlanComposerDraft(storage, identity, 'baseline-a', {
      mealType: 'snack',
      document: { ...state.document, title: 'Unsaved A' },
      authoringGroups: [],
    });

    expect(loadPlanComposerDraft(storage, identity, 'baseline-a')?.document.title)
      .toBe('Unsaved A');
    expect(planComposerDraftStorageKey({ ...identity, planSlotId: 'slot-pm' }))
      .not.toBe(planComposerDraftStorageKey(identity));
    expect(loadPlanComposerDraft(storage, { ...identity, planSlotId: 'slot-pm' }, 'baseline-a'))
      .toBeNull();
    expect(loadPlanComposerDraft(storage, identity, 'newer-server-baseline')).toBeNull();
  });

  it('clears the exact stored draft after persistence', () => {
    const storage = memoryStorage();
    const state = createComposerState('plan');
    savePlanComposerDraft(storage, identity, 'baseline', {
      mealType: 'snack',
      document: state.document,
      authoringGroups: [],
    });
    clearPlanComposerDraft(storage, identity);
    expect(loadPlanComposerDraft(storage, identity, 'baseline')).toBeNull();
  });
});
