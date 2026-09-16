import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import type { MealComponent, MealDocument } from '@/lib/meals/types';
import { previewComposerMealNds } from '@/lib/plans/previewComposerMealNds';
import { recomputeMealNDSShape } from '@/lib/plans/mealNDSShapeRecompute';
import { projectSingleMealAsDay } from '@/lib/plans/projection';
import { mealDocumentToPlannedMealPayload } from '@/lib/meals/adapters';

function component(id: string, name: string, calories: number, protein: number): MealComponent {
  return {
    component_id: id,
    component_kind: 'user_entered',
    name,
    quantity: 1,
    unit: 'serving',
    food_object_id: `food-${id}`,
    calories,
    macros: { protein_g: protein, carbs_g: 10, fat_g: 5 },
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
      component('chicken', 'Chicken', 200, 40),
      component('rice', 'Rice', 300, 8),
      component('broccoli', 'Broccoli', 50, 4),
    ],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: {
      calories: 550,
      macros: { protein_g: 52, carbs_g: 30, fat_g: 15 },
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

describe('previewComposerMealNds', () => {
  it('returns a numeric score for a reusable saved meal with computable nutrition', () => {
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_SAVED_MEAL_GROUP',
      document: savedMeal(),
      groupId: 'capture-meal-1',
    });
    const score = previewComposerMealNds(state.document, state.authoringGroups, 'lunch');
    expect(typeof score).toBe('number');
    expect(Number.isFinite(score)).toBe(true);
  });

  it('recomputes the preview when the reusable draft changes', () => {
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_SAVED_MEAL_GROUP',
      document: savedMeal(),
      groupId: 'capture-meal-1',
    });
    const before = previewComposerMealNds(state.document, state.authoringGroups, 'lunch');
    state = composerReducer(state, {
      type: 'REMOVE_COMPONENT',
      componentId: state.document.components[0]!.component_id,
    });
    const after = previewComposerMealNds(state.document, state.authoringGroups, 'lunch');
    expect(typeof before).toBe('number');
    expect(after).not.toBe(before);
  });

  it('returns null for an empty or insufficient meal', () => {
    const empty = createComposerState('create');
    expect(previewComposerMealNds(empty.document, empty.authoringGroups, 'lunch')).toBeNull();
    const insufficient: MealDocument = {
      ...savedMeal(),
      components: [],
      totals: { calories: null, macros: { protein_g: null, carbs_g: null, fat_g: null } },
    };
    expect(previewComposerMealNds(insufficient, [], 'lunch')).toBeNull();
  });

  it('uses the same recomputeMealNDSShape and projectSingleMealAsDay path as dated Plans', () => {
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_SAVED_MEAL_GROUP',
      document: savedMeal(),
      groupId: 'capture-meal-1',
    });
    const helperScore = previewComposerMealNds(state.document, state.authoringGroups, 'lunch');
    const payload = mealDocumentToPlannedMealPayload(state.document, state.authoringGroups);
    const derived = recomputeMealNDSShape(state.document.title, payload);
    const datedScore = projectSingleMealAsDay({
      id: 'composer-preview',
      plan_id: '',
      plan_day_id: '',
      plan_slot_id: null,
      person_id: '',
      name: state.document.title,
      meal_type: 'lunch',
      payload,
      source_template_id: state.document.source.source_template_id ?? null,
      source_imported_meal_id: state.document.source.source_imported_meal_id ?? null,
      reusable_provenance: null,
      execution_state: 'pending',
      journal_entry_id: null,
      nds_version: state.document.nds_version ?? '',
      classifier_version: state.document.classifier_version ?? '',
      created_at: '',
      updated_at: '',
      ...derived,
    }).nds_score_100;
    expect(helperScore).toBe(datedScore);
  });

  it('does not persist or fetch merely from preview rendering', () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    let state = createComposerState('plan');
    state = composerReducer(state, {
      type: 'ADD_SAVED_MEAL_GROUP',
      document: savedMeal(),
      groupId: 'capture-meal-1',
    });
    previewComposerMealNds(state.document, state.authoringGroups, 'lunch');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
