/**
 * Meal Object Foundation — Packet 15: MealDocument detail API route tests.
 *
 * Route-level contract tests for GET/PATCH /api/journal/meals/documents/[id].
 * No live DB, Supabase, food search, AI, or network — auth and persistence are
 * mocked at narrow boundaries; the real route handler and edit orchestration run.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import type { MealComponent, MealDocument } from '@/lib/meals/types';

// ----------------------------------------------------------------------------
// Mocks — auth + persistence only (no journal writes).
// ----------------------------------------------------------------------------

const CALLER_PERSON = 'person-caller';
const OTHER_PERSON = 'person-other';
const DOC_ID = 'doc-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockResolveJournalTargetPerson = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
  resolveJournalTargetPerson: (...args: unknown[]) => mockResolveJournalTargetPerson(...args),
}));

let mockGetMealDocument!: jest.Mock;
let mockUpdateMealDocument!: jest.Mock;

jest.mock('@/lib/meals/mealDocumentServerService', () => {
  mockGetMealDocument = jest.fn();
  mockUpdateMealDocument = jest.fn();
  class MealDocumentValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join('; '));
      this.name = 'MealDocumentValidationError';
      this.errors = errors;
    }
  }
  return {
    getMealDocumentForPerson: mockGetMealDocument,
    updateMealDocumentForPerson: mockUpdateMealDocument,
    MealDocumentValidationError,
  };
});

let mockGetFoodById!: jest.Mock;
jest.mock('@/lib/food/foodServerService', () => {
  mockGetFoodById = jest.fn();
  return { getFoodById: mockGetFoodById };
});

const mockJournalCreateEntry = jest.fn();
const mockJournalUpdateEntry = jest.fn();
jest.mock('@/lib/journal/journalServerService', () => ({
  createJournalEntry: mockJournalCreateEntry,
  updateJournalEntry: mockJournalUpdateEntry,
  getPersonIdFromAuthUserId: jest.fn(),
}));

import handler from '@/pages/api/journal/meals/documents/[id]';

// ----------------------------------------------------------------------------
// Lightweight Next.js API harness
// ----------------------------------------------------------------------------

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  ended: boolean;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
  };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get headers() {
      return state.headers;
    },
    get body() {
      return state.body;
    },
    get ended() {
      return state.ended;
    },
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      state.ended = true;
      return res as NextApiResponse;
    },
    setHeader(key: string, value: string | string[]) {
      state.headers[key] = value;
      return res as NextApiResponse;
    },
    end() {
      state.ended = true;
      return res as NextApiResponse;
    },
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(
  method: string,
  options: {
    id?: string | string[];
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): NextApiRequest {
  return {
    method,
    query: {
      id: options.id ?? DOC_ID,
      ...options.query,
    },
    body: options.body,
    headers: {},
  } as NextApiRequest;
}

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

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

function mealDoc(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: 1,
    id: DOC_ID,
    person_id: CALLER_PERSON,
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

function foodObject() {
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
  };
}

function authContext(personId = CALLER_PERSON) {
  return { user: { id: 'user-1', email: 'a@b.com', role: 'user' }, personId };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue(authContext());
  mockRequireCallerJournalAccess.mockResolvedValue(true);
  mockResolveJournalTargetPerson.mockResolvedValue(CALLER_PERSON);
  mockGetMealDocument.mockReset();
  mockUpdateMealDocument.mockReset();
  mockGetFoodById.mockReset();
  mockJournalCreateEntry.mockReset();
  mockJournalUpdateEntry.mockReset();

  mockUpdateMealDocument.mockImplementation(async (_pid, _id, patch) => patch as MealDocument);
});

// ----------------------------------------------------------------------------
// GET
// ----------------------------------------------------------------------------

describe('GET /api/journal/meals/documents/[id]', () => {
  it('returns 200 with the full document for an owned id', async () => {
    const document = mealDoc();
    mockGetMealDocument.mockResolvedValue(document);
    const res = createMockRes();

    await handler(createReq('GET'), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { document: MealDocument }).document).toEqual(document);
    expect(mockGetMealDocument).toHaveBeenCalledWith(CALLER_PERSON, DOC_ID);
    expect(mockResolveJournalTargetPerson).toHaveBeenCalled();
  });

  it('returns 404 when the document is missing or not owned', async () => {
    mockGetMealDocument.mockResolvedValue(null);
    const res = createMockRes();

    await handler(createReq('GET'), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Meal document not found.' });
  });
});

// ----------------------------------------------------------------------------
// PATCH — metadata, validation, not found
// ----------------------------------------------------------------------------

describe('PATCH /api/journal/meals/documents/[id]', () => {
  it('returns 200 for a safe metadata edit with response shape flags', async () => {
    const current = mealDoc();
    mockGetMealDocument.mockResolvedValue(current);
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { title: 'Renamed Bowl' } }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      document: MealDocument;
      review_state_downgraded?: boolean;
      recomputed?: boolean;
    };
    expect(body.document.title).toBe('Renamed Bowl');
    expect(typeof body.review_state_downgraded).toBe('boolean');
    expect(typeof body.recomputed).toBe('boolean');
    expect(body.recomputed).toBe(false);
    expect(mockUpdateMealDocument).toHaveBeenCalledWith(
      CALLER_PERSON,
      DOC_ID,
      expect.objectContaining({ title: 'Renamed Bowl' }),
    );
  });

  it('returns 400 for an invalid patch body', async () => {
    mockGetMealDocument.mockResolvedValue(mealDoc());
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { title: '' } }), res);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; details?: string[] };
    expect(body.error).toMatch(/Invalid meal document edit/i);
    expect(body.details?.length).toBeGreaterThan(0);
    expect(mockUpdateMealDocument).not.toHaveBeenCalled();
  });

  it('returns 404 when the document is missing or not owned', async () => {
    mockGetMealDocument.mockResolvedValue(null);
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { title: 'x' } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Meal document not found.' });
    expect(mockUpdateMealDocument).not.toHaveBeenCalled();
  });

  it('uses personId from auth context, not from the request body', async () => {
    mockGetMealDocument.mockResolvedValue(mealDoc());
    const res = createMockRes();

    await handler(
      createReq('PATCH', {
        body: { title: 'Safe', person_id: OTHER_PERSON, id: 'spoofed-doc' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockGetMealDocument).toHaveBeenCalledWith(CALLER_PERSON, DOC_ID);
    expect(mockUpdateMealDocument).toHaveBeenCalledWith(
      CALLER_PERSON,
      DOC_ID,
      expect.anything(),
    );
    expect(mockGetMealDocument).not.toHaveBeenCalledWith(OTHER_PERSON, expect.anything());
  });

  it('cannot update another person’s document (scoped load returns null)', async () => {
    mockGetMealDocument.mockResolvedValue(null);
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { title: 'Stolen' } }), res);

    expect(res.statusCode).toBe(404);
    expect(mockUpdateMealDocument).not.toHaveBeenCalled();
  });

  it('does not call journal entry write APIs on a successful PATCH', async () => {
    mockGetMealDocument.mockResolvedValue(mealDoc());
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { description: 'note' } }), res);

    expect(res.statusCode).toBe(200);
    expect(mockJournalCreateEntry).not.toHaveBeenCalled();
    expect(mockJournalUpdateEntry).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// PATCH — P14 structural operations (real edit orchestration)
// ----------------------------------------------------------------------------

describe('PATCH structural operations', () => {
  it('adds a component via add_components', async () => {
    mockGetMealDocument.mockResolvedValue(mealDoc());
    const res = createMockRes();

    await handler(
      createReq('PATCH', { body: { add_components: [{ name: 'Olive oil', quantity: 1, unit: 'tbsp' }] } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const { document } = res.body as { document: MealDocument };
    expect(document.components).toHaveLength(2);
    expect(document.components[1].name).toBe('Olive oil');
    expect(document.components[1].component_id).toBe('mc_1');
    expect(document.components[1].needs_review).toBe(true);
  });

  it('removes a component via remove_component_ids', async () => {
    mockGetMealDocument.mockResolvedValue(
      mealDoc({
        components: [
          component({ component_id: 'c1' }),
          component({
            component_id: 'c2',
            name: 'Rice',
            food_object_id: null,
            match_status: 'none',
            source_kind: 'user_entered',
            needs_review: true,
            calories: null,
            macros: { protein_g: null, carbs_g: null, fat_g: null },
          }),
        ],
      }),
    );
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { remove_component_ids: ['c2'] } }), res);

    expect(res.statusCode).toBe(200);
    const { document } = res.body as { document: MealDocument };
    expect(document.components).toHaveLength(1);
    expect(document.components[0].component_id).toBe('c1');
  });

  it('unmatches a component via unmatch_component_ids', async () => {
    mockGetMealDocument.mockResolvedValue(mealDoc());
    const res = createMockRes();

    await handler(
      createReq('PATCH', { body: { unmatch_component_ids: ['c1'] } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const c = (res.body as { document: MealDocument }).document.components[0];
    expect(c.food_object_id).toBeNull();
    expect(c.match_status).toBe('none');
    expect(c.source_kind).toBe('user_entered');
    expect(c.calories).toBeNull();
    expect(c.name).toBe('Beans');
  });
});

// ----------------------------------------------------------------------------
// PATCH — grounding
// ----------------------------------------------------------------------------

describe('PATCH component grounding', () => {
  it('grounds a component when the selected food exists', async () => {
    mockGetMealDocument.mockResolvedValue(
      mealDoc({
        components: [
          component({
            food_object_id: null,
            match_status: 'none',
            source_kind: 'default_guess',
            needs_review: true,
            calories: null,
            macros: { protein_g: null, carbs_g: null, fat_g: null },
          }),
        ],
      }),
    );
    mockGetFoodById.mockResolvedValue(foodObject());
    const res = createMockRes();

    await handler(
      createReq('PATCH', {
        body: {
          components: [{ component_id: 'c1', name: 'Spinach, raw', food_object_id: 'food-spinach' }],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockGetFoodById).toHaveBeenCalledWith('food-spinach');
    const c = (res.body as { document: MealDocument }).document.components[0];
    expect(c.food_object_id).toBe('food-spinach');
    expect(c.match_status).toBe('matched');
    const body = res.body as { recomputed: boolean };
    expect(body.recomputed).toBe(true);
  });

  it('returns 400 when the selected food does not exist (no DB write)', async () => {
    mockGetMealDocument.mockResolvedValue(mealDoc());
    mockGetFoodById.mockResolvedValue(null);
    const res = createMockRes();

    await handler(
      createReq('PATCH', {
        body: { components: [{ component_id: 'c1', food_object_id: 'ghost-food' }] },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(mockUpdateMealDocument).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Method / id guards
// ----------------------------------------------------------------------------

describe('route guards', () => {
  it('returns 405 with Allow: GET, PATCH for unsupported methods', async () => {
    const res = createMockRes();

    await handler(createReq('DELETE'), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method DELETE not allowed' });
    expect(res.headers.Allow).toEqual(['GET', 'PATCH']);
    expect(mockRequireJournalAuth).not.toHaveBeenCalled();
  });

  it('returns 400 when the meal document id is missing', async () => {
    const res = createMockRes();

    await handler(createReq('GET', { id: '' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing meal document id.' });
    expect(mockRequireJournalAuth).not.toHaveBeenCalled();
  });

  it('stops PATCH when caller journal access is denied', async () => {
    mockRequireCallerJournalAccess.mockResolvedValue(false);
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { title: 'x' } }), res);

    expect(mockGetMealDocument).not.toHaveBeenCalled();
    expect(mockUpdateMealDocument).not.toHaveBeenCalled();
  });
});
