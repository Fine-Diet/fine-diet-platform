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

import {
  MealDocumentEditValidationError,
  applyMealDocumentEditForPerson,
  buildEditedMealDocument,
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

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
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
});
