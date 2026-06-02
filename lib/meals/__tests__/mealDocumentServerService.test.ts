import type { MealDocument } from '../types';

// ----------------------------------------------------------------------------
// Supabase mock — a chainable, thenable query builder that consumes a queue of
// results in the order the service issues terminal operations.
// ----------------------------------------------------------------------------

let mockFrom!: jest.Mock;
let resultQueue: Array<{ data: unknown; error: unknown }> = [];
let capturedInsert: Record<string, unknown> | null = null;
let capturedUpdate: Record<string, unknown> | null = null;
let eqCalls: Array<[string, unknown]> = [];

function nextResult(): { data: unknown; error: unknown } {
  return resultQueue.shift() ?? { data: null, error: null };
}

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn();
  return { supabaseAdmin: { from: mockFrom } };
});

function makeBuilder() {
  const q: Record<string, unknown> = {};
  q.select = jest.fn(() => q);
  q.order = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.eq = jest.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return q;
  });
  q.insert = jest.fn((payload: Record<string, unknown>) => {
    capturedInsert = payload;
    return q;
  });
  q.update = jest.fn((payload: Record<string, unknown>) => {
    capturedUpdate = payload;
    return q;
  });
  q.single = jest.fn(() => Promise.resolve(nextResult()));
  q.maybeSingle = jest.fn(() => Promise.resolve(nextResult()));
  (q as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(nextResult()).then(resolve, reject);
  return q;
}

import {
  MealDocumentValidationError,
  createMealDocumentForPerson,
  findMealDocumentBySourceImportedMeal,
  getMealDocumentForPerson,
  listMealDocumentsForPerson,
  updateMealDocumentForPerson,
} from '../mealDocumentServerService';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const PERSON = 'person-1';

function validDoc(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: 1,
    id: null,
    person_id: null,
    kind: 'meal',
    review_state: 'draft',
    title: 'Test Meal',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: null,
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

function dbRow(doc: MealDocument, id = 'row-1', person = PERSON) {
  return {
    id,
    person_id: person,
    schema_version: doc.schema_version,
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    review_state: doc.review_state,
    intents: doc.intents,
    source_type: doc.source.source_type,
    source_id: doc.source.source_imported_meal_id ?? null,
    source_url: doc.source.source_url ?? null,
    document_json: doc,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
  };
}

beforeEach(() => {
  resultQueue = [];
  capturedInsert = null;
  capturedUpdate = null;
  eqCalls = [];
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => makeBuilder());
});

// ============================================================================
// create
// ============================================================================

describe('createMealDocumentForPerson', () => {
  it('stamps the owner and projects denormalized columns + document_json', async () => {
    const doc = validDoc();
    resultQueue = [{ data: dbRow({ ...doc, person_id: PERSON }), error: null }];

    const saved = await createMealDocumentForPerson(PERSON, doc);

    expect(saved.id).toBe('row-1');
    expect(saved.person_id).toBe(PERSON);
    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert?.person_id).toBe(PERSON);
    expect(capturedInsert?.title).toBe('Test Meal');
    expect((capturedInsert?.document_json as MealDocument).person_id).toBe(PERSON);
  });

  it('throws MealDocumentValidationError for an invalid document (no insert)', async () => {
    await expect(
      createMealDocumentForPerson(PERSON, validDoc({ title: '   ' })),
    ).rejects.toBeInstanceOf(MealDocumentValidationError);
    expect(capturedInsert).toBeNull();
  });

  it('rejects when the document is scoped to a different person', async () => {
    await expect(
      createMealDocumentForPerson(PERSON, validDoc({ person_id: 'someone-else' })),
    ).rejects.toBeInstanceOf(MealDocumentValidationError);
  });
});

// ============================================================================
// read
// ============================================================================

describe('getMealDocumentForPerson', () => {
  it('reads scoped to the owner and hydrates row identity', async () => {
    resultQueue = [{ data: dbRow(validDoc()), error: null }];
    const doc = await getMealDocumentForPerson(PERSON, 'row-1');
    expect(doc?.id).toBe('row-1');
    expect(eqCalls).toContainEqual(['id', 'row-1']);
    expect(eqCalls).toContainEqual(['person_id', PERSON]);
  });

  it('returns null when no row matches the owner', async () => {
    resultQueue = [{ data: null, error: null }];
    expect(await getMealDocumentForPerson(PERSON, 'missing')).toBeNull();
  });
});

describe('findMealDocumentBySourceImportedMeal', () => {
  it('queries person + imported source scope', async () => {
    const doc = validDoc({
      source: { source_type: 'imported', source_imported_meal_id: 'imp-1' },
    });
    resultQueue = [{ data: [dbRow(doc)], error: null }];
    const found = await findMealDocumentBySourceImportedMeal(PERSON, 'imp-1');
    expect(found?.id).toBe('row-1');
    expect(eqCalls).toContainEqual(['person_id', PERSON]);
    expect(eqCalls).toContainEqual(['source_type', 'imported']);
    expect(eqCalls).toContainEqual(['source_id', 'imp-1']);
  });

  it('returns null when no document was derived from the import', async () => {
    resultQueue = [{ data: [], error: null }];
    expect(await findMealDocumentBySourceImportedMeal(PERSON, 'imp-1')).toBeNull();
  });
});

describe('listMealDocumentsForPerson', () => {
  it('lists person-scoped documents', async () => {
    resultQueue = [{ data: [dbRow(validDoc()), dbRow(validDoc(), 'row-2')], error: null }];
    const docs = await listMealDocumentsForPerson(PERSON);
    expect(docs).toHaveLength(2);
    expect(eqCalls).toContainEqual(['person_id', PERSON]);
  });
});

// ============================================================================
// update
// ============================================================================

describe('updateMealDocumentForPerson', () => {
  it('merges the patch onto the current document and re-validates', async () => {
    const current = validDoc({ title: 'Old' });
    const updated = validDoc({ title: 'New', review_state: 'confirmed' });
    resultQueue = [
      { data: dbRow(current), error: null }, // load current
      { data: dbRow(updated), error: null }, // update result
    ];

    const result = await updateMealDocumentForPerson(PERSON, 'row-1', {
      title: 'New',
      review_state: 'confirmed',
    });

    expect(result?.title).toBe('New');
    expect(result?.review_state).toBe('confirmed');
    expect(capturedUpdate?.title).toBe('New');
    // Owner is forced from the scope, never the patch.
    expect((capturedUpdate?.document_json as MealDocument).person_id).toBe(PERSON);
  });

  it('returns null when no row matches the owner', async () => {
    resultQueue = [{ data: null, error: null }];
    const result = await updateMealDocumentForPerson(PERSON, 'missing', {
      title: 'New',
    });
    expect(result).toBeNull();
    expect(capturedUpdate).toBeNull();
  });
});
