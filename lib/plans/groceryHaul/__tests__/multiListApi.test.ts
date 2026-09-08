import type { NextApiRequest, NextApiResponse } from 'next';

const PERSON = 'person-1';
const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockRequireJournalAccess = jest.fn();
jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}
class GroceryHaulValidationError extends Error {}
class GroceryHaulBlockedError extends Error {
  blockReason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.blockReason = reason;
    Object.setPrototypeOf(this, GroceryHaulBlockedError.prototype);
  }
}
class GroceryHaulConflictError extends Error {}
class GroceryHaulForbiddenError extends Error {}

const mockCreate = jest.fn();
const mockList = jest.fn();
jest.mock('@/lib/plans/groceryListService', () => ({ GroceryListNotFoundError }));
jest.mock('@/lib/plans/groceryHaul/service', () => ({
  GroceryHaulValidationError,
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  createGroceryHaulFromLists: (...args: unknown[]) => mockCreate(...args),
  listGroceryHaulsForPerson: (...args: unknown[]) => mockList(...args),
}));

import handler from '@/pages/api/journal/food/hauls/index';

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
  mockRequireJournalAccess.mockResolvedValue({ personId: PERSON, user: { id: 'auth-1' } });
});

describe('POST /api/journal/food/hauls multi-List create', () => {
  it('uses session ownership and accepts only source IDs/date/token as service input', async () => {
    mockCreate.mockResolvedValue({
      haul_id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      source_grocery_list_ids: ['list-1', 'list-2'],
      shopping_date: '2026-09-08',
      status: 'planned',
      creation_token: TOKEN,
      item_count: 3,
      outcome: 'created',
    });
    const req = {
      method: 'POST',
      query: {},
      body: {
        source_grocery_list_ids: ['list-1', 'list-2'],
        shopping_date: '2026-09-08',
        creation_token: TOKEN,
        person_id: 'forged-person',
        items: [{ name: 'forged snapshot' }],
      },
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);

    expect(mockCreate).toHaveBeenCalledWith({
      personId: PERSON,
      listIds: ['list-1', 'list-2'],
      shoppingDate: '2026-09-08',
      creationToken: TOKEN,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      haul: expect.objectContaining({
        source_grocery_list_ids: ['list-1', 'list-2'],
        item_count: 3,
      }),
    });
  });

  it('maps a cross-owner/missing source List to 404', async () => {
    mockCreate.mockRejectedValue(new GroceryListNotFoundError('One or more grocery lists were not found.'));
    const req = {
      method: 'POST',
      query: {},
      body: {
        source_grocery_list_ids: ['list-1', 'other-owner-list'],
        shopping_date: '2026-09-08',
        creation_token: TOKEN,
      },
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });
});
