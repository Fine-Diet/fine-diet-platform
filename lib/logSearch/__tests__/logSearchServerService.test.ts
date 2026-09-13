import type { MealDocument } from '@/lib/meals/types';

const mockSearchFoods = jest.fn();
const mockListMealTemplates = jest.fn();
const mockListImportedMeals = jest.fn();
const mockListMealDocumentsForPerson = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: {} }));
jest.mock('@/lib/food/foodServerService', () => ({
  searchFoods: mockSearchFoods,
}));
jest.mock('@/lib/journal/journalServerService', () => ({
  listMealTemplates: mockListMealTemplates,
}));
jest.mock('@/lib/plans/importsServerService', () => ({
  listImportedMeals: mockListImportedMeals,
}));
jest.mock('@/lib/meals/mealDocumentServerService', () => ({
  listMealDocumentsForPerson: mockListMealDocumentsForPerson,
}));

import {
  dedupeMealDocumentsPreferFirst,
  logSearch,
} from '../logSearchServerService';

function mealDocument(
  id: string,
  title: string,
  source: MealDocument['source'] = { source_type: 'manual' },
): MealDocument {
  return {
    schema_version: 1,
    document_version: 1,
    id,
    person_id: 'person-a',
    kind: 'meal',
    review_state: 'confirmed',
    lifecycle_state: 'active',
    archived_at: null,
    title,
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [
      {
        component_id: 'component-1',
        component_kind: 'food_concept',
        name: 'Chicken',
        quantity: 1,
        unit: 'serving',
        food_object_id: 'food-1',
        serving_size_g: 100,
        calories: 400,
        macros: { protein_g: 35, carbs_g: 20, fat_g: 12 },
        nutrition_basis: 'per_serving',
        match_status: 'matched',
        source_kind: 'food_object',
        needs_review: false,
      },
    ],
    yield: { servings: 1, yield_label: 'serving', confirmed: true },
    recipe_yield_servings: 1,
    serving_label: 'serving',
    prep_notes: null,
    per_serving: {
      calories: 400,
      macros: { protein_g: 35, carbs_g: 20, fat_g: 12 },
    },
    totals: {
      calories: 400,
      macros: { protein_g: 35, carbs_g: 20, fat_g: 12 },
    },
    source,
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: '2026-09-09T12:00:00.000Z',
    updated_at: '2026-09-09T12:00:00.000Z',
  };
}

describe('Packet 14A canonical Meal Log discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchFoods.mockResolvedValue({ sections: [], debug: undefined });
    mockListMealTemplates.mockResolvedValue([]);
    mockListImportedMeals.mockResolvedValue([]);
    mockListMealDocumentsForPerson.mockResolvedValue([]);
  });

  it('returns a newly-created canonical MealDocument as one Meal result', async () => {
    const canonical = mealDocument('document-new', 'Founder QA Lunch');
    mockListMealDocumentsForPerson.mockResolvedValue([canonical]);

    const result = await logSearch('Founder QA Lunch', 'person-a', {
      banks: ['meals'],
    });

    expect(mockListMealDocumentsForPerson).toHaveBeenCalledWith('person-a', {
      kind: 'meal',
    });
    expect(result.results).toEqual([
      expect.objectContaining({
        kind: 'meal',
        id: 'document-new',
        title: 'Founder QA Lunch',
        meal: canonical,
      }),
    ]);
    expect(result.banks.meals.total).toBe(1);
  });

  it('prefers a canonical document over the same legacy Saved Meal source', () => {
    const canonical = mealDocument('document-1', 'Canonical Lunch', {
      source_type: 'saved_meal',
      source_template_id: 'template-1',
    });
    const legacy = mealDocument('template-1', 'Legacy Lunch', {
      source_type: 'saved_meal',
      source_template_id: 'template-1',
    });

    expect(dedupeMealDocumentsPreferFirst([canonical, legacy])).toEqual([
      canonical,
    ]);
  });
});
