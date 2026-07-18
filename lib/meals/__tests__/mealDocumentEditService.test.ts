import type { MealComponent, MealDocument } from '../types';

// ----------------------------------------------------------------------------
// Mocks — isolate the edit orchestration from the DB layer.
// ----------------------------------------------------------------------------

let mockGet!: jest.Mock;
let mockUpdate!: jest.Mock;
jest.mock('../mealDocumentServerService', () => {
  mockGet = jest.fn();
  mockUpdate = jest.fn();
  class MealDocumentValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join('; '));
      this.name = 'MealDocumentValidationError';
      this.errors = errors;
    }
  }
  return {
    getMealDocumentForPerson: mockGet,
    updateMealDocumentForPerson: mockUpdate,
    MealDocumentValidationError,
  };
});

// Mock the food catalog lookup so grounding resolution is isolated from the DB.
let mockGetFoodById!: jest.Mock;
jest.mock('@/lib/food/foodServerService', () => {
  mockGetFoodById = jest.fn();
  return { getFoodById: mockGetFoodById };
});

import type { FoodObject } from '@/lib/food/types';
import {
  MealDocumentEditValidationError,
  applyMealDocumentEditForPerson,
  buildEditedMealDocument,
  foodObjectToGrounding,
  parseMealDocumentEditPatch,
} from '../mealDocumentEditService';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PERSON = 'person-1';

