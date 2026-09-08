import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAccess = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));
jest.mock('@/lib/plans/pantryAcquisitionLotService', () => ({
  createPantryAcquisitionLot: (...args: unknown[]) => mockCreate(...args),
  deletePantryAcquisitionLot: jest.fn(),
  listPantryAcquisitionLots: (...args: unknown[]) => mockList(...args),
  updatePantryAcquisitionLot: jest.fn(),
}));

import handler from '@/pages/api/journal/plans/pantry/lots';

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
  mockRequireJournalAccess.mockResolvedValue({ personId: 'person-1', user: { id: 'auth-1' } });
});

describe('POST /api/journal/plans/pantry/lots', () => {
  it('uses session ownership and maps acquisition/product/provenance fields', async () => {
    mockCreate.mockResolvedValue({ id: 'lot-1', person_id: 'person-1' });
    const req = {
      method: 'POST',
      query: {},
      body: {
        pantry_key: 'food-1::lb',
        acquired_on: '2026-09-08',
        expires_on: '2026-09-15',
        quantity_acquired: 2,
        quantity_remaining: 1.5,
        unit: 'lb',
        product_title: 'Chicken Breast',
        retailer: 'Store A',
        price_amount: 6.98,
        currency: 'USD',
        source_haul_id: 'haul-1',
        source_haul_item_id: 'haul-item-1',
        person_id: 'forged-person',
      },
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);

    expect(mockCreate).toHaveBeenCalledWith({
      personId: 'person-1',
      pantryItemKey: 'food-1::lb',
      lot: expect.objectContaining({
        acquiredOn: '2026-09-08',
        expiresOn: '2026-09-15',
        quantityAcquired: 2,
        quantityRemaining: 1.5,
        productTitle: 'Chicken Breast',
        retailer: 'Store A',
        priceAmount: 6.98,
        currency: 'USD',
        sourceHaulId: 'haul-1',
        sourceHaulItemId: 'haul-item-1',
      }),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('GET /api/journal/plans/pantry/lots', () => {
  it('loads all current-owner lots in one manager request when no key is supplied', async () => {
    mockList.mockResolvedValue([
      { id: 'lot-1', person_id: 'person-1', pantry_item_key: 'food-1::lb' },
      { id: 'lot-2', person_id: 'person-1', pantry_item_key: 'food-2::item' },
    ]);
    const req = {
      method: 'GET',
      query: {},
    } as unknown as NextApiRequest;
    const res = response();

    await handler(req, res);

    expect(mockList).toHaveBeenCalledWith('person-1', undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      lots: expect.arrayContaining([
        expect.objectContaining({ id: 'lot-1' }),
        expect.objectContaining({ id: 'lot-2' }),
      ]),
    });
  });
});
