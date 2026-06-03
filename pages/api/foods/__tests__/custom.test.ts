/**
 * Meal Object Foundation — Packet 17: custom/provisional food creation route tests.
 *
 * Route-level contract tests for POST /api/foods/custom. No live DB / Supabase /
 * network — auth, person resolution, and the create service are mocked at narrow
 * boundaries; the real route handler (incl. its Zod validation) runs. Verifies
 * the public HTTP behavior: method guard, auth (401), person scope (403),
 * payload validation (400), success (201 with the created food), the fact that
 * person identity is derived from the session and NOT accepted from the body,
 * and that only a user-owned custom food is created.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const AUTH_USER_ID = 'auth-user-1';
const CALLER_PERSON = 'person-caller';

const mockGetUser = jest.fn();
const mockGetPersonId = jest.fn();
const mockCreateCustomFood = jest.fn();

jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromApi: (...args: unknown[]) => mockGetUser(...args),
}));

jest.mock('@/lib/journal/journalServerService', () => ({
  getPersonIdFromAuthUserId: (...args: unknown[]) => mockGetPersonId(...args),
}));

jest.mock('@/lib/food/foodServerService', () => ({
  createCustomFood: (...args: unknown[]) => mockCreateCustomFood(...args),
}));

import handler from '@/pages/api/foods/custom';

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
  const state: MockResponse = { statusCode: 200, headers: {}, body: undefined, ended: false };
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

function createReq(method: string, body?: unknown): NextApiRequest {
  return { method, query: {}, body, headers: {} } as NextApiRequest;
}

function fakeFood(overrides: Record<string, unknown> = {}) {
  return {
    id: 'food-new-1',
    canonicalName: 'Grandma chili',
    brandName: null,
    sourceType: 'user',
    personId: CALLER_PERSON,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: AUTH_USER_ID, email: 'a@b.com', role: 'user' });
  mockGetPersonId.mockResolvedValue(CALLER_PERSON);
  mockCreateCustomFood.mockResolvedValue(fakeFood());
});

// ----------------------------------------------------------------------------
// Method / auth / person-scope guards
// ----------------------------------------------------------------------------

describe('route guards', () => {
  it('returns 405 with Allow: POST for unsupported methods', async () => {
    const res = createMockRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(['POST']);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateCustomFood).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no authenticated user', async () => {
    mockGetUser.mockResolvedValue(null);
    const res = createMockRes();
    await handler(createReq('POST', { name: 'X' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(mockCreateCustomFood).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has no linked person record', async () => {
    mockGetPersonId.mockResolvedValue(null);
    const res = createMockRes();
    await handler(createReq('POST', { name: 'X' }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'No linked person record' });
    expect(mockCreateCustomFood).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------

describe('payload validation', () => {
  it('returns 400 when name is missing', async () => {
    const res = createMockRes();
    await handler(createReq('POST', {}), res);
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; errors?: { field: string }[] };
    expect(body.error).toBe('Validation failed');
    expect(mockCreateCustomFood).not.toHaveBeenCalled();
  });

  it('returns 400 when name is empty', async () => {
    const res = createMockRes();
    await handler(createReq('POST', { name: '' }), res);
    expect(res.statusCode).toBe(400);
    expect(mockCreateCustomFood).not.toHaveBeenCalled();
  });

  it('returns 400 with field errors for negative numeric values', async () => {
    const res = createMockRes();
    await handler(createReq('POST', { name: 'X', calories: -10 }), res);
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; errors?: { field: string }[] };
    expect(body.error).toBe('Validation failed');
    expect(body.errors?.some((e) => e.field === 'calories')).toBe(true);
    expect(mockCreateCustomFood).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Success + person-scope
// ----------------------------------------------------------------------------

describe('POST /api/foods/custom', () => {
  it('creates a user-owned food and returns 201 with the food', async () => {
    const food = fakeFood({ id: 'food-xyz' });
    mockCreateCustomFood.mockResolvedValue(food);
    const res = createMockRes();

    await handler(createReq('POST', { name: 'Grandma chili', calories: 320, proteinG: 18 }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ food });
    expect(mockCreateCustomFood).toHaveBeenCalledTimes(1);
    const [personArg, inputArg] = mockCreateCustomFood.mock.calls[0];
    expect(personArg).toBe(CALLER_PERSON);
    expect(inputArg).toMatchObject({ name: 'Grandma chili', calories: 320, proteinG: 18 });
  });

  it('derives personId from the session and ignores any person id in the body', async () => {
    const res = createMockRes();

    await handler(
      createReq('POST', { name: 'Safe', person_id: 'attacker', personId: 'attacker' }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(mockGetPersonId).toHaveBeenCalledWith(AUTH_USER_ID);
    const [personArg, inputArg] = mockCreateCustomFood.mock.calls[0];
    // person scope comes from the resolved session person, never the body.
    expect(personArg).toBe(CALLER_PERSON);
    expect(inputArg).not.toHaveProperty('person_id');
    expect(inputArg).not.toHaveProperty('personId');
  });

  it('creates a provisional food when nutrition is omitted (name only)', async () => {
    const res = createMockRes();
    await handler(createReq('POST', { name: 'Mystery dish' }), res);
    expect(res.statusCode).toBe(201);
    const [, inputArg] = mockCreateCustomFood.mock.calls[0];
    expect(inputArg).toEqual({ name: 'Mystery dish' });
    expect(inputArg).not.toHaveProperty('calories');
  });

  it('returns 500 when the create service throws', async () => {
    mockCreateCustomFood.mockRejectedValue(new Error('db down'));
    const res = createMockRes();
    await handler(createReq('POST', { name: 'X' }), res);
    expect(res.statusCode).toBe(500);
  });
});