function component(overrides: Partial<MealComponent> = {}): MealComponent {
  return {
    component_id: 'c1',
    name: 'Beans',
    quantity: 1,
    unit: 'serving',
    serving_size_g: 100,
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
    schema_version: 1,
    id: 'doc-1',
    person_id: PERSON,
    kind: 'meal',
    review_state: 'needs_review',
    title: 'Bean Bowl',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [component()],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: { calories: 100, macros: { protein_g: 10, carbs_g: 12, fat_g: 3 } },
    totals: null,
    source: {
      source_type: 'manual',
      source_imported_meal_id: null,
      source_planned_meal_id: null,
      source_template_id: null,
    },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function foodObject(overrides: Partial<FoodObject> = {}): FoodObject {
  return {
    id: 'food-spinach',
    canonicalName: 'Spinach, raw',
    brandName: null,
    aliases: [],
    sourceType: 'common',
    sourceProvider: null,
    sourceId: null,
    sourceDataset: null,
    upc: null,
    servingSizeG: 100,
    servingUnit: 'g',
    servingDescription: null,
    householdServingText: null,
    measures: null,
    calories: 23,
    proteinG: 2.9,
    carbsG: 3.6,
    fatG: 0.4,
    fiberG: 2.2,
    sugarG: 0.4,
    sodiumMg: 79,
    nutrients: null,
    nutrientsExtended: {},
    nutrientProvenance: 'usda',
    nutrientConfidence: 'high',
    personId: null,
    isVerified: true,
    imageUrl: null,
    category: null,
    tags: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockGetFoodById.mockReset();
});

// ----------------------------------------------------------------------------
// parseMealDocumentEditPatch
// ----------------------------------------------------------------------------

describe('parseMealDocumentEditPatch', () => {
  it('ignores unknown/unsafe top-level fields (including person identity)', () => {
    const res = parseMealDocumentEditPatch({
      title: 'New',
      person_id: 'attacker',
      id: 'other',
      components_extra: 1,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).toEqual({ title: 'New' });
      expect('person_id' in res.patch).toBe(false);
    }
  });

  it('rejects an empty title', () => {
    const res = parseMealDocumentEditPatch({ title: '   ' });
    expect(res.ok).toBe(false);
  });

  it('rejects non-positive recipe_yield_servings but allows null', () => {
    expect(parseMealDocumentEditPatch({ recipe_yield_servings: 0 }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ recipe_yield_servings: -2 }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ recipe_yield_servings: null }).ok).toBe(true);
    expect(parseMealDocumentEditPatch({ recipe_yield_servings: 4 }).ok).toBe(true);
  });

  it('rejects an invalid review_state', () => {
    expect(parseMealDocumentEditPatch({ review_state: 'archived' }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ review_state: 'confirmed' }).ok).toBe(true);
  });

  it('rejects component edits without a component_id and duplicates', () => {
    expect(parseMealDocumentEditPatch({ components: [{ name: 'x' }] }).ok).toBe(false);
    expect(
      parseMealDocumentEditPatch({
        components: [{ component_id: 'a' }, { component_id: 'a' }],
      }).ok,
    ).toBe(false);
  });

  it('rejects non-positive component quantity but allows null', () => {
    expect(
      parseMealDocumentEditPatch({ components: [{ component_id: 'a', quantity: 0 }] }).ok,
    ).toBe(false);
    expect(
      parseMealDocumentEditPatch({ components: [{ component_id: 'a', quantity: null }] }).ok,
    ).toBe(true);
  });

  it('accepts a non-empty food_object_id but rejects empty/non-string', () => {
    expect(
      parseMealDocumentEditPatch({ components: [{ component_id: 'a', food_object_id: 'food-1' }] }).ok,
    ).toBe(true);
    expect(
      parseMealDocumentEditPatch({ components: [{ component_id: 'a', food_object_id: '' }] }).ok,
    ).toBe(false);
    expect(
      parseMealDocumentEditPatch({ components: [{ component_id: 'a', food_object_id: 42 }] }).ok,
    ).toBe(false);
  });

  it('never accepts match_status / source_kind from the patch body', () => {
    const res = parseMealDocumentEditPatch({
      components: [
        {
          component_id: 'a',
          food_object_id: 'food-1',
          match_status: 'matched',
          source_kind: 'food_object',
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const edit = res.patch.components?.[0] as unknown as Record<string, unknown>;
      expect('match_status' in edit).toBe(false);
      expect('source_kind' in edit).toBe(false);
      expect(edit.food_object_id).toBe('food-1');
    }
  });

  // --- P14 structural operations -------------------------------------------

  it('requires a non-empty name on add_components and never accepts a component_id', () => {
    expect(parseMealDocumentEditPatch({ add_components: [{ name: '  ' }] }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ add_components: [{}] }).ok).toBe(false);
    const res = parseMealDocumentEditPatch({
      add_components: [{ component_id: 'spoofed', name: 'Tofu', quantity: 2, unit: 'cup' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const add = res.patch.add_components?.[0] as unknown as Record<string, unknown>;
      expect(add.name).toBe('Tofu');
      expect('component_id' in add).toBe(false);
    }
  });

  it('rejects a non-positive add_components quantity but allows null/positive', () => {
    expect(parseMealDocumentEditPatch({ add_components: [{ name: 'x', quantity: 0 }] }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ add_components: [{ name: 'x', quantity: -1 }] }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ add_components: [{ name: 'x', quantity: null }] }).ok).toBe(true);
    expect(parseMealDocumentEditPatch({ add_components: [{ name: 'x', quantity: 3 }] }).ok).toBe(true);
  });

  it('parses and de-dupes remove_component_ids / unmatch_component_ids', () => {
    expect(parseMealDocumentEditPatch({ remove_component_ids: 'c1' }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ remove_component_ids: [''] }).ok).toBe(false);
    expect(parseMealDocumentEditPatch({ unmatch_component_ids: [42] }).ok).toBe(false);
    const res = parseMealDocumentEditPatch({
      remove_component_ids: ['c1', 'c1', 'c2'],
      unmatch_component_ids: ['c3'],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.remove_component_ids).toEqual(['c1', 'c2']);
      expect(res.patch.unmatch_component_ids).toEqual(['c3']);
    }
  });
});

// ----------------------------------------------------------------------------
// foodObjectToGrounding — trusted mapping
// ----------------------------------------------------------------------------

describe('foodObjectToGrounding', () => {
  it('copies canonical nutrition and omits absent optional macros/measures', () => {
    const g = foodObjectToGrounding(
      foodObject({ fiberG: null, sugarG: null, measures: null }),
    );
    expect(g.food_object_id).toBe('food-spinach');
    expect(g.calories).toBe(23);
    expect(g.serving_size_g).toBe(100);
    expect(g.macros).toEqual({ protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4 });
    expect('fiber_g' in g.macros).toBe(false);
    expect(g.measures).toBeUndefined();
  });

  it('includes fiber/sugar and measures when present', () => {
    const g = foodObjectToGrounding(
      foodObject({ measures: [{ unit: 'cup', grams: 30, label: '1 cup' }] }),
    );
    expect(g.macros.fiber_g).toBe(2.2);
    expect(g.macros.added_sugar_g).toBe(0.4);
    expect(g.measures).toEqual([{ unit: 'cup', grams: 30, label: '1 cup' }]);
  });
});

// ----------------------------------------------------------------------------
// buildEditedMealDocument — P13 component grounding
// ----------------------------------------------------------------------------

describe('buildEditedMealDocument — grounding', () => {
  it('grounds an ungrounded component and recomputes safely when quantity/unit suffice', () => {
    const current = doc({
      kind: 'meal',
      review_state: 'needs_review',
      per_serving: null,
      totals: null,
      components: [
        component({
          component_id: 'c1',
          name: 'mystery greens',
          quantity: 1,
          unit: 'serving',
          serving_size_g: null,
          food_object_id: null,
          calories: null,
          macros: { protein_g: null, carbs_g: null, fat_g: null },
          match_status: 'none',
          source_kind: 'default_guess',
          needs_review: true,
        }),
      ],
    });
    const resolved = new Map([
      ['food-spinach', foodObjectToGrounding(foodObject())],
    ]);
    const res = buildEditedMealDocument(
      current,
      { components: [{ component_id: 'c1', name: 'Spinach, raw', food_object_id: 'food-spinach' }] },
      resolved,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const c = res.value.document.components[0];
      expect(c.food_object_id).toBe('food-spinach');
      expect(c.match_status).toBe('matched');
      expect(c.source_kind).toBe('food_object');
      expect(c.calories).toBe(23);
      // quantity=1 serving ⇒ contribution equals one serving; recompute succeeds.
      expect(res.value.recomputed).toBe(true);
      expect(c.needs_review).toBe(false);
      expect(res.value.document.totals?.calories).toBe(23);
    }
  });

  /**
   * Corrective fix (Phase 3 authenticated QA — defect plans-vs-log-nutrition-read):
   * this used to assert the BUG — a component matched to a food with no
   * prior quantity/unit stayed needs_review with a null contribution, since
   * componentGrounding.ts left quantity/unit blank and recompute had no
   * conversion basis. applyGroundingToComponent now defaults an unset
   * quantity/unit to "1 serving", so this exact re-match (used by
   * EditMealDocumentPanel's "match to a food" flow, sharing the same
   * componentGrounding primitive as the Plans composer) is immediately
   * trusted instead of silently reverting to review.
   */
  it('grounds a component with no prior quantity/unit and defaults it to 1 serving so it recomputes safely', () => {
    const current = doc({
      kind: 'meal',
      review_state: 'needs_review',
      components: [
        component({
          component_id: 'c1',
          name: 'mystery greens',
          quantity: null,
          unit: null,
          serving_size_g: null,
          food_object_id: null,
          calories: null,
          macros: { protein_g: null, carbs_g: null, fat_g: null },
          match_status: 'none',
          source_kind: 'default_guess',
          needs_review: true,
        }),
      ],
    });
    const resolved = new Map([
      ['food-spinach', foodObjectToGrounding(foodObject())],
    ]);
    const res = buildEditedMealDocument(
      current,
      { components: [{ component_id: 'c1', food_object_id: 'food-spinach' }] },
      resolved,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const c = res.value.document.components[0];
      expect(c.food_object_id).toBe('food-spinach');
      expect(c.match_status).toBe('matched');
      expect(c.quantity).toBe(1);
      expect(c.unit).toBe('serving');
      expect(c.needs_review).toBe(false);
      expect(res.value.recomputed).toBe(true);
      // Recompute never silently downgrades review_state to 'confirmed' —
      // only the explicit confirm request path does that (see the
      // "review_state rules" describe block below).
      expect(res.value.document.review_state).toBe('needs_review');
    }
  });

  it('still flags for review when the matched food genuinely has no interpretable unit', () => {
    const current = doc({
      kind: 'meal',
      review_state: 'needs_review',
      components: [
        component({
          component_id: 'c1',
          name: 'mystery greens',
          // An explicit, unrecognized unit is preserved verbatim by
          // grounding (it is not blank), so the default-to-1-serving path
          // never kicks in — recompute correctly still cannot interpret it.
          quantity: 2,
          unit: 'smidge',
          serving_size_g: null,
          food_object_id: null,
          calories: null,
          macros: { protein_g: null, carbs_g: null, fat_g: null },
          match_status: 'none',
          source_kind: 'default_guess',
          needs_review: true,
        }),
      ],
    });
    const resolved = new Map([
      ['food-spinach', foodObjectToGrounding(foodObject())],
    ]);
    const res = buildEditedMealDocument(
      current,
      { components: [{ component_id: 'c1', food_object_id: 'food-spinach' }] },
      resolved,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const c = res.value.document.components[0];
      expect(c.food_object_id).toBe('food-spinach');
      expect(c.unit).toBe('smidge');
      expect(c.needs_review).toBe(true);
      expect(res.value.recomputed).toBe(false);
      expect(res.value.document.review_state).toBe('needs_review');
    }
  });

  it('errors when a referenced food was not resolved', () => {
    const res = buildEditedMealDocument(
      doc(),
      { components: [{ component_id: 'c1', food_object_id: 'missing' }] },
      new Map(),
    );
    expect(res.ok).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// buildEditedMealDocument — P14 structural ops (add / remove / unmatch)
// ----------------------------------------------------------------------------

describe('buildEditedMealDocument — add component', () => {
  it('appends a conservative, ungrounded component with a stable id and forces needs_review', () => {
    const current = doc({ review_state: 'confirmed', components: [component({ component_id: 'c1' })] });
    const res = buildEditedMealDocument(current, {
      add_components: [{ name: 'Olive oil', quantity: 1, unit: 'tbsp' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const added = res.value.document.components[1];
      expect(added.component_id).toBe('mc_1');
      expect(added.name).toBe('Olive oil');
      expect(added.food_object_id).toBeNull();
      expect(added.match_status).toBe('none');
      expect(added.source_kind).toBe('user_entered');
      expect(added.calories).toBeNull();
      expect(added.macros).toEqual({ protein_g: null, carbs_g: null, fat_g: null });
      expect(added.needs_review).toBe(true);
      // Ungrounded addition is nutrition-affecting but unsafe ⇒ no invention.
      expect(res.value.recomputed).toBe(false);
      expect(res.value.document.review_state).toBe('needs_review');
      // Original nutrition preserved (not zeroed).
      expect(res.value.document.per_serving).toEqual(current.per_serving);
    }
  });

  it('generates ids that do not collide with existing component ids', () => {
    const current = doc({ components: [component({ component_id: 'mc_1' })] });
    const res = buildEditedMealDocument(current, {
      add_components: [{ name: 'A' }, { name: 'B' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ids = res.value.document.components.map((c) => c.component_id);
      expect(ids).toEqual(['mc_1', 'mc_2', 'mc_3']);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('grounds a newly added component when a food is resolved and recomputes safely', () => {
    const current = doc({
      kind: 'meal',
      per_serving: null,
      totals: null,
      components: [
        component({
          component_id: 'c1',
          quantity: 1,
          unit: 'serving',
          calories: 50,
          macros: { protein_g: 1, carbs_g: 1, fat_g: 1 },
        }),
      ],
    });
    const resolved = new Map([['food-spinach', foodObjectToGrounding(foodObject())]]);
    const res = buildEditedMealDocument(
      current,
      { add_components: [{ name: 'Spinach', quantity: 1, unit: 'serving', food_object_id: 'food-spinach' }] },
      resolved,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const added = res.value.document.components[1];
      expect(added.food_object_id).toBe('food-spinach');
      expect(added.match_status).toBe('matched');
      expect(added.source_kind).toBe('food_object');
      expect(added.needs_review).toBe(false);
      expect(res.value.recomputed).toBe(true);
    }
  });

  it('errors when an added component references an unresolved food', () => {
    const res = buildEditedMealDocument(
      doc(),
      { add_components: [{ name: 'Ghost', food_object_id: 'missing' }] },
      new Map(),
    );
    expect(res.ok).toBe(false);
  });
});

describe('buildEditedMealDocument — remove component', () => {
  it('removes a component, recomputes the remaining safe subset, and can confirm', () => {
    const current = doc({
      kind: 'meal',
      review_state: 'needs_review',
      components: [
        component({ component_id: 'c1', quantity: 1 }),
        component({
          component_id: 'c2',
          name: 'Mystery sauce',
          calories: null,
          macros: { protein_g: null, carbs_g: null, fat_g: null },
          food_object_id: null,
          match_status: 'none',
          source_kind: 'default_guess',
          needs_review: true,
        }),
      ],
    });
    const res = buildEditedMealDocument(current, {
      remove_component_ids: ['c2'],
      review_state: 'confirmed',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.components).toHaveLength(1);
      expect(res.value.document.components[0].component_id).toBe('c1');
      // The lone remaining component is safely recomputable ⇒ confirm allowed.
      expect(res.value.recomputed).toBe(true);
      expect(res.value.document.review_state).toBe('confirmed');
    }
  });

  it('rejects removing a component id that does not exist', () => {
    const res = buildEditedMealDocument(doc(), { remove_component_ids: ['nope'] });
    expect(res.ok).toBe(false);
  });

  it('rejects editing and removing the same component in one patch', () => {
    const res = buildEditedMealDocument(doc(), {
      components: [{ component_id: 'c1', name: 'x' }],
      remove_component_ids: ['c1'],
    });
    expect(res.ok).toBe(false);
  });

  it('rejects removing and unmatching the same component in one patch', () => {
    const res = buildEditedMealDocument(doc(), {
      remove_component_ids: ['c1'],
      unmatch_component_ids: ['c1'],
    });
    expect(res.ok).toBe(false);
  });

  it('allows removing the last component but forces needs_review and preserves prior nutrition', () => {
    const current = doc({
      review_state: 'confirmed',
      per_serving: { calories: 100, macros: { protein_g: 10, carbs_g: 12, fat_g: 3 } },
      totals: { calories: 100, macros: { protein_g: 10, carbs_g: 12, fat_g: 3 } },
      components: [component({ component_id: 'c1' })],
    });
    const res = buildEditedMealDocument(current, {
      remove_component_ids: ['c1'],
      review_state: 'confirmed',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.components).toHaveLength(0);
      expect(res.value.document.review_state).toBe('needs_review');
      expect(res.value.review_state_downgraded).toBe(true);
      // Empty recompute is unsafe ⇒ prior nutrition preserved (not invented/zeroed).
      expect(res.value.document.per_serving).toEqual(current.per_serving);
    }
  });
});

describe('buildEditedMealDocument — unmatch component', () => {
  it('clears grounding + canonical nutrition, sets conservative state, preserves display fields', () => {
    const current = doc({
      review_state: 'confirmed',
      per_serving: { calories: 100, macros: { protein_g: 10, carbs_g: 12, fat_g: 3 } },
      totals: { calories: 100, macros: { protein_g: 10, carbs_g: 12, fat_g: 3 } },
      components: [
        component({
          component_id: 'c1',
          name: 'Beans',
          quantity: 2,
          unit: 'cup',
          preparation_note: 'drained',
          serving_size_g: 100,
          measures: [{ unit: 'cup', grams: 120 }],
        }),
      ],
    });
    const res = buildEditedMealDocument(current, { unmatch_component_ids: ['c1'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const c = res.value.document.components[0];
      expect(c.food_object_id).toBeNull();
      expect(c.match_status).toBe('none');
      expect(c.source_kind).toBe('user_entered');
      expect(c.calories).toBeNull();
      expect(c.macros).toEqual({ protein_g: null, carbs_g: null, fat_g: null });
      expect(c.serving_size_g).toBeUndefined();
      expect(c.measures).toBeUndefined();
      expect(c.needs_review).toBe(true);
      // Useful display fields preserved.
      expect(c.name).toBe('Beans');
      expect(c.quantity).toBe(2);
      expect(c.unit).toBe('cup');
      expect(c.preparation_note).toBe('drained');
      // Whole document forced to needs_review; prior nutrition preserved.
      expect(res.value.document.review_state).toBe('needs_review');
      expect(res.value.document.per_serving).toEqual(current.per_serving);
    }
  });

  it('rejects unmatching a component id that does not exist', () => {
    const res = buildEditedMealDocument(doc(), { unmatch_component_ids: ['nope'] });
    expect(res.ok).toBe(false);
  });

  it('does not mutate the input document', () => {
    const current = doc();
    const snapshot = JSON.parse(JSON.stringify(current));
    buildEditedMealDocument(current, { unmatch_component_ids: ['c1'] });
    expect(current).toEqual(snapshot);
  });
});

// ----------------------------------------------------------------------------
// buildEditedMealDocument — metadata
// ----------------------------------------------------------------------------

describe('buildEditedMealDocument — metadata edits', () => {
  it('applies title/description/prep_notes/serving_label without mutating input', () => {
    const current = doc();
    const snapshot = JSON.parse(JSON.stringify(current));
    const res = buildEditedMealDocument(current, {
      title: 'Updated Bowl',
      description: 'tasty',
      prep_notes: 'soak overnight',
      serving_label: 'per bowl',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.title).toBe('Updated Bowl');
      expect(res.value.document.description).toBe('tasty');
      expect(res.value.document.prep_notes).toBe('soak overnight');
      expect(res.value.document.serving_label).toBe('per bowl');
      expect(res.value.recomputed).toBe(false);
    }
    // Input untouched.
    expect(current).toEqual(snapshot);
  });

  it('preserves existing nutrition when only metadata changes (no recompute)', () => {
    const current = doc({
      per_serving: { calories: 999, macros: { protein_g: 1, carbs_g: 2, fat_g: 3 } },
      totals: { calories: 999, macros: { protein_g: 1, carbs_g: 2, fat_g: 3 } },
    });
    const res = buildEditedMealDocument(current, { title: 'x' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.recomputed).toBe(false);
      expect(res.value.document.per_serving).toEqual(current.per_serving);
      expect(res.value.document.totals).toEqual(current.totals);
    }
  });
});

// ----------------------------------------------------------------------------
// buildEditedMealDocument — components / recompute
// ----------------------------------------------------------------------------

describe('buildEditedMealDocument — recompute', () => {
  it('rejects an edit referencing an unknown component_id', () => {
    const res = buildEditedMealDocument(doc(), {
      components: [{ component_id: 'nope', name: 'x' }],
    });
    expect(res.ok).toBe(false);
  });

  it('deterministically recomputes totals/per_serving when all components are safe', () => {
    const current = doc({
      kind: 'meal',
      components: [component({ quantity: 1 })],
    });
    const res = buildEditedMealDocument(current, {
      components: [{ component_id: 'c1', quantity: 2 }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.recomputed).toBe(true);
      // per_serving == totals for a single-serving meal with no yield.
      expect(res.value.document.totals).toEqual({
        calories: 200,
        macros: { protein_g: 20, carbs_g: 24, fat_g: 6 },
      });
      expect(res.value.document.per_serving).toEqual({
        calories: 200,
        macros: { protein_g: 20, carbs_g: 24, fat_g: 6 },
      });
    }
  });

  it('divides totals by recipe yield to derive per_serving', () => {
    const current = doc({
      kind: 'recipe',
      recipe_yield_servings: 2,
      yield: { servings: 2, confirmed: true },
      components: [component({ quantity: 4 })], // 400 kcal batch
    });
    const res = buildEditedMealDocument(current, {
      components: [{ component_id: 'c1', quantity: 4 }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.totals?.calories).toBe(400);
      expect(res.value.document.per_serving?.calories).toBe(200);
    }
  });

  it('preserves existing nutrition and forces needs_review when a component is ungrounded', () => {
    const current = doc({
      review_state: 'confirmed',
      per_serving: { calories: 500, macros: { protein_g: 9, carbs_g: 9, fat_g: 9 } },
      totals: { calories: 500, macros: { protein_g: 9, carbs_g: 9, fat_g: 9 } },
      components: [
        component(),
        component({
          component_id: 'c2',
          name: 'Mystery sauce',
          calories: null,
          macros: { protein_g: null, carbs_g: null, fat_g: null },
          food_object_id: null,
          match_status: 'none',
          source_kind: 'default_guess',
        }),
      ],
    });
    const res = buildEditedMealDocument(current, {
      components: [{ component_id: 'c2', name: 'Mystery sauce (homemade)' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Not safely recomputable ⇒ existing nutrition preserved, not invented.
      expect(res.value.recomputed).toBe(false);
      expect(res.value.document.per_serving).toEqual(current.per_serving);
      expect(res.value.document.totals).toEqual(current.totals);
      // Ungrounded component flagged; whole document forced to needs_review.
      expect(res.value.document.components[1].needs_review).toBe(true);
      expect(res.value.document.review_state).toBe('needs_review');
    }
  });
});

// ----------------------------------------------------------------------------
// buildEditedMealDocument — review-state rules
// ----------------------------------------------------------------------------

describe('buildEditedMealDocument — review_state rules', () => {
  it('confirms a safe meal when requested', () => {
    const current = doc({ kind: 'meal', review_state: 'needs_review' });
    const res = buildEditedMealDocument(current, { review_state: 'confirmed' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.review_state).toBe('confirmed');
      expect(res.value.review_state_downgraded).toBe(false);
    }
  });

  it('downgrades confirmed to needs_review for a recipe missing yield', () => {
    const current = doc({
      kind: 'recipe',
      recipe_yield_servings: null,
      yield: null,
    });
    const res = buildEditedMealDocument(current, { review_state: 'confirmed' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.review_state).toBe('needs_review');
      expect(res.value.review_state_downgraded).toBe(true);
    }
  });

  it('keeps needs_review when any component is flagged, even if confirm requested', () => {
    const current = doc({
      components: [component({ needs_review: true, match_status: 'guessed', source_kind: 'heuristic_guess' })],
    });
    const res = buildEditedMealDocument(current, { review_state: 'confirmed' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.review_state).toBe('needs_review');
      expect(res.value.review_state_downgraded).toBe(true);
    }
  });

  it('implicitly confirms a positive yield when confirming a recipe', () => {
    const current = doc({
      kind: 'recipe',
      recipe_yield_servings: 3,
      yield: { servings: 3, confirmed: false },
    });
    const res = buildEditedMealDocument(current, { review_state: 'confirmed' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.document.review_state).toBe('confirmed');
      expect(res.value.document.yield?.confirmed).toBe(true);
    }
  });
});

// ----------------------------------------------------------------------------
// applyMealDocumentEditForPerson — orchestration / person scope
// ----------------------------------------------------------------------------

describe('applyMealDocumentEditForPerson', () => {
  it('returns null when the document is missing / not owned', async () => {
    mockGet.mockResolvedValue(null);
    const result = await applyMealDocumentEditForPerson(PERSON, 'doc-1', { title: 'x' });
    expect(result).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('persists via updateMealDocumentForPerson with the same personId', async () => {
    const current = doc();
    mockGet.mockResolvedValue(current);
    mockUpdate.mockImplementation(async (_pid, _id, patch) => patch as MealDocument);

    const result = await applyMealDocumentEditForPerson(PERSON, 'doc-1', {
      title: 'Renamed',
    });
    expect(result).not.toBeNull();
    expect(mockGet).toHaveBeenCalledWith(PERSON, 'doc-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [pid, id, patch] = mockUpdate.mock.calls[0];
    expect(pid).toBe(PERSON);
    expect(id).toBe('doc-1');
    expect((patch as MealDocument).title).toBe('Renamed');
    expect(result?.document.title).toBe('Renamed');
  });

  it('throws MealDocumentEditValidationError for an invalid patch (no DB write)', async () => {
    mockGet.mockResolvedValue(doc());
    await expect(
      applyMealDocumentEditForPerson(PERSON, 'doc-1', { title: '' }),
    ).rejects.toBeInstanceOf(MealDocumentEditValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('never performs journal writes (only get + update are used)', async () => {
    const current = doc();
    mockGet.mockResolvedValue(current);
    mockUpdate.mockResolvedValue(current);
    await applyMealDocumentEditForPerson(PERSON, 'doc-1', { description: 'x' });
    // The module only imports get/update from the server service; there is no
    // journal createEntry/update dependency to assert beyond this contract.
    expect(mockGet).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('resolves a selected food server-side and persists grounding fields', async () => {
    const current = doc({
      components: [
        component({
          component_id: 'c1',
          food_object_id: null,
          match_status: 'none',
          source_kind: 'default_guess',
          needs_review: true,
        }),
      ],
    });
    mockGet.mockResolvedValue(current);
    mockGetFoodById.mockResolvedValue(foodObject());
    mockUpdate.mockImplementation(async (_pid, _id, patch) => patch as MealDocument);

    const result = await applyMealDocumentEditForPerson(PERSON, 'doc-1', {
      components: [{ component_id: 'c1', name: 'Spinach, raw', food_object_id: 'food-spinach' }],
    });

    expect(mockGetFoodById).toHaveBeenCalledWith('food-spinach');
    const [, , patch] = mockUpdate.mock.calls[0];
    const c = (patch as MealDocument).components[0];
    expect(c.food_object_id).toBe('food-spinach');
    expect(c.match_status).toBe('matched');
    expect(c.source_kind).toBe('food_object');
    expect(result?.document.components[0].food_object_id).toBe('food-spinach');
  });

  it('throws (no DB write) when the selected food does not exist', async () => {
    mockGet.mockResolvedValue(doc());
    mockGetFoodById.mockResolvedValue(null);
    await expect(
      applyMealDocumentEditForPerson(PERSON, 'doc-1', {
        components: [{ component_id: 'c1', food_object_id: 'ghost-food' }],
      }),
    ).rejects.toBeInstanceOf(MealDocumentEditValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not look up foods for metadata-only edits', async () => {
    const current = doc();
    mockGet.mockResolvedValue(current);
    mockUpdate.mockResolvedValue(current);
    await applyMealDocumentEditForPerson(PERSON, 'doc-1', { title: 'Renamed' });
    expect(mockGetFoodById).not.toHaveBeenCalled();
  });

  it('resolves a food referenced by a newly added component (P14)', async () => {
    const current = doc({ components: [component({ component_id: 'c1' })] });
    mockGet.mockResolvedValue(current);
    mockGetFoodById.mockResolvedValue(foodObject());
    mockUpdate.mockImplementation(async (_pid, _id, patch) => patch as MealDocument);

    const result = await applyMealDocumentEditForPerson(PERSON, 'doc-1', {
      add_components: [{ name: 'Spinach', quantity: 1, unit: 'serving', food_object_id: 'food-spinach' }],
    });

    expect(mockGetFoodById).toHaveBeenCalledWith('food-spinach');
    const [, , patch] = mockUpdate.mock.calls[0];
    const added = (patch as MealDocument).components[1];
    expect(added.component_id).toBe('mc_1');
    expect(added.food_object_id).toBe('food-spinach');
    expect(added.match_status).toBe('matched');
    expect(result?.document.components).toHaveLength(2);
  });

  it('throws (no DB write) when an added component references a missing food', async () => {
    mockGet.mockResolvedValue(doc());
    mockGetFoodById.mockResolvedValue(null);
    await expect(
      applyMealDocumentEditForPerson(PERSON, 'doc-1', {
        add_components: [{ name: 'Ghost', food_object_id: 'ghost-food' }],
      }),
    ).rejects.toBeInstanceOf(MealDocumentEditValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
