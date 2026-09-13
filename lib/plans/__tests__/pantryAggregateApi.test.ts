import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAccess = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));
jest.mock('@/lib/plans/groceryServerService', () => ({
  createPantryOnHandItem: (...args: unknown[]) => mockCreate(...args),
  listPantryOnHandItems: (...args: unknown[]) => mockList(...args),
}));
jest.mock('@/lib/plans/groceryStateStore', () => ({
  updatePantryOnHandItem: (...args: unknown[]) => mockUpdate(...args),
  deletePantryOnHandItem: (...args: unknown[]) => mockDelete(...args),
}));

import handler from '@/pages/api/journal/plans/pantry';

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
  mockRequireJournalAccess.mockResolvedValue({
    personId: 'person-1',
    user: { id: 'auth-1' },
  });
});

describe('Pantry aggregate API ownership regression', () => {
  it('creates canonical aggregate inventory for the session owner only', async () => {
    mockCreate.mockResolvedValue({
      item: { key: 'food-1::lb', quantity: 2, unit: 'lb' },
      created: true,
    });
    const req = {
      method: 'POST',
      query: {},
      body: {
        food_object_id: 'food-1',
        quantity: 2,
        unit: 'lb',
        person_id: 'forged-person',
      },
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);

    expect(mockCreate).toHaveBeenCalledWith({
      personId: 'person-1',
      foodObjectId: 'food-1',
      quantity: 2,
      unit: 'lb',
      ifAbsent: false,
    });
    expect(res.statusCode).toBe(200);
  });

  it('updates aggregate quantity and unit through the session-scoped key path', async () => {
    mockUpdate.mockResolvedValue({ key: 'food-1::item', quantity: 3, unit: 'item' });
    const req = {
      method: 'PATCH',
      query: { key: 'food-1::lb' },
      body: { quantity: 3, unit: 'item', person_id: 'forged-person' },
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);

    expect(mockUpdate).toHaveBeenCalledWith(
      'person-1',
      'food-1::lb',
      { quantity: 3, unit: 'item' },
    );
    expect(res.statusCode).toBe(200);
  });

  it('deletes only through the session-scoped aggregate path', async () => {
    mockDelete.mockResolvedValue(true);
    const req = {
      method: 'DELETE',
      query: { key: 'food-1::lb', person_id: 'forged-person' },
      body: {},
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);

    expect(mockDelete).toHaveBeenCalledWith('person-1', 'food-1::lb');
    expect(res.statusCode).toBe(200);
  });
});
