/**
 * Route tests for durable-list grocery price search API.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';

const mockRequireJournalAccess = jest.fn();
const mockSearchListGroceryItemPrices = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryListPriceSearchService', () => ({
  searchListGroceryItemPrices: (...args: unknown[]) => mockSearchListGroceryItemPrices(...args),
}));

jest.mock('@/lib/plans/groceryListPriceObservationService', () => ({
  GroceryListPriceValidationError: class GroceryListPriceValidationError extends Error {},
}));

jest.mock('@/lib/plans/groceryPriceQuota', () => ({
  GroceryPriceQuotaExceededError: class GroceryPriceQuotaExceededError extends Error {
    quota = { remaining: 0 };
  },
}));

import handler from '@/pages/api/journal/food/grocery-lists/[listId]/items/[itemId]/price-search';

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

describe('list price-search API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAccess.mockResolvedValue({ personId: CALLER_PERSON });
  });

  it('returns 502 for provider_error outcomes', async () => {
    mockSearchListGroceryItemPrices.mockResolvedValue({
      provider: 'serpapi',
      search_event_id: 'event-1',
      query: 'spinach',
      retailer: 'Target',
      postal_code: '10001',
      cache_hit: false,
      outcome: 'provider_error',
      retrieved_at: '2026-07-15T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      offers: [],
      quota: { remaining: 2 },
      provider_error: { code: 'disabled', message: 'SerpAPI is not configured' },
    });

    const req = {
      method: 'POST',
      query: { listId: LIST_ID, itemId: ITEM_ID },
      body: { retailer: 'Target', postal_code: '10001' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as { outcome?: string }).outcome).toBe('provider_error');
  });
});
