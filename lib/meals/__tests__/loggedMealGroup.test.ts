/**
 * Meal Object Foundation — Packet 9: grouped log rendering helpers.
 *
 * Covers the rendering-decision guard (isGroupedMealEntry / hasMealGroupPayload)
 * and the defensive view projection (buildGroupedMealView). The view projection
 * is what the LoggedMealGroupCard renders from, so these tests are the practical
 * rendering safeguards in a node test environment (no DOM required): they prove
 * grouped detection, top-level field projection, detail expansion content, and
 * graceful degradation of malformed payloads.
 */

import {
  buildGroupedMealView,
  hasMealGroupPayload,
  isGroupedMealEntry,
} from '../loggedMealGroup';
import type { GroupedMealEntryPayload, LoggedMealGroup, MealComponent } from '../types';

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Beans',
    quantity: 1,
    unit: 'cup',
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

function group(overrides: Partial<LoggedMealGroup> = {}): LoggedMealGroup {
  return {
    schema_version: 1,
    name: 'Bean Bowl',
    source_meal_document_id: 'doc-1',
    source_imported_meal_id: null,
    source_planned_meal_id: null,
    source_template_id: null,
    components: [component()],
    totals: { calories: 250, macros: { protein_g: 20, carbs_g: 24, fat_g: 6 } },
    planned_servings: null,
    consumed_servings: 1,
    detached_from_source: false,
    instance_notes: null,
    needs_review: false,
    ...overrides,
  };
}

function payload(overrides: Partial<GroupedMealEntryPayload> = {}): GroupedMealEntryPayload {
  return {
    name: 'Bean Bowl',
    quantity: 1,
    unit: 'serving',
    calories: 250,
    macros: { protein: 20, carbs: 24, fat: 6 },
    meal_group: group(),
    ...overrides,
  };
}

// ============================================================================
// Guards
// ============================================================================

describe('hasMealGroupPayload', () => {
  it('is true for a payload carrying a meal_group object', () => {
    expect(hasMealGroupPayload(payload())).toBe(true);
  });

  it('is false for a flat food payload (no meal_group)', () => {
    expect(hasMealGroupPayload({ name: 'Apple', calories: 95, quantity: 1 })).toBe(false);
  });

  it('is false when meal_group is null, an array, or a primitive', () => {
    expect(hasMealGroupPayload({ name: 'x', meal_group: null })).toBe(false);
    expect(hasMealGroupPayload({ name: 'x', meal_group: [] })).toBe(false);
    expect(hasMealGroupPayload({ name: 'x', meal_group: 'nope' })).toBe(false);
  });

  it('does not crash on null/undefined/primitive payloads', () => {
    expect(hasMealGroupPayload(null)).toBe(false);
    expect(hasMealGroupPayload(undefined)).toBe(false);
    expect(hasMealGroupPayload('string')).toBe(false);
    expect(hasMealGroupPayload(42)).toBe(false);
  });
});

describe('isGroupedMealEntry', () => {
  it('is true only for an intake entry with a meal_group', () => {
    expect(isGroupedMealEntry({ type: 'intake', payload: payload() })).toBe(true);
  });

  it('is false for non-intake entry types even with a meal_group payload', () => {
    expect(isGroupedMealEntry({ type: 'water', payload: payload() })).toBe(false);
    expect(isGroupedMealEntry({ type: 'note', payload: payload() })).toBe(false);
  });

  it('is false for a flat intake entry (no meal_group)', () => {
    expect(
      isGroupedMealEntry({ type: 'intake', payload: { name: 'Apple', calories: 95 } }),
    ).toBe(false);
  });

  it('does not crash on malformed entries', () => {
    expect(isGroupedMealEntry(null)).toBe(false);
    expect(isGroupedMealEntry({})).toBe(false);
    expect(isGroupedMealEntry({ type: 'intake' })).toBe(false);
    expect(isGroupedMealEntry({ type: 'intake', payload: null })).toBe(false);
  });
});

// ============================================================================
// buildGroupedMealView — top-level projection
// ============================================================================

describe('buildGroupedMealView — top level', () => {
  it('returns null for a non-grouped payload (caller renders it flat)', () => {
    expect(buildGroupedMealView({ name: 'Apple', calories: 95 })).toBeNull();
    expect(buildGroupedMealView(null)).toBeNull();
  });

  it('projects name, consumed servings, calories, and macros from the top level', () => {
    const view = buildGroupedMealView(payload())!;
    expect(view).not.toBeNull();
    expect(view.name).toBe('Bean Bowl');
    expect(view.consumedServings).toBe(1);
    expect(view.unit).toBe('serving');
    expect(view.calories).toBe(250);
    expect(view.macros).toEqual({ protein: 20, carbs: 24, fat: 6 });
  });

  it('surfaces ALREADY-CONSUMED top-level nutrition as-is (does not re-multiply)', () => {
    // Write path stores consumed totals on payload.calories/macros while
    // quantity mirrors consumed servings; the view must not multiply again.
    const view = buildGroupedMealView(
      payload({ quantity: 2, calories: 500, macros: { protein: 40, carbs: 48, fat: 12 } }),
    )!;
    expect(view.calories).toBe(500);
    expect(view.macros).toEqual({ protein: 40, carbs: 48, fat: 12 });
  });

  it('falls back to meal_group.totals when the top-level mirror is absent', () => {
    const view = buildGroupedMealView({
      name: 'Bean Bowl',
      meal_group: group({
        totals: { calories: 300, macros: { protein_g: 25, carbs_g: 30, fat_g: 8 } },
      }),
    })!;
    expect(view.calories).toBe(300);
    expect(view.macros).toEqual({ protein: 25, carbs: 30, fat: 8 });
  });

  it('reflects needs_review and derives a source label', () => {
    const reviewView = buildGroupedMealView(
      payload({ meal_group: group({ needs_review: true }) }),
    )!;
    expect(reviewView.needsReview).toBe(true);

    const plannedView = buildGroupedMealView(
      payload({ meal_group: group({ source_planned_meal_id: 'plan-9' }) }),
    )!;
    expect(plannedView.sourceLabel).toBe('Planned meal');

    const savedView = buildGroupedMealView(
      payload({
        meal_group: group({ source_meal_document_id: null, source_template_id: 'tmpl-1' }),
      }),
    )!;
    expect(savedView.sourceLabel).toBe('Saved meal');
  });

  it('falls back to meal_group.name and a default when payload.name is missing', () => {
    const fromGroup = buildGroupedMealView({ meal_group: group({ name: 'Soup' }) })!;
    expect(fromGroup.name).toBe('Soup');

    const fallback = buildGroupedMealView({ meal_group: group({ name: '' }) })!;
    expect(fallback.name).toBe('Meal');
  });
});

