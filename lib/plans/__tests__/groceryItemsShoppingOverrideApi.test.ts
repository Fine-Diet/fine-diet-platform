/**
 * Route tests for grocery shopping override actions on grocery-items PATCH.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const ITEM_ID = 'item-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockSaveGroceryShoppingDetails = jest.fn();
const mockClearGroceryShoppingDetails = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryShoppingOverrideService', () => {
  const { ShoppingOverrideValidationError } = jest.requireActual(
    '@/lib/plans/groceryShoppingOverrideValidation',
  );
  return {
    ShoppingOverrideValidationError,
    saveGroceryShoppingDetails: (...args: unknown[]) => mockSaveGroceryShoppingDetails(...args),
    clearGroceryShoppingDetails: (...args: unknown[]) => mockClearGroceryShoppingDetails(...args),
  };
});

jest.mock('@/lib/plans/groceryServerService', () => ({
  resolveGroceryItemIngredient: jest.fn(),
  setGroceryItemOnHand: jest.fn(),
  updateGroceryItemStatus: jest.fn(),
}));

import handler from '@/pages/api/journal/plans/grocery-items/[itemId]';
import { ShoppingOverrideValidationError } from '@/lib/plans/groceryShoppingOverrideService';

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
    setHeader() {
      return res as NextApiResponse;
    },
    end() {
      state.ended = true;
      return res as NextApiResponse;
    },
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(body: unknown): NextApiRequest {
  return {
    method: 'PATCH',
    query: { itemId: ITEM_ID },
    body,
    headers: {},
  } as NextApiRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue({
    user: { id: 'user-1', email: 'a@b.com', role: 'user' },
    personId: CALLER_PERSON,
  });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
});

describe('PATCH /api/journal/plans/grocery-items/:itemId shopping overrides', () => {
  it('returns 400 for negative purchase_quantity before persistence', async () => {
    const res = createMockRes();
    await handler(
      createReq({ action: 'save_shopping_override', purchase_quantity: -1 }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error?: string }).error).toMatch(/non-negative number/i);
    expect(mockSaveGroceryShoppingDetails).not.toHaveBeenCalled();
  });

  it('returns 400 when service validation fails', async () => {
    mockSaveGroceryShoppingDetails.mockRejectedValue(
      new ShoppingOverrideValidationError('Provide at least one shopping detail to save.'),
    );
    const res = createMockRes();
    await handler(
      createReq({ action: 'save_shopping_override', shopping_display_name: '  ' }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error?: string }).error).toMatch(/at least one shopping detail/i);
  });

  it('scopes save to authenticated person', async () => {
    mockSaveGroceryShoppingDetails.mockResolvedValue({ id: 'override-1' });
    const res = createMockRes();
    await handler(
      createReq({
        action: 'save_shopping_override',
        shopping_display_name: 'Frozen spinach',
        purchase_quantity: 1.5,
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(mockSaveGroceryShoppingDetails).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      itemId: ITEM_ID,
      input: {
        shopping_display_name: 'Frozen spinach',
        purchase_quantity: 1.5,
        purchase_unit: null,
        preferred_product: null,
        aisle_category: null,
        note: null,
      },
    });
  });

  it('clears override for authenticated person', async () => {
    mockClearGroceryShoppingDetails.mockResolvedValue(true);
    const res = createMockRes();
    await handler(createReq({ action: 'clear_shopping_override' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockClearGroceryShoppingDetails).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      itemId: ITEM_ID,
    });
  });
});
