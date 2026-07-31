/**
 * Package 3 — archive/restore route contract tests.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
  resolveJournalTargetPerson: jest.fn(),
}));

let mockArchive!: jest.Mock;
let mockRestore!: jest.Mock;

jest.mock('@/lib/meals/mealDocumentServerService', () => {
  mockArchive = jest.fn();
  mockRestore = jest.fn();
  class MealDocumentValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join('; '));
      this.name = 'MealDocumentValidationError';
      this.errors = errors;
      Object.setPrototypeOf(this, MealDocumentValidationError.prototype);
    }
  }
  return {
    archiveMealDocumentForPerson: mockArchive,
    restoreMealDocumentForPerson: mockRestore,
    MealDocumentValidationError,
  };
});

import handler from '@/pages/api/journal/meals/documents/[id]/archive';

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined, headers: {} };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get headers() {
      return state.headers;
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
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(method: string, id: string, body?: unknown): NextApiRequest {
  return { method, query: { id }, body, headers: {} } as NextApiRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue({
    user: { id: 'u1', email: 'a@b.com', role: 'user' },
    personId: CALLER_PERSON,
  });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
});

describe('POST /api/journal/meals/documents/[id]/archive', () => {
  it('archives via person-scoped service', async () => {
    mockArchive.mockResolvedValue({
      id: 'doc-1',
      person_id: CALLER_PERSON,
      lifecycle_state: 'archived',
      archived_at: '2026-07-31T12:00:00.000Z',
      review_state: 'confirmed',
    });

    const res = createMockRes();
    await handler(createReq('POST', 'doc-1', { action: 'archive' }), res);

    expect(mockArchive).toHaveBeenCalledWith(CALLER_PERSON, 'doc-1');
    expect(res.statusCode).toBe(200);
    expect((res.body as { archived: boolean }).archived).toBe(true);
  });

  it('restores via person-scoped service', async () => {
    mockRestore.mockResolvedValue({
      id: 'doc-1',
      person_id: CALLER_PERSON,
      lifecycle_state: 'active',
      archived_at: null,
    });

    const res = createMockRes();
    await handler(createReq('POST', 'doc-1', { action: 'restore' }), res);

    expect(mockRestore).toHaveBeenCalledWith(CALLER_PERSON, 'doc-1');
    expect(res.statusCode).toBe(200);
    expect((res.body as { archived: boolean }).archived).toBe(false);
  });

  it('returns 404 when document missing / cross-person', async () => {
    mockArchive.mockResolvedValue(null);
    const res = createMockRes();
    await handler(createReq('POST', 'missing', {}), res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects non-POST', async () => {
    const res = createMockRes();
    await handler(createReq('DELETE', 'doc-1'), res);
    expect(res.statusCode).toBe(405);
  });

  it('defaults omitted action to archive', async () => {
    mockArchive.mockResolvedValue({
      id: 'doc-1',
      lifecycle_state: 'archived',
      archived_at: '2026-07-31T12:00:00.000Z',
    });
    const res = createMockRes();
    await handler(createReq('POST', 'doc-1', {}), res);
    expect(mockArchive).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 for an unsupported present action', async () => {
    const res = createMockRes();
    await handler(createReq('POST', 'doc-1', { action: 'delete' }), res);
    expect(res.statusCode).toBe(400);
    expect(mockArchive).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
  });
});
