import type { MealComponent } from '../../types';
import { createBlankMealDocument, createComposerState } from '../state';
import { validateComposerStateForSubmit } from '../validate';

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

describe('validateComposerStateForSubmit', () => {
  it('rejects a blank title', () => {
    const state = createComposerState('create', {
      ...createBlankMealDocument(),
      components: [component()],
    });
    const result = validateComposerStateForSubmit(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Title is required.');
  });

  it('rejects an empty component list', () => {
    const state = createComposerState('create', { ...createBlankMealDocument(), title: 'Bowl' });
    const result = validateComposerStateForSubmit(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Add at least one component.');
  });

  it('rejects a component with a blank name', () => {
    const state = createComposerState('create', {
      ...createBlankMealDocument(),
      title: 'Bowl',
      components: [component({ name: '  ' })],
    });
    const result = validateComposerStateForSubmit(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('needs a name'))).toBe(true);
  });

  it('rejects a non-positive component quantity', () => {
    const state = createComposerState('create', {
      ...createBlankMealDocument(),
      title: 'Bowl',
      components: [component({ quantity: 0 })],
    });
    const result = validateComposerStateForSubmit(state);
    expect(result.ok).toBe(false);
  });

  it('accepts a well-formed create draft', () => {
    const state = createComposerState('create', {
      ...createBlankMealDocument(),
      title: 'Bowl',
      components: [component()],
    });
    expect(validateComposerStateForSubmit(state)).toEqual({ ok: true });
  });

  it('rejects non-positive servings for log/adjust-and-log contexts', () => {
    const state = createComposerState(
      'log',
      { ...createBlankMealDocument(), title: 'Bowl', components: [component()] },
      { consumedServingsInput: '0' },
    );
    const result = validateComposerStateForSubmit(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('Servings'))).toBe(true);
  });

  it('does not require servings validation for create/edit-saved contexts', () => {
    const state = createComposerState(
      'edit-saved',
      { ...createBlankMealDocument(), title: 'Bowl', components: [component()] },
      { consumedServingsInput: '0' },
    );
    expect(validateComposerStateForSubmit(state)).toEqual({ ok: true });
  });

  it('rejects a non-positive recipe yield', () => {
    const state = createComposerState('create', {
      ...createBlankMealDocument(),
      title: 'Bowl',
      kind: 'recipe',
      recipe_yield_servings: -1,
      components: [component()],
    });
    const result = validateComposerStateForSubmit(state);
    expect(result.ok).toBe(false);
  });
});
