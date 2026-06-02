import type {
  ImportedMeal,
  ImportedMealDraftIngredient,
  IngredientMatchEntry,
} from '@/lib/plans/types';
import type { MealDerivedData } from '@/lib/nds/types';

import type { MealDocument } from '../types';

// ----------------------------------------------------------------------------
// Mocks — isolate the import-orchestration logic from the DB layer.
// ----------------------------------------------------------------------------

let mockGetImportedMeal!: jest.Mock;
jest.mock('@/lib/plans/importsServerService', () => {
  mockGetImportedMeal = jest.fn();
  return { getImportedMeal: mockGetImportedMeal };
});

let mockCreate!: jest.Mock;
let mockUpdate!: jest.Mock;
let mockFindBySource!: jest.Mock;
jest.mock('../mealDocumentServerService', () => {
  mockCreate = jest.fn();
  mockUpdate = jest.fn();
  mockFindBySource = jest.fn();
  return {
    createMealDocumentForPerson: mockCreate,
    updateMealDocumentForPerson: mockUpdate,
    findMealDocumentBySourceImportedMeal: mockFindBySource,
    // Real error class is re-imported by callers; a stub is fine for these tests.
    MealDocumentValidationError: class extends Error {},
  };
});

import {
  ImportedMealNotFoundError,
  MealYieldConfirmationError,
  confirmImportedMealYieldAndSave,
  saveImportedMealAsMealDocumentDraft,
} from '../importToMealDocumentService';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PERSON = 'person-1';

function derived(): MealDerivedData {
  return {
    protein_score_10: 7,
    is_main_meal: true,
    meal_calories: 500,
    meal_protein_g: 30,
    psq_multiplier: 1,
  };
}

function ingredient(
  raw: string,
  name: string,
): ImportedMealDraftIngredient {
  return {
    raw_text: raw,
    normalized_name: name,
    quantity_value: 1,
    quantity_unit: 'cup',
    preparation_note: null,
  };
}

function match(
  index: number,
  name: string,
  status: IngredientMatchEntry['match_status'],
  sourceKind: IngredientMatchEntry['source_kind'],
): IngredientMatchEntry {
  return {
    ingredient_index: index,
    raw_text: name,
    normalized_name: name,
    quantity_value: 1,
    quantity_unit: 'cup',
    preparation_note: null,
    match_status: status,
    confidence: status === 'matched' ? 'high' : 'low',
    source_kind: sourceKind,
    source_id: sourceKind === 'food_object' ? `food-${name}` : null,
    source_label: name,
    per_serving_estimate: {
      calories: 100,
      protein_g: 10,
      carbs_g: 12,
      fat_g: 3,
    },
    explanation: null,
  };
}

