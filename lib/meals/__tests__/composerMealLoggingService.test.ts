import type { MealComponent, MealDocument } from '../types';

// ----------------------------------------------------------------------------
// Mocks — isolate from the DB + journal layer. Notably, this module must
// NEVER touch mealDocumentServerService (no DB round trip to log a draft).
// ----------------------------------------------------------------------------

let mockGetMealDocument!: jest.Mock;
jest.mock('../mealDocumentServerService', () => {
  mockGetMealDocument = jest.fn();
  return { getMealDocumentForPerson: mockGetMealDocument };
});

let mockCreateEntry!: jest.Mock;
jest.mock('@/lib/journal/journalServerService', () => {
  mockCreateEntry = jest.fn();
  return { createEntry: mockCreateEntry };
});

import { GroupedMealLogValidationError } from '../groupedMealLoggingService';
import { logInMemoryMealDocumentForPerson } from '../composerMealLoggingService';

const PERSON = 'person-1';

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
    schema_version: 1,
    id: null,
    person_id: null,
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Bean Bowl',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [component()],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: { calories: 250, macros: { protein_g: 20, carbs_g: 24, fat_g: 6 } },
    totals: null,
    source: { source_type: 'manual', source_imported_meal_id: null, source_planned_meal_id: null, source_template_id: null },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetMealDocument.mockReset();
  mockCreateEntry.mockReset();
  mockCreateEntry.mockImplementation(async (args: { payload: unknown }) => ({
    id: 'entry-1',
    type: 'intake',
    payload: args.payload,
  }));
});

describe('logInMemoryMealDocumentForPerson', () => {
  it('logs an UNSAVED document (id null) without any DB lookup', async () => {
    const entry = await logInMemoryMealDocumentForPerson(PERSON, doc({ id: null }), { consumed_servings: 1 });
    expect(entry.id).toBe('entry-1');
    expect(mockGetMealDocument).not.toHaveBeenCalled();
  });

  it('creates exactly one journal entry as entry_type intake for the caller personId', async () => {
    await logInMemoryMealDocumentForPerson(PERSON, doc(), { consumed_servings: 1 });
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
    const args = mockCreateEntry.mock.calls[0][0];
    expect(args.entryType).toBe('intake');
    expect(args.personId).toBe(PERSON);
  });

  it('produces a payload with a meal_group — the same grouped shape as logMealDocumentForPerson', async () => {
    await logInMemoryMealDocumentForPerson(PERSON, doc(), { consumed_servings: 2 });
    const args = mockCreateEntry.mock.calls[0][0];
    expect(args.payload.meal_group).toBeDefined();
    expect(args.payload.unit).toBe('serving');
    expect(args.payload.quantity).toBe(2);
    expect(args.payload.calories).toBe(500);
  });

  it('rejects invalid input before writing anything', async () => {
    await expect(
      logInMemoryMealDocumentForPerson(PERSON, doc(), { consumed_servings: -1 }),
    ).rejects.toBeInstanceOf(GroupedMealLogValidationError);
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  it('does not invent nutrition for a needs-review draft', async () => {
    const d = doc({ review_state: 'needs_review', components: [component({ needs_review: true })] });
    await logInMemoryMealDocumentForPerson(PERSON, d, { consumed_servings: 1 });
    const args = mockCreateEntry.mock.calls[0][0];
    expect(args.payload.calories).toBeUndefined();
    expect(args.payload.meal_group.needs_review).toBe(true);
  });
});
