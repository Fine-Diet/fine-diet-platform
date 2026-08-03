/**
 * Route-level contract tests for POST /api/journal/meals/documents (create).
 * No live DB — auth + persistence are mocked; the real route handler runs.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

let mockCreateMealDocument!: jest.Mock;
jest.mock('@/lib/meals/mealDocumentServerService', () => {
  mockCreateMealDocument = jest.fn();
  class MealDocumentValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join('; '));
      this.name = 'MealDocumentValidationError';
      this.errors = errors;
      Object.setPrototypeOf(this, MealDocumentValidationError.prototype);
    }
  }
  return { createMealDocumentForPerson: mockCreateMealDocument, MealDocumentValidationError };
});

import handler from '@/pages/api/journal/meals/documents/index';

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

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue(authContext());
  mockRequireCallerJournalAccess.mockResolvedValue(true);
  mockCreateMealDocument.mockReset();
});

describe('POST /api/journal/meals/documents', () => {
  it('creates a document scoped to the caller personId', async () => {
    mockCreateMealDocument.mockResolvedValue({ id: 'doc-1', title: 'Bowl' });
    const res = createMockRes();

    await handler(createReq('POST', { title: 'Bowl', components: [] }), res);

    expect(res.statusCode).toBe(201);
    expect(mockCreateMealDocument).toHaveBeenCalledWith(
      CALLER_PERSON,
      expect.objectContaining({ title: 'Bowl' }),
    );
    expect((res.body as { document: unknown }).document).toEqual({ id: 'doc-1', title: 'Bowl' });
  });

  it('never trusts person_id from the request body', async () => {
    mockCreateMealDocument.mockResolvedValue({ id: 'doc-1' });
    const res = createMockRes();

    await handler(createReq('POST', { title: 'Bowl', person_id: 'someone-else' }), res);

    // Package 3 fail-closed: mismatched client person_id is rejected before create.
    expect(res.statusCode).toBe(403);
    expect(mockCreateMealDocument).not.toHaveBeenCalled();
  });

  it('returns 400 on a validation error', async () => {
    const { MealDocumentValidationError } = jest.requireMock('@/lib/meals/mealDocumentServerService') as {
      MealDocumentValidationError: new (errors: string[]) => Error;
    };
    mockCreateMealDocument.mockRejectedValue(new MealDocumentValidationError(['title: must not be empty']));
    const res = createMockRes();

    await handler(createReq('POST', { title: '' }), res);

    expect(res.statusCode).toBe(400);
    expect((res.body as { details: string[] }).details).toEqual(['title: must not be empty']);
  });

  it('returns 405 for unsupported methods without touching auth', async () => {
    const res = createMockRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toEqual(['POST']);
    expect(mockRequireJournalAuth).not.toHaveBeenCalled();
  });

  it('stops when caller journal access is denied', async () => {
    mockRequireCallerJournalAccess.mockResolvedValue(false);
    const res = createMockRes();
    await handler(createReq('POST', { title: 'Bowl' }), res);
    expect(mockCreateMealDocument).not.toHaveBeenCalled();
  });
});
