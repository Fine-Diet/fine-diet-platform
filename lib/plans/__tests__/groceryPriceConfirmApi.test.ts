/**
 * Route tests for grocery price confirm API.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const ITEM_ID = 'item-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockConfirmSourcedGroceryPriceWithShoppingOverride = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryPriceServerService', () => ({
  confirmSourcedGroceryPriceWithShoppingOverride: (...args: unknown[]) =>
    mockConfirmSourcedGroceryPriceWithShoppingOverride(...args),
  GroceryPriceValidationError: class GroceryPriceValidationError extends Error {
    name = 'GroceryPriceValidationError';
  },
}));

import { GroceryPriceManualReplaceRequiredError } from '@/lib/plans/groceryPriceManualReplace';

import handler from '@/pages/api/journal/plans/grocery-items/[itemId]/price-confirm';

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

describe('price-confirm API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAuth.mockResolvedValue({ personId: CALLER_PERSON });
    mockRequireCallerJournalAccess.mockResolvedValue(true);
  });

  it('returns 409 with current observation when manual replacement is required', async () => {
    const currentObservation = {
      id: 'obs-manual',
      source: 'manual',
      line_total: 4.5,
      currency: 'USD',
      retailer: 'Target',
      product_title: 'Spinach',
    };
    mockConfirmSourcedGroceryPriceWithShoppingOverride.mockRejectedValue(
      new GroceryPriceManualReplaceRequiredError(currentObservation as never),
    );

    const req = {
      method: 'POST',
      query: { itemId: ITEM_ID },
      body: {
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
      },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'A manual price is already recorded for this item.',
      code: 'manual_replace_required',
      current_observation: currentObservation,
    });
  });

  it('passes replace_manual intent through to the server service', async () => {
    const result = {
      observation: { id: 'obs-sourced', source: 'serpapi' },
      shopping_override: { id: 'override-1', purchase_quantity: 5, purchase_unit: 'oz' },
    };
    mockConfirmSourcedGroceryPriceWithShoppingOverride.mockResolvedValue(result);

    const req = {
      method: 'POST',
      query: { itemId: ITEM_ID },
      body: {
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
        replace_manual: true,
      },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(mockConfirmSourcedGroceryPriceWithShoppingOverride).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      input: {
        grocery_item_id: ITEM_ID,
        search_event_id: 'event-1',
        provider_result_id: 'result-1',
        package_count: undefined,
        replace_manual: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(result);
  });
});