// ============================================================================
// buildGroupedMealView — detail expansion content
// ============================================================================

describe('buildGroupedMealView — detail', () => {
  it('projects three components without collapsing them into one row', () => {
    const view = buildGroupedMealView(
      payload({
        meal_group: group({
          components: [
            component({ component_id: 'a', name: 'Beans', quantity: 1, unit: 'cup' }),
            component({ component_id: 'b', name: 'Rice', quantity: 0.5, unit: 'cup' }),
            component({ component_id: 'c', name: 'Salsa', quantity: 2, unit: 'tbsp' }),
          ],
        }),
      }),
    )!;
    expect(view.components).toHaveLength(3);
    expect(view.components.map((c) => c.name)).toEqual(['Beans', 'Rice', 'Salsa']);
    expect(view.components[0].amount).toBe('1 cup');
    expect(view.components[1].amount).toBe('0.5 cup');
  });

  it('uses raw_text / normalized_name fallback and flags review/match status', () => {
    const view = buildGroupedMealView(
      payload({
        meal_group: group({
          components: [
            component({
              component_id: 'x',
              name: '',
              raw_text: '1 splash olive oil',
              quantity: null,
              unit: null,
              match_status: 'guessed',
              needs_review: true,
              preparation_note: 'to taste',
            }),
          ],
        }),
      }),
    )!;
    const c = view.components[0];
    expect(c.name).toBe('1 splash olive oil');
    expect(c.amount).toBeNull();
    expect(c.prepNote).toBe('to taste');
    expect(c.needsReview).toBe(true);
    expect(c.matchStatus).toBe('guessed');
  });

  it('projects instruction steps sorted by step number', () => {
    const view = buildGroupedMealView(
      payload({
        meal_group: group({
          steps: [
            { step_number: 2, instruction: 'Plate.' },
            { step_number: 1, instruction: 'Cook beans.' },
          ],
        }),
      }),
    )!;
    expect(view.steps).toEqual([
      { stepNumber: 1, instruction: 'Cook beans.' },
      { stepNumber: 2, instruction: 'Plate.' },
    ]);
  });

  it('surfaces instance notes when present', () => {
    const view = buildGroupedMealView(
      payload({ meal_group: group({ instance_notes: 'extra hot sauce' }) }),
    )!;
    expect(view.instanceNotes).toBe('extra hot sauce');
  });

  it('returns empty detail collections when components/steps are missing', () => {
    const view = buildGroupedMealView({
      name: 'Mystery Meal',
      meal_group: { schema_version: 1, name: 'Mystery Meal' },
    })!;
    expect(view.components).toEqual([]);
    expect(view.steps).toEqual([]);
    expect(view.instanceNotes).toBeNull();
  });
});

// ============================================================================
// buildGroupedMealView — malformed payload degradation (no crash)
// ============================================================================

describe('buildGroupedMealView — malformed payloads degrade gracefully', () => {
  it('survives a meal_group whose components is not an array', () => {
    const view = buildGroupedMealView({
      name: 'Bad Meal',
      meal_group: { components: 'oops', totals: null },
    })!;
    expect(view.name).toBe('Bad Meal');
    expect(view.components).toEqual([]);
    expect(view.calories).toBeNull();
    expect(view.macros).toBeNull();
  });

  it('survives non-object component entries and non-finite numbers', () => {
    const view = buildGroupedMealView({
      name: 'Bad Meal',
      calories: NaN,
      meal_group: {
        components: [null, 42, { name: 'OK', quantity: 'x', calories: Infinity }],
        steps: [null, { instruction: 'do thing' }, { step_number: 'no', instruction: 5 }],
      },
    })!;
    // Calories NaN is rejected; no totals ⇒ null.
    expect(view.calories).toBeNull();
    // Two non-object components are skipped-as-empty but never crash; the valid
    // one projects with safe defaults.
    expect(view.components).toHaveLength(3);
    const valid = view.components[2];
    expect(valid.name).toBe('OK');
    expect(valid.amount).toBeNull();
    expect(valid.calories).toBeNull();
    // Only the step with a string instruction survives.
    expect(view.steps).toEqual([{ stepNumber: 2, instruction: 'do thing' }]);
  });

  it('does not throw on a deeply empty meal_group', () => {
    expect(() => buildGroupedMealView({ meal_group: {} })).not.toThrow();
    const view = buildGroupedMealView({ meal_group: {} })!;
    expect(view.name).toBe('Meal');
    expect(view.consumedServings).toBeNull();
  });
});
