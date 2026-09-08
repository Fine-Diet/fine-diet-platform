import type { NextApiRequest, NextApiResponse } from 'next';

const mockRequireJournalAccess = jest.fn();
const mockReadiness = jest.fn();
const mockStart = jest.fn();
const mockGetExecution = jest.fn();
const mockUpdateExecutionItem = jest.fn();

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
class GroceryHaulBlockedError extends Error {
  blockReason: string;
  constructor(blockReason: string, message: string) {
    super(message);
    this.blockReason = blockReason;
    Object.setPrototypeOf(this, GroceryHaulBlockedError.prototype);
  }
}

jest.mock('@/lib/plans/groceryHaul/service', () => ({
  GroceryHaulNotFoundError,
  GroceryHaulValidationError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulBlockedError,
  getGroceryHaulExecutionReadiness: (...args: unknown[]) => mockReadiness(...args),
  startGroceryHaulExecution: (...args: unknown[]) => mockStart(...args),
  getGroceryHaulExecution: (...args: unknown[]) => mockGetExecution(...args),
  updateGroceryHaulExecutionItem: (...args: unknown[]) => mockUpdateExecutionItem(...args),
}));

import executionHandler from '@/pages/api/journal/food/hauls/[haulId]/execution';
import readinessHandler from '@/pages/api/journal/food/hauls/[haulId]/execution/readiness';
import startHandler from '@/pages/api/journal/food/hauls/[haulId]/execution/start';
import itemHandler from '@/pages/api/journal/food/hauls/[haulId]/execution/items/[executionItemId]';

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

describe('Packet 9 Shopping View execution APIs', () => {
  it('uses session ownership for readiness, start, and execution reads', async () => {
    mockReadiness.mockResolvedValue({ haul_id: 'haul-1', can_start: true });
    mockStart.mockResolvedValue({ haul_id: 'haul-1', status: 'active', outcome: 'started' });
    mockGetExecution.mockResolvedValue({ items: [] });

    const readinessRes = response();
    await readinessHandler({
      method: 'GET',
      query: { haulId: 'haul-1', person_id: 'forged' },
    } as unknown as NextApiRequest, readinessRes);
    expect(mockReadiness).toHaveBeenCalledWith('person-1', 'haul-1');

    const startRes = response();
    await startHandler({
      method: 'POST',
      query: { haulId: 'haul-1' },
      body: { person_id: 'forged' },
    } as unknown as NextApiRequest, startRes);
    expect(mockStart).toHaveBeenCalledWith({ personId: 'person-1', haulId: 'haul-1' });

    const executionRes = response();
    await executionHandler({
      method: 'GET',
      query: { haulId: 'haul-1' },
    } as unknown as NextApiRequest, executionRes);
    expect(mockGetExecution).toHaveBeenCalledWith('person-1', 'haul-1');
  });

  it('forwards only state and acquisition outcome fields to item execution', async () => {
    mockUpdateExecutionItem.mockResolvedValue({ id: 'execution-1', state: 'in_basket' });
    const res = response();
    await itemHandler({
      method: 'PATCH',
      query: { haulId: 'haul-1', executionItemId: 'execution-1' },
      body: {
        state: 'in_basket',
        acquisition: {
          product_title: 'Actual substitute',
          price_amount: 2.5,
          prepared_product_title: 'forged',
          quantity_snapshot: 999,
          final_quantity: 999,
        },
        person_id: 'forged',
      },
    } as unknown as NextApiRequest, res);

    expect(mockUpdateExecutionItem).toHaveBeenCalledWith({
      personId: 'person-1',
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'in_basket',
      acquisition: {
        product_title: 'Actual substitute',
        price_amount: 2.5,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns the typed zero-item blocker without creating a new Haul', async () => {
    mockStart.mockRejectedValue(
      new GroceryHaulBlockedError('zero_executable_items', 'Nothing executable.'),
    );
    const res = response();
    await startHandler({
      method: 'POST',
      query: { haulId: 'haul-1' },
    } as unknown as NextApiRequest, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'Nothing executable.',
      block_reason: 'zero_executable_items',
    });
  });
});
