import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAccess = jest.fn();
const mockSearchPantryProductDetails = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

jest.mock('@/lib/plans/pantryProductSearchService', () => ({
  searchPantryProductDetails: (...args: unknown[]) => mockSearchPantryProductDetails(...args),
  PantryProductSearchValidationError: class PantryProductSearchValidationError extends Error {},
  GroceryPriceQuotaExceededError: class GroceryPriceQuotaExceededError extends Error {
    quota = { remaining: 0 };
  },
}));

import handler from '@/pages/api/journal/plans/pantry/product-search';

interface MockResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined, ended: false };
  const res = {
    get statusCode() {
      return state.statusCode;
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
    setHeader: jest.fn(),
  };
  return res as NextApiResponse & MockResponse;
}

describe('pantry product-search API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAccess.mockResolvedValue({ personId: 'person-1' });
  });

  it('rejects non-POST methods', async () => {
    const req = { method: 'GET', body: {} } as NextApiRequest;
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('requires journal access', async () => {
    mockRequireJournalAccess.mockResolvedValue(null);
    const req = {
      method: 'POST',
      body: { query: 'spinach' },
    } as NextApiRequest;
    const res = createMockRes();
    await handler(req, res);
    expect(mockSearchPantryProductDetails).not.toHaveBeenCalled();
  });

  it('returns provider_error outcomes as 502', async () => {
    mockSearchPantryProductDetails.mockResolvedValue({
      outcome: 'provider_error',
      query: 'spinach',
      offers: [],
      quota: { remaining: 1 },
      provider_error: { code: 'disabled', message: 'disabled' },
    });

    const req = {
      method: 'POST',
      body: { query: 'spinach' },
    } as NextApiRequest;
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as { outcome?: string }).outcome).toBe('provider_error');
  });

  it('accepts pantry queries without grocery item identifiers', async () => {
    mockSearchPantryProductDetails.mockResolvedValue({
      outcome: 'results',
      query: 'spinach',
      offers: [{ title: 'Spinach', retailer: 'Target', price: 2.99, currency: 'USD' }],
      quota: { remaining: 1 },
      provider_error: null,
    });

    const req = {
      method: 'POST',
      body: { query: 'spinach' },
    } as NextApiRequest;
    const res = createMockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockSearchPantryProductDetails).toHaveBeenCalledWith({
      personId: 'person-1',
      query: 'spinach',
      retailer: null,
    });
  });
});
