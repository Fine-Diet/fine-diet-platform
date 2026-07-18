/**
 * Route-level contract tests for POST /api/journal/meals/documents/log-instance.
 * No live DB — auth + the journal write are mocked; the real route handler
 * and composerMealLoggingService orchestration run.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MealDocument } from '@/lib/meals/types';

const CALLER_PERSON = 'person-caller';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

let mockGetMealDocument!: jest.Mock;
jest.mock('@/lib/meals/mealDocumentServerService', () => {
  mockGetMealDocument = jest.fn();
  return { getMealDocumentForPerson: mockGetMealDocument };
});

let mockCreateEntry!: jest.Mock;
jest.mock('@/lib/journal/journalServerService', () => {
  mockCreateEntry = jest.fn();
  return { createEntry: mockCreateEntry };
});

import handler from '@/pages/api/journal/meals/documents/log-instance';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, headers: {}, body: undefined };
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
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      return res as NextApiResponse;
    },
    setHeader(key: string, value: string | string[]) {
      state.headers[key] = value;
      return res as NextApiResponse;
    },
    end() {
      return res as NextApiResponse;
    },
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(method: string, body?: unknown): NextApiRequest {
  return { method, query: {}, body, headers: {} } as NextApiRequest;
}

function authContext(personId = CALLER_PERSON) {
  return { user: { id: 'user-1', email: 'a@b.com', role: 'user' }, personId };
}

function draftDocument(overrides: Partial<MealDocument> = {}): MealDocument {
  return {
    schema_version: 1,
    id: null,
    person_id: 'spoofed-person',
    kind: 'meal',
    review_state: 'confirmed',
    title: 'Bean Bowl',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [
      {
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
      },
    ],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: { calories: 250, macros: { protein_g: 20, carbs_g: 24, fat_g: 6 } },
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

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue(authContext());
  mockRequireCallerJournalAccess.mockResolvedValue(true);
  mockGetMealDocument.mockReset();
  mockCreateEntry.mockReset();
  mockCreateEntry.mockImplementation(async (args: { payload: unknown }) => ({
    id: 'entry-1',
    type: 'intake',
    payload: args.payload,
  }));
});

describe('POST /api/journal/meals/documents/log-instance', () => {
  it('logs an unsaved draft without any MealDocument DB lookup', async () => {
    const res = createMockRes();
    await handler(createReq('POST', { document: draftDocument(), consumed_servings: 1 }), res);

    expect(res.statusCode).toBe(201);
    expect(mockGetMealDocument).not.toHaveBeenCalled();
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
  });

  it('stamps the caller personId onto the entry, ignoring a spoofed document.person_id', async () => {
    const res = createMockRes();
    await handler(createReq('POST', { document: draftDocument({ person_id: 'attacker' }) }), res);

    const args = mockCreateEntry.mock.calls[0][0];
    expect(args.personId).toBe(CALLER_PERSON);
  });

  it('returns 400 for a malformed document', async () => {
    const res = createMockRes();
    await handler(createReq('POST', { document: { title: 'missing everything' } }), res);

    expect(res.statusCode).toBe(400);
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid log input (e.g. non-positive servings)', async () => {
    const res = createMockRes();
    await handler(
      createReq('POST', { document: draftDocument(), consumed_servings: -3 }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  it('returns 405 for unsupported methods without touching auth', async () => {
    const res = createMockRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
    expect(mockRequireJournalAuth).not.toHaveBeenCalled();
  });
});
