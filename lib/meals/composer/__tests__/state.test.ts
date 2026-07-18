import type { MealComponent, MealDocument } from '../../types';
import { composerReducer, createBlankMealDocument, createComposerState } from '../state';
import type { MealComposerState } from '../types';

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Beans',
    quantity: 1,
    unit: 'serving',
    food_object_id: 'food-beans',
    calories: 100,
    macros: { protein_g: 10, carbs_g: 12, fat_g: 3 },
    nutrition_basis: 'per_serving',
    match_status: 'matched',
    source_kind: 'food_object',
    needs_review: false,
    ...overrides,
  };
}

function doc(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    ...createBlankMealDocument(),
    title: 'Bean Bowl',
    review_state: 'confirmed',
    components: [component()],
    ...overrides,
  };
}

describe('createComposerState', () => {
  it('creates a blank draft for a fresh create-mode composer', () => {
    const state = createComposerState('create');
    expect(state.mode).toBe('create');
    expect(state.document.kind).toBe('meal');
    expect(state.document.components).toEqual([]);
    expect(state.consumedServingsInput).toBe('1');
    expect(state.needsReview).toBe(false);
  });

  it('seeds needsReview from an existing document with a review-flagged component', () => {
    const state = createComposerState('edit-saved', doc({ components: [component({ needs_review: true })] }));
    expect(state.needsReview).toBe(true);
  });
});

describe('composerReducer — field setters', () => {
  it('sets title', () => {
    const state = createComposerState('create');
    const next = composerReducer(state, { type: 'SET_TITLE', title: 'Chili bowl' });
    expect(next.document.title).toBe('Chili bowl');
  });

  it('normalizes blank description/prep notes/serving label to null', () => {
    let state = createComposerState('create');
    state = composerReducer(state, { type: 'SET_DESCRIPTION', description: '  ' });
    expect(state.document.description).toBeNull();
    state = composerReducer(state, { type: 'SET_PREP_NOTES', prepNotes: 'simmer 10m' });
    expect(state.document.prep_notes).toBe('simmer 10m');
  });

  it('sets yield servings and mirrors recipe_yield_servings', () => {
    let state = createComposerState('create');
    state = composerReducer(state, { type: 'SET_YIELD_SERVINGS', yieldServings: '4' });
    expect(state.document.recipe_yield_servings).toBe(4);
    expect(state.document.yield?.servings).toBe(4);
    state = composerReducer(state, { type: 'SET_YIELD_SERVINGS', yieldServings: '' });
    expect(state.document.recipe_yield_servings).toBeNull();
  });

  it('sets consumed servings input and instance note as raw controlled text', () => {
    let state = createComposerState('log');
    state = composerReducer(state, { type: 'SET_CONSUMED_SERVINGS_INPUT', value: '2.5' });
    expect(state.consumedServingsInput).toBe('2.5');
    state = composerReducer(state, { type: 'SET_INSTANCE_NOTE', value: 'extra sauce' });
    expect(state.instanceNote).toBe('extra sauce');
  });
});

