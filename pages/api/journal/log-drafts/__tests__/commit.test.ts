import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockCommit = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) =>
    mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/logDraft/logNutritionDraftServerService', () => {
  class LogNutritionDraftCommitValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LogNutritionDraftCommitValidationError';
      Object.setPrototypeOf(this, LogNutritionDraftCommitValidationError.prototype);
    }
  }
  return {
    commitLogNutritionDraft: (...args: unknown[]) => mockCommit(...args),
    LogNutritionDraftCommitValidationError,
  };
});

import handler from '@/pages/api/journal/log-drafts/commit';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

function response(): NextApiResponse & MockResponse {
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
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    setHeader(key: string, value: string | string[]) {
      state.headers[key] = value;
      return res;
    },
  };
  return res as unknown as NextApiResponse & MockResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue({
    personId: 'person-a',
    user: { id: 'user-a' },
  });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
});

describe('POST /api/journal/log-drafts/commit', () => {
  it('is a self-only commit and never accepts person identity from the body', async () => {
    const body = { sessionId: 'session', personId: 'person-b', entries: [] };
    mockCommit.mockResolvedValue({ entries: [{ id: 'entry-1' }], alreadyCommitted: false });
    const res = response();
    await handler({ method: 'POST', query: {}, body } as NextApiRequest, res);
    expect(mockCommit).toHaveBeenCalledWith('person-a', body);
    expect(res.statusCode).toBe(201);
  });

  it('returns 200 for an idempotent retry', async () => {
    mockCommit.mockResolvedValue({ entries: [{ id: 'entry-1' }], alreadyCommitted: true });
    const res = response();
    await handler({ method: 'POST', query: {}, body: {} } as NextApiRequest, res);
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 for validation failures and performs no fallback writes', async () => {
    const { LogNutritionDraftCommitValidationError } = jest.requireMock(
      '@/lib/logDraft/logNutritionDraftServerService',
    ) as { LogNutritionDraftCommitValidationError: new (message: string) => Error };
    mockCommit.mockRejectedValue(
      new LogNutritionDraftCommitValidationError('Invalid draft.'),
    );
    const res = response();
    await handler({ method: 'POST', query: {}, body: {} } as NextApiRequest, res);
    expect(res.statusCode).toBe(400);
  });

  it('stops before commit when journal access is denied', async () => {
    mockRequireCallerJournalAccess.mockResolvedValue(false);
    const res = response();
    await handler({ method: 'POST', query: {}, body: {} } as NextApiRequest, res);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
