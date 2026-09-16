import fs from 'fs';
import path from 'path';

import {
  mealDocumentToPlannedMealPayload,
  plannedMealToComposerSeed,
  templateMealToComposerSeed,
} from '@/lib/meals/adapters';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import type { MealComponent, MealDocument } from '@/lib/meals/types';
import { recomputeTemplateMealDerivedFields } from '@/lib/plans/mealNDSShapeRecompute';
import { buildTemplateMealFromDocument } from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplate, PlanDayTemplateMeal, PlannedMeal } from '@/lib/plans/types';

function component(id: string, name: string, calories: number): MealComponent {
  return {
    component_id: id,
    component_kind: 'user_entered',
    name,
    quantity: 1,
    unit: 'serving',
    food_object_id: `food-${id}`,
    calories,
    macros: { protein_g: calories / 10, carbs_g: 8, fat_g: 3 },
    nutrition_basis: 'per_component',
    match_status: 'matched',
    source_kind: 'food_object',
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
    meal_type_hint: 'lunch',
    components: [
      component('chicken', 'Chicken', 200),
      component('rice', 'Rice', 300),
      component('broccoli', 'Broccoli', 50),
    ],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: {
      calories: 550,
      macros: { protein_g: 55, carbs_g: 24, fat_g: 9 },
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

function topLevelCount(document: MealDocument, authoringGroups: { component_ids: string[] }[]) {
  const groupedIds = new Set(authoringGroups.flatMap((group) => group.component_ids));
  return (
    authoringGroups.length +
    document.components.filter((entry) => !groupedIds.has(entry.component_id)).length
  );
}

function asPlannedMeal(meal: PlanDayTemplateMeal): PlannedMeal {
  return {
    id: meal.source_planned_meal_id,
    person_id: 'person-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-lunch',
    name: meal.name,
    meal_type: meal.meal_type,
    payload: meal.payload,
    protein_score_10: meal.protein_score_10,
    is_main_meal: meal.is_main_meal,
    psq_multiplier: meal.psq_multiplier,
    meal_derived_data: meal.meal_derived_data,
    nds_confidence: meal.nds_confidence,
    execution_state: 'pending',
    journal_entry_id: null,
    source_template_id: meal.source_template_id,
    source_imported_meal_id: meal.source_imported_meal_id,
    reusable_provenance: {
      kind: 'day_template',
      id: 'day-plan-1',
      name: 'QA Day — Sep 10',
      instantiated_at: '2026-09-15T00:00:00.000Z',
      source_plan_id: '',
      source_plan_day_id: '',
      source_date_local: '',
      source_planned_meal_id: meal.source_planned_meal_id,
    },
    nds_version: meal.nds_version,
    classifier_version: meal.classifier_version,
    created_at: '2026-09-15T00:00:00.000Z',
    updated_at: '2026-09-15T00:00:00.000Z',
  };
}

function groupedTemplateMeal(): PlanDayTemplateMeal {
  let state = createComposerState('plan');
  state = composerReducer(state, {
    type: 'ADD_SAVED_MEAL_GROUP',
    document: savedMeal(),
    groupId: 'capture-meal-1',
  });
  return buildTemplateMealFromDocument(
    state.document,
    'lunch',
    undefined,
    state.authoringGroups,
  );
}

describe('reusable Day Plan grouped Saved Meal identity', () => {
  it('creates one authoring group from ADD_SAVED_MEAL_GROUP', () => {
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
      entry_kind: 'meal',
    });
    expect(state.document.components).toHaveLength(3);
    expect(topLevelCount(state.document, state.authoringGroups)).toBe(1);
  });

  it('persists authoring_composition.groups on the reusable template payload', () => {
    const meal = groupedTemplateMeal();
    const payload = meal.payload as {
      authoring_composition?: { groups: Array<{ title: string; quantity: number; component_ids: string[] }> };
    };
    expect(payload.authoring_composition?.groups).toHaveLength(1);
    expect(payload.authoring_composition?.groups[0]).toMatchObject({
      title: 'Protein Power Meal',
      quantity: 1,
      unit: 'serving',
    });
    expect(payload.authoring_composition?.groups[0]?.component_ids).toHaveLength(3);
  });

  it('restores authoringGroups when a reusable template meal is reopened', () => {
    const seed = templateMealToComposerSeed(groupedTemplateMeal());
    expect(seed.authoringGroups).toHaveLength(1);
    expect(seed.document.components).toHaveLength(3);
    expect(topLevelCount(seed.document, seed.authoringGroups)).toBe(1);
    const state = createComposerState('plan-edit', seed.document, {
      authoringGroups: seed.authoringGroups,
    });
    expect(state.authoringGroups).toHaveLength(1);
    expect(state.document.components.map((entry) => entry.name)).toEqual([
      'Chicken',
      'Rice',
      'Broccoli',
    ]);
  });

  it('keeps a Single Item as a Single Item', () => {
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_BLANK_COMPONENT',
      componentId: 'capture-single-1',
    });
    state = composerReducer(state, {
      type: 'UPDATE_COMPONENT_NAME',
      componentId: 'capture-single-1',
      name: 'Banana',
    });
    const meal = buildTemplateMealFromDocument(
      state.document,
      'snack',
      undefined,
      state.authoringGroups,
    );
    const seed = templateMealToComposerSeed(meal);
    expect(seed.authoringGroups).toHaveLength(0);
    expect(seed.document.components).toHaveLength(1);
    expect(topLevelCount(seed.document, seed.authoringGroups)).toBe(1);
  });

  it('preserves group quantity through save and reopen', () => {
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_SAVED_MEAL_GROUP',
      document: savedMeal(),
      groupId: 'capture-meal-1',
    });
    state = composerReducer(state, {
      type: 'UPDATE_AUTHORING_GROUP_QUANTITY',
      groupId: state.authoringGroups[0]!.group_id,
      quantity: 0.5,
    });
    const meal = buildTemplateMealFromDocument(
      state.document,
      'lunch',
      undefined,
      state.authoringGroups,
    );
    const payload = meal.payload as {
      authoring_composition: { groups: Array<{ quantity: number; unit: string }> };
      totals: { calories: number };
    };
    expect(payload.authoring_composition.groups[0]).toMatchObject({
      quantity: 0.5,
      unit: 'serving',
    });
    const reopened = templateMealToComposerSeed(meal);
    expect(reopened.authoringGroups[0]?.quantity).toBe(0.5);
    expect(topLevelCount(reopened.document, reopened.authoringGroups)).toBe(1);
  });

  it('preserves grouping through Make a copy of the Day Plan snapshot', () => {
    const original = groupedTemplateMeal();
    const copy: PlanDayTemplateMeal = {
      ...original,
      source_planned_meal_id: 'copied-meal',
      payload: structuredClone(original.payload),
    };
    const seed = templateMealToComposerSeed(copy);
    expect(seed.authoringGroups).toHaveLength(1);
    expect(seed.document.components).toHaveLength(3);
    expect(topLevelCount(seed.document, seed.authoringGroups)).toBe(1);
  });

  it('preserves grouping through Save as a copy of the current edited draft', () => {
    const original = groupedTemplateMeal();
    let seed = templateMealToComposerSeed(original);
    let edited = createComposerState('plan-edit', seed.document, {
      authoringGroups: seed.authoringGroups,
    });
    edited = composerReducer(edited, {
      type: 'UPDATE_AUTHORING_GROUP_QUANTITY',
      groupId: edited.authoringGroups[0]!.group_id,
      quantity: 2,
    });
    const draftMeal = buildTemplateMealFromDocument(
      edited.document,
      'lunch',
      original,
      edited.authoringGroups,
    );
    const savedCopySlots: PlanDayTemplate['slots'] = [{
      source_plan_slot_id: 'slot-lunch',
      slot_ordinal: 1,
      slot_block: 'midday',
      slot_label: 'Lunch',
      target_time: '11:30',
      meals: [{ ...draftMeal, payload: structuredClone(draftMeal.payload) }],
    }];
    const reopened = templateMealToComposerSeed(savedCopySlots[0]!.meals[0]!);
    expect(reopened.authoringGroups[0]?.quantity).toBe(2);
    expect(topLevelCount(reopened.document, reopened.authoringGroups)).toBe(1);
  });

  it('preserves grouping when Apply to date copies the reusable payload into a PlannedMeal', () => {
    const templateMeal = groupedTemplateMeal();
    const derived = recomputeTemplateMealDerivedFields(templateMeal);
    expect(
      (derived.payload as { authoring_composition?: { groups: unknown[] } }).authoring_composition?.groups,
    ).toHaveLength(1);
    const applied = plannedMealToComposerSeed(asPlannedMeal(derived));
    expect(applied.authoringGroups).toHaveLength(1);
    expect(applied.document.components).toHaveLength(3);
    expect(topLevelCount(applied.document, applied.authoringGroups)).toBe(1);
    const dated = createComposerState('plan-edit', applied.document, {
      authoringGroups: applied.authoringGroups,
    });
    expect(topLevelCount(dated.document, dated.authoringGroups)).toBe(1);
  });

  it('shares plannedMealToComposerSeed interpretation for template meals', () => {
    const meal = groupedTemplateMeal();
    const fromTemplate = templateMealToComposerSeed(meal);
    const fromPlanned = plannedMealToComposerSeed(asPlannedMeal(meal));
    expect(fromTemplate.authoringGroups).toEqual(fromPlanned.authoringGroups);
    expect(fromTemplate.document.components.map((entry) => entry.component_id)).toEqual(
      fromPlanned.document.components.map((entry) => entry.component_id),
    );
  });

  it('does not strip authoring_composition in instantiate', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/plans/planServerService.ts'),
      'utf8',
    );
    const start = source.indexOf('export async function instantiatePlanDayTemplate');
    const fn = source.slice(start, source.indexOf('export async function savePlanWeekPattern', start));
    expect(fn).toContain('recomputeTemplateMealDerivedFields(templateMeal)');
    expect(fn).toContain('derivedMeal.payload');
    expect(fn).not.toContain('delete payload.authoring_composition');
  });

  it('round-trips payload groups through mealDocumentToPlannedMealPayload', () => {
    const meal = groupedTemplateMeal();
    const seed = templateMealToComposerSeed(meal);
    const payload = mealDocumentToPlannedMealPayload(
      seed.document,
      seed.authoringGroups,
    ) as { authoring_composition: { groups: Array<{ component_ids: string[] }> } };
    expect(payload.authoring_composition.groups[0]?.component_ids).toHaveLength(3);
  });
});