describe('composerReducer — component ops trigger recompute', () => {
  /**
   * Corrective fix (Phase 3 authenticated QA — defect
   * plans-vs-log-nutrition-read): a trusted, fully-resolved food selection
   * used to leave quantity/unit blank, so the very next recompute pass
   * downgraded the just-matched component back to needs_review with a null
   * contribution (see lib/meals/componentGrounding.ts
   * applyGroundingInPlace). Grounding now defaults quantity/unit to "1
   * serving" when neither is already set, so a resolved match is
   * immediately trusted without an extra manual step.
   */
  it('recomputes totals after adding a grounded component, defaulting to 1 serving', () => {
    let state: MealComposerState = createComposerState('create');
    state = composerReducer(state, { type: 'ADD_COMPONENT_FROM_SELECTION', componentId: 'c1', selection: {
      food_object_id: 'food-beans',
      name: 'Beans',
      food: { id: 'food-beans', calories: 100, proteinG: 10, carbsG: 12, fatG: 3, servingSizeG: 100 } as never,
    } });
    expect(state.needsReview).toBe(false);
    expect(state.document.components[0].quantity).toBe(1);
    expect(state.document.components[0].unit).toBe('serving');
    expect(state.document.totals?.calories).toBe(100);
  });

  it('preserves an explicit quantity/unit typed before the food match instead of overwriting it', () => {
    let state: MealComposerState = createComposerState('create');
    state = composerReducer(state, { type: 'ADD_BLANK_COMPONENT', componentId: 'c1' });
    state = composerReducer(state, {
      type: 'UPDATE_COMPONENT_QUANTITY_UNIT',
      componentId: 'c1',
      quantity: 3,
      unit: 'serving',
    });
    state = composerReducer(state, {
      type: 'APPLY_COMPONENT_SELECTION',
      componentId: 'c1',
      selection: {
        food_object_id: 'food-beans',
        name: 'Beans',
        food: { id: 'food-beans', calories: 100, proteinG: 10, carbsG: 12, fatG: 3, servingSizeG: 100 } as never,
      },
    });
    expect(state.document.components[0].quantity).toBe(3);
    expect(state.document.components[0].unit).toBe('serving');
    expect(state.needsReview).toBe(false);
    expect(state.document.totals?.calories).toBe(300);
  });

  it('recomputes review flags after removing the last needs-review component', () => {
    let state = createComposerState(
      'edit-saved',
      doc({ components: [component(), component({ component_id: 'c2', needs_review: true, food_object_id: null, match_status: 'none' })] }),
    );
    expect(state.needsReview).toBe(true);
    state = composerReducer(state, { type: 'REMOVE_COMPONENT', componentId: 'c2' });
    expect(state.needsReview).toBe(false);
    expect(state.document.components).toHaveLength(1);
  });

  it('move up/down and duplicate go through the reducer and keep totals in sync', () => {
    let state = createComposerState(
      'edit-saved',
      doc({
        components: [
          component({ component_id: 'a', calories: 100, macros: { protein_g: 10, carbs_g: 10, fat_g: 1 } }),
          component({ component_id: 'b', calories: 50, macros: { protein_g: 5, carbs_g: 5, fat_g: 1 } }),
        ],
      }),
    );
    state = composerReducer(state, { type: 'MOVE_COMPONENT_DOWN', componentId: 'a' });
    expect(state.document.components.map((c) => c.component_id)).toEqual(['b', 'a']);
    expect(state.document.totals?.calories).toBe(150);

    state = composerReducer(state, { type: 'DUPLICATE_COMPONENT', componentId: 'b', newComponentId: 'b-copy' });
    expect(state.document.components.map((c) => c.component_id)).toEqual(['b', 'b-copy', 'a']);
    expect(state.document.totals?.calories).toBe(200);
  });

  it('swap reorders two arbitrary components', () => {
    let state = createComposerState(
      'edit-saved',
      doc({
        components: [
          component({ component_id: 'a' }),
          component({ component_id: 'b' }),
          component({ component_id: 'c' }),
        ],
      }),
    );
    state = composerReducer(state, { type: 'SWAP_COMPONENTS', componentIdA: 'a', componentIdB: 'c' });
    expect(state.document.components.map((c) => c.component_id)).toEqual(['c', 'b', 'a']);
  });
});

describe('composerReducer — steps', () => {
  it('adds, updates, and removes steps with renumbering', () => {
    let state = createComposerState('create');
    state = composerReducer(state, { type: 'ADD_STEP' });
    state = composerReducer(state, { type: 'ADD_STEP' });
    expect(state.document.steps).toHaveLength(2);
    state = composerReducer(state, { type: 'UPDATE_STEP', stepNumber: 1, instruction: 'Boil water.' });
    expect(state.document.steps?.[0].instruction).toBe('Boil water.');
    state = composerReducer(state, { type: 'REMOVE_STEP', stepNumber: 1 });
    expect(state.document.steps).toHaveLength(1);
    expect(state.document.steps?.[0].step_number).toBe(1);
  });
});
