import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAccess = jest.fn();
const mockUpdateMetadata = jest.fn();
const mockUpdateItem = jest.fn();
const mockAddSources = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

class GroceryHaulNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulNotFoundError.prototype);
  }
}
class GroceryHaulValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulValidationError.prototype);
  }
}
class GroceryHaulConflictError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulConflictError.prototype);
  }
}
class GroceryHaulForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulForbiddenError.prototype);
  }
}
class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}

jest.mock('@/lib/plans/groceryListService', () => ({ GroceryListNotFoundError }));
jest.mock('@/lib/plans/groceryHaul/service', () => ({
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  getGroceryHaulDetail: jest.fn(),
  updateGroceryHaulMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
  updateGroceryHaulItemPreparation: (...args: unknown[]) => mockUpdateItem(...args),
  addGroceryListsToDraftHaul: (...args: unknown[]) => mockAddSources(...args),
}));

import haulHandler from '@/pages/api/journal/food/hauls/[haulId]';
import itemHandler from '@/pages/api/journal/food/hauls/[haulId]/items/[itemId]';
import sourcesHandler from '@/pages/api/journal/food/hauls/[haulId]/source-lists';

function response(): NextApiResponse & { statusCode: number; body: unknown } {
  const state = { statusCode: 200, body: undefined as unknown };
  const res = {
    get statusCode() { return state.statusCode; },
    get body() { return state.body; },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    setHeader: jest.fn(),
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: unknown };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAccess.mockResolvedValue({ personId: 'person-1' });
});

describe('Packet 6 Haul write APIs', () => {
  it('uses session ownership for metadata autosave', async () => {
    mockUpdateMetadata.mockResolvedValue({ id: 'haul-1', title: 'Weekend' });
    const req = {
      method: 'PATCH',
      query: { haulId: 'haul-1' },
      body: {
        title: 'Weekend',
        budget_amount: 75,
        person_id: 'forged',
      },
    } as unknown as NextApiRequest;
    const res = response();
    await haulHandler(req, res);
    expect(mockUpdateMetadata).toHaveBeenCalledWith({
      personId: 'person-1',
      haulId: 'haul-1',
      title: 'Weekend',
      shoppingDate: undefined,
      budgetAmount: 75,
      currency: undefined,
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts final/preparation state but never forwards quantity_snapshot', async () => {
    mockUpdateItem.mockResolvedValue({ id: 'item-1', final_quantity: 0 });
    const req = {
      method: 'PATCH',
      query: { haulId: 'haul-1', itemId: 'item-1' },
      body: {
        final_quantity: 0,
        product_title: 'Substitute',
        price_amount: 2.5,
        quantity_snapshot: 999,
        person_id: 'forged',
      },
    } as unknown as NextApiRequest;
    const res = response();
    await itemHandler(req, res);
    expect(mockUpdateItem).toHaveBeenCalledWith(expect.objectContaining({
      personId: 'person-1',
      haulId: 'haul-1',
      itemId: 'item-1',
      patch: expect.objectContaining({
        finalQuantity: 0,
        productTitle: 'Substitute',
        priceAmount: 2.5,
      }),
    }));
    expect(mockUpdateItem.mock.calls[0][0].patch).not.toHaveProperty('quantity_snapshot');
    expect(res.statusCode).toBe(200);
  });

  it('delegates normalized Draft source additions and maps historical conflicts', async () => {
    mockAddSources.mockResolvedValue({
      haul_id: 'haul-1',
      source_grocery_list_ids: ['list-2'],
      added_source_count: 1,
      item_count: 2,
      outcome: 'updated',
    });
    const req = {
      method: 'POST',
      query: { haulId: 'haul-1' },
      body: { source_grocery_list_ids: ['list-2', 'list-2'], person_id: 'forged' },
    } as unknown as NextApiRequest;
    const res = response();
    await sourcesHandler(req, res);
    expect(mockAddSources).toHaveBeenCalledWith({
      personId: 'person-1',
      haulId: 'haul-1',
      listIds: ['list-2', 'list-2'],
    });
    expect(res.statusCode).toBe(200);

    mockAddSources.mockRejectedValueOnce(new GroceryHaulConflictError('Only Draft'));
    const conflictRes = response();
    await sourcesHandler(req, conflictRes);
    expect(conflictRes.statusCode).toBe(409);
  });
});