function importedMeal(
  overrides: {
    ingredients?: ImportedMealDraftIngredient[];
    matches?: IngredientMatchEntry[];
    steps?: { step_number: number; instruction: string }[];
    servings?: number | null;
    parse_status?: ImportedMeal['parse_status'];
  } = {},
): ImportedMeal {
  return {
    id: 'imp-1',
    person_id: PERSON,
    title: 'Imported Soup',
    source_type: 'url',
    source_url: 'https://example.com/soup',
    payload: {},
    import_type: 'url',
    source_platform: 'example.com',
    raw_input_text: 'raw recipe text',
    parse_status: overrides.parse_status ?? 'parsed',
    parsed_payload_json: {
      title: 'Imported Soup',
      description: 'tasty',
      servings: overrides.servings ?? null,
      ingredients: overrides.ingredients ?? [ingredient('1 cup beans', 'beans')],
      steps: overrides.steps ?? [],
      meal_type_hint: 'dinner',
    },
    nutrition_estimate_json: {
      per_serving: {
        calories: 250,
        protein_g: 20,
        carbs_g: 24,
        fat_g: 6,
        fiber_g: null,
        added_sugar_g: null,
      },
      servings: overrides.servings ?? null,
      confidence: 'medium',
      source: 'parsed_from_recipe',
      notes: null,
    },
    ingredient_match_json: overrides.matches ?? [match(0, 'beans', 'matched', 'food_object')],
    protein_score_10: 7,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: derived(),
    nds_confidence: 'medium',
    nds_version: 'v1',
    classifier_version: 'v1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };
}

beforeEach(() => {
  mockGetImportedMeal.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockFindBySource.mockReset();

  // Default: import is owned, no existing document, create echoes the doc.
  mockGetImportedMeal.mockImplementation(async (personId: string, id: string) =>
    personId === PERSON && id === 'imp-1' ? importedMeal() : null,
  );
  mockFindBySource.mockResolvedValue(null);
  mockCreate.mockImplementation(async (personId: string, doc: MealDocument) => ({
    ...doc,
    id: 'doc-1',
    person_id: personId,
  }));
  mockUpdate.mockImplementation(
    async (personId: string, id: string, doc: MealDocument) => ({
      ...doc,
      id,
      person_id: personId,
    }),
  );
});

// ============================================================================
// Person scope / ownership
// ============================================================================

describe('person scope', () => {
  it('loads the imported meal scoped to the caller personId', async () => {
    await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(mockGetImportedMeal).toHaveBeenCalledWith(PERSON, 'imp-1');
  });

  it('throws ImportedMealNotFoundError when the import is not owned', async () => {
    mockGetImportedMeal.mockResolvedValue(null);
    await expect(
      saveImportedMealAsMealDocumentDraft('other-person', 'imp-1'),
    ).rejects.toBeInstanceOf(ImportedMealNotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('stamps the caller personId as the owner on the saved document', async () => {
    const doc = await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(doc.person_id).toBe(PERSON);
    const [, savedDoc] = mockCreate.mock.calls[0];
    expect(savedDoc.person_id).toBe(PERSON);
  });
});

// ============================================================================
// Draft save — never confirmed
// ============================================================================

describe('saveImportedMealAsMealDocumentDraft', () => {
  it('never produces a confirmed document and leaves yield unconfirmed', async () => {
    const doc = await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(doc.review_state).not.toBe('confirmed');
    if (doc.yield) expect(doc.yield.confirmed).toBe(false);
  });

  it('preserves imported provenance in document_json.source', async () => {
    const doc = await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(doc.source.source_type).toBe('imported');
    expect(doc.source.source_imported_meal_id).toBe('imp-1');
    expect(doc.source.source_url).toBe('https://example.com/soup');
    expect(doc.source.import_type).toBe('url');
    expect(doc.source.source_platform).toBe('example.com');
    expect(doc.source.raw_input_text).toBe('raw recipe text');
  });

  it('maps imported ingredient match metadata onto components', async () => {
    mockGetImportedMeal.mockResolvedValue(
      importedMeal({
        ingredients: [ingredient('1 cup beans', 'beans'), ingredient('1 cup rice', 'rice')],
        matches: [
          match(0, 'beans', 'matched', 'food_object'),
          match(1, 'rice', 'guessed', 'heuristic_guess'),
        ],
      }),
    );
    const doc = await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(doc.components).toHaveLength(2);
    expect(doc.components[0].match_status).toBe('matched');
    expect(doc.components[0].food_object_id).toBe('food-beans');
    expect(doc.components[0].raw_text).toBe('1 cup beans');
    expect(doc.components[1].match_status).toBe('guessed');
    expect(doc.components[1].needs_review).toBe(true);
  });

  it('marks needs_review when a component is ungrounded and never invents totals', async () => {
    mockGetImportedMeal.mockResolvedValue(
      importedMeal({
        matches: [match(0, 'beans', 'none', 'default_guess')],
      }),
    );
    const doc = await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(doc.review_state).toBe('needs_review');
    // Estimate preserved; totals NOT fabricated.
    expect(doc.totals).toBeNull();
    expect(doc.per_serving?.calories).toBe(250);
  });
});

// ============================================================================
// Confirm yield + save
// ============================================================================

describe('confirmImportedMealYieldAndSave', () => {
  it('rejects a missing or non-positive yield (yield is never inferred)', async () => {
    await expect(
      confirmImportedMealYieldAndSave(PERSON, 'imp-1', { servings: 0 }),
    ).rejects.toBeInstanceOf(MealYieldConfirmationError);
    await expect(
      confirmImportedMealYieldAndSave(PERSON, 'imp-1', {
        servings: NaN as unknown as number,
      }),
    ).rejects.toBeInstanceOf(MealYieldConfirmationError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('confirms a fully-grounded recipe with explicit yield', async () => {
    mockGetImportedMeal.mockResolvedValue(
      importedMeal({
        ingredients: [ingredient('1 cup beans', 'beans')],
        matches: [match(0, 'beans', 'matched', 'food_object')],
        steps: [{ step_number: 1, instruction: 'Cook the beans.' }],
      }),
    );
    const result = await confirmImportedMealYieldAndSave(PERSON, 'imp-1', {
      servings: 4,
      serving_label: 'per bowl',
    });
    expect(result.confirmed).toBe(true);
    expect(result.document.kind).toBe('recipe');
    expect(result.document.review_state).toBe('confirmed');
    expect(result.document.recipe_yield_servings).toBe(4);
    expect(result.document.serving_label).toBe('per bowl');
    expect(result.document.yield?.confirmed).toBe(true);
    expect(result.document.yield?.servings).toBe(4);
  });

  it('records confirmed yield but holds review when a component is ungrounded', async () => {
    mockGetImportedMeal.mockResolvedValue(
      importedMeal({
        matches: [match(0, 'beans', 'guessed', 'heuristic_guess')],
        steps: [{ step_number: 1, instruction: 'Cook.' }],
      }),
    );
    const result = await confirmImportedMealYieldAndSave(PERSON, 'imp-1', {
      servings: 2,
    });
    expect(result.confirmed).toBe(false);
    expect(result.document.review_state).toBe('needs_review');
    // Yield is still explicitly recorded as confirmed.
    expect(result.document.yield?.confirmed).toBe(true);
    expect(result.document.recipe_yield_servings).toBe(2);
    // No invented nutrition.
    expect(result.document.totals).toBeNull();
  });
});

// ============================================================================
// Idempotent upsert
// ============================================================================

describe('idempotent upsert by source import', () => {
  it('updates the existing document instead of creating a duplicate', async () => {
    mockFindBySource.mockResolvedValue({ id: 'doc-existing' } as MealDocument);
    await saveImportedMealAsMealDocumentDraft(PERSON, 'imp-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toBe(PERSON);
    expect(mockUpdate.mock.calls[0][1]).toBe('doc-existing');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
