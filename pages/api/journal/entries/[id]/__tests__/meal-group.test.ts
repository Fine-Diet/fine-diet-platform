/**
 * Meal Object Foundation — Packet 16: logged grouped meal instance route tests.
 *
 * Route-level contract tests for PATCH /api/journal/entries/[id]/meal-group.
 * No live DB / Supabase / network — auth + the edit service are mocked at narrow
 * boundaries; the real route handler runs. Verifies the public HTTP behavior:
 * auth/self-scope, 400/404/405, validation, and the response shape.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const ENTRY_ID = 'entry-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
  resolveJournalTargetPerson: jest.fn(),
}));

let mockApplyEdit!: jest.Mock;

jest.mock('@/lib/meals/loggedMealGroupInstanceEditService', () => {
  mockApplyEdit = jest.fn();
  class LoggedMealInstanceEditValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(`Invalid logged meal edit: ${errors.join('; ')}`);
      this.name = 'LoggedMealInstanceEditValidationError';
      this.errors = errors;
      // Preserve instanceof across the ES5 transpile target (matches the real class).
      Object.setPrototypeOf(this, LoggedMealInstanceEditValidationError.prototype);
    }
  }
  return {
    applyGroupedMealInstanceEditForPerson: mockApplyEdit,
    LoggedMealInstanceEditValidationError,
  };
});

import handler from '@/pages/api/journal/entries/[id]/meal-group';
import { LoggedMealInstanceEditValidationError } from '@/lib/meals/loggedMealGroupInstanceEditService';

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

function createReq(
  method: string,
  options: { id?: string | string[]; body?: unknown } = {},
): NextApiRequest {
  return {
    method,
    query: { id: options.id ?? ENTRY_ID },
    body: options.body,
    headers: {},
  } as NextApiRequest;
}

function authContext(personId = CALLER_PERSON) {
  return { user: { id: 'user-1', email: 'a@b.com', role: 'user' }, personId };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue(authContext());
  mockRequireCallerJournalAccess.mockResolvedValue(true);
  mockApplyEdit.mockReset();
});

// ----------------------------------------------------------------------------
// Method / id guards
// ----------------------------------------------------------------------------

describe('route guards', () => {
  it('returns 405 with Allow: PATCH for unsupported methods', async () => {
    const res = createMockRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method GET not allowed' });
    expect(res.headers.Allow).toEqual(['PATCH']);
    expect(mockRequireJournalAuth).not.toHaveBeenCalled();
  });

  it('returns 400 when the entry id is missing', async () => {
    const res = createMockRes();
    await handler(createReq('PATCH', { id: '' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing entry id.' });
    expect(mockRequireJournalAuth).not.toHaveBeenCalled();
  });

  it('stops when caller journal access is denied', async () => {
    mockRequireCallerJournalAccess.mockResolvedValue(false);
    const res = createMockRes();
    await handler(createReq('PATCH', { body: { name: 'x' } }), res);
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });

  it('stops when auth context is absent (401/403 already sent)', async () => {
    mockRequireJournalAuth.mockResolvedValue(null);
    const res = createMockRes();
    await handler(createReq('PATCH', { body: { name: 'x' } }), res);
    expect(mockRequireCallerJournalAccess).not.toHaveBeenCalled();
    expect(mockApplyEdit).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// PATCH behavior
// ----------------------------------------------------------------------------

describe('PATCH /api/journal/entries/[id]/meal-group', () => {
  it('returns 200 with the updated entry and response flags', async () => {
    const updatedEntry = { id: ENTRY_ID, type: 'intake', payload: { name: 'Adjusted' } };
    mockApplyEdit.mockResolvedValue({
      status: 'ok',
      entry: updatedEntry,
      recomputed: true,
      needs_review: false,
      detached_from_source: true,
    });
    const res = createMockRes();

    await handler(createReq('PATCH', { body: { name: 'Adjusted', consumed_servings: 4 } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      entry: updatedEntry,
      recomputed: true,
      needs_review: false,
      detached_from_source: true,
    });
  });

  it('derives personId from the auth context, not the body', async () => {
    mockApplyEdit.mockResolvedValue({
      status: 'ok',
      entry: { id: ENTRY_ID },
      recomputed: false,
      needs_review: false,
      detached_from_source: true,
    });
    const res = createMockRes();

    await handler(
      createReq('PATCH', { body: { name: 'Safe', person_id: 'attacker' } }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockApplyEdit).toHaveBeenCalledWith(CALLER_PERSON, ENTRY_ID, {
      name: 'Safe',
      person_id: 'attacker',
    });
  });

  it('returns 404 when the entry is missing or not owned', async () => {
    mockApplyEdit.mockResolvedValue({ status: 'not_found' });
    const res = createMockRes();
    await handler(createReq('PATCH', { body: { name: 'x' } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Journal entry not found.' });
  });

  it('returns 400 when the entry is not a grouped meal', async () => {
    mockApplyEdit.mockResolvedValue({ status: 'not_grouped' });
    const res = createMockRes();
    await handler(createReq('PATCH', { body: { name: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Journal entry is not a grouped meal.' });
  });

  it('returns 400 with details when the patch is invalid', async () => {
    mockApplyEdit.mockRejectedValue(
      new LoggedMealInstanceEditValidationError(['consumed_servings must be a finite number greater than 0']),
    );
    const res = createMockRes();
    await handler(createReq('PATCH', { body: { consumed_servings: 0 } }), res);
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; details?: string[] };
    expect(body.error).toMatch(/Invalid logged meal edit/i);
    expect(body.details?.length).toBeGreaterThan(0);
  });

  it('returns 500 on an unexpected error', async () => {
    mockApplyEdit.mockRejectedValue(new Error('boom'));
    const res = createMockRes();
    await handler(createReq('PATCH', { body: { name: 'x' } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
