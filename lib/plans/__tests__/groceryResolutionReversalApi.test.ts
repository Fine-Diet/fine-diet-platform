/**
 * Route tests for reversible grocery resolution actions.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const ITEM_ID = 'item-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockChangeGroceryItemResolution = jest.fn();
const mockMarkGroceryItemUnresolved = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryServerService', () => ({
  changeGroceryItemResolution: (...args: unknown[]) => mockChangeGroceryItemResolution(...args),
  markGroceryItemUnresolved: (...args: unknown[]) => mockMarkGroceryItemUnresolved(...args),
  resolveGroceryItemIngredient: jest.fn(),
  setGroceryItemOnHand: jest.fn(),
  updateGroceryItemStatus: jest.fn(),
}));

jest.mock('@/lib/plans/groceryShoppingOverrideService', () => ({
  saveGroceryShoppingDetails: jest.fn(),
  clearGroceryShoppingDetails: jest.fn(),
  ShoppingOverrideValidationError: class ShoppingOverrideValidationError extends Error {},
}));

import handler from '@/pages/api/journal/plans/grocery-items/[itemId]';

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

describe('grocery-items resolution reversal API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAuth.mockResolvedValue({ personId: CALLER_PERSON });
    mockRequireCallerJournalAccess.mockResolvedValue(true);
  });

  it('handles change_resolution with food_object_id', async () => {
    const payload = {
      item: { id: ITEM_ID, food_object_id: 'food-2' },
      previous_match_key: 'food-1::cup',
      shopping_override: { id: 'override-2' },
      retired_override: { id: 'override-1', match_status: 'unmatched' },
    };
    mockChangeGroceryItemResolution.mockResolvedValue(payload);

    const req = {
      method: 'PATCH',
      query: { itemId: ITEM_ID },
      body: { action: 'change_resolution', food_object_id: 'food-2' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(mockChangeGroceryItemResolution).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      itemId: ITEM_ID,
      foodObjectId: 'food-2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(payload);
  });

  it('handles mark_unresolved', async () => {
    const payload = {
      item: { id: ITEM_ID, food_object_id: null },
      previous_match_key: 'food-1::cup',
      shopping_override: null,
      retired_override: { id: 'override-1', match_status: 'unmatched' },
    };
    mockMarkGroceryItemUnresolved.mockResolvedValue(payload);

    const req = {
      method: 'PATCH',
      query: { itemId: ITEM_ID },
      body: { action: 'mark_unresolved' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(mockMarkGroceryItemUnresolved).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      itemId: ITEM_ID,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(payload);
  });
});
