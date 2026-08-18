import type { GroceryItem } from '@/lib/plans/types';
import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';
import {
  GROCERY_HAUL_CREATE_RPC_NAME,
  isGroceryHaulCreationToken,
  isGroceryHaulShoppingDate,
} from '../schema';

const PERSON = 'person-1';
const LIST_ID = 'list-1';
const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}

const mockGetPersistentGroceryListDetail = jest.fn();
jest.mock('@/lib/plans/groceryListService', () => ({
  GroceryListNotFoundError,
  getPersistentGroceryListDetail: (...args: unknown[]) =>
    mockGetPersistentGroceryListDetail(...args),
}));

import {
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulValidationError,
  createGroceryHaulFromList,
  getGroceryHaulDetail,
} from '../service';

function item(overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id: 'item-1',
    grocery_list_id: LIST_ID,
    person_id: PERSON,
    name: 'Oats',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: 'food-oats',
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function list(overrides: Record<string, unknown> = {}) {
  return {
    id: LIST_ID,
    person_id: PERSON,
    title: 'My Grocery List',
    archived_at: null,
    ...overrides,
  };
}

function createdResult(overrides: Record<string, unknown> = {}) {
  return {
    haul_id: 'haul-1',
    person_id: PERSON,
    source_grocery_list_id: LIST_ID,
    shopping_date: '2026-08-18',
    status: 'planned',
    creation_token: TOKEN,
    item_count: 1,
    outcome: 'created',
    ...overrides,
  };
}

function installFake(initial: Record<string, Row[]> = {}) {
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('grocery haul shopping date and token helpers', () => {
  it('accepts local calendar dates and UUID creation tokens', () => {
    expect(isGroceryHaulShoppingDate('2026-08-18')).toBe(true);
    expect(isGroceryHaulShoppingDate('2026-13-40')).toBe(false);
    expect(isGroceryHaulCreationToken(TOKEN)).toBe(true);
    expect(isGroceryHaulCreationToken('not-a-uuid')).toBe(false);
  });
});

describe('createGroceryHaulFromList', () => {
  it('calls the live RPC with session person, list, date, and token only', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item()],
    });
    mockRpc.mockResolvedValue({ data: createdResult(), error: null });

    const result = await createGroceryHaulFromList({
      personId: PERSON,
      listId: LIST_ID,
      shoppingDate: '2026-08-18',
      creationToken: TOKEN,
    });

    expect(mockRpc).toHaveBeenCalledWith(GROCERY_HAUL_CREATE_RPC_NAME, {
      p_person_id: PERSON,
      p_source_grocery_list_id: LIST_ID,
      p_shopping_date: '2026-08-18',
      p_creation_token: TOKEN,
    });
    expect(result.outcome).toBe('created');
    expect(result.haul_id).toBe('haul-1');
    expect(result.status).toBe('planned');
  });

  it('does not send client item snapshots to the RPC', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item(), item({ id: 'item-2', name: 'Milk', food_object_id: 'food-milk' })],
    });
    mockRpc.mockResolvedValue({ data: createdResult({ item_count: 2 }), error: null });

    await createGroceryHaulFromList({
      personId: PERSON,
      listId: LIST_ID,
      shoppingDate: '2026-08-18',
      creationToken: TOKEN,
    });

    const payload = mockRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'p_creation_token',
      'p_person_id',
      'p_shopping_date',
      'p_source_grocery_list_id',
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/Oats|Milk|food-oats/);
  });

  it('blocks needs_resolution before calling the RPC', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item({ food_object_id: null })],
    });

    await expect(
      createGroceryHaulFromList({
        personId: PERSON,
        listId: LIST_ID,
        shoppingDate: '2026-08-18',
        creationToken: TOKEN,
      }),
    ).rejects.toBeInstanceOf(GroceryHaulBlockedError);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('blocks archived lists before calling the RPC', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list({ archived_at: '2026-08-01T00:00:00.000Z' }),
      items: [item()],
    });

    await expect(
      createGroceryHaulFromList({
        personId: PERSON,
        listId: LIST_ID,
        shoppingDate: '2026-08-18',
        creationToken: TOKEN,
      }),
    ).rejects.toMatchObject({ blockReason: 'archived' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('maps zero-pending RPC failure without inventing a Haul', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item()],
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'HAUL_CREATE_NO_PENDING_ITEMS' },
    });

    await expect(
      createGroceryHaulFromList({
        personId: PERSON,
        listId: LIST_ID,
        shoppingDate: '2026-08-18',
        creationToken: TOKEN,
      }),
    ).rejects.toMatchObject({ blockReason: 'no_pending' });
  });

  it('reuses the same-token RPC outcome without a pre-check', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item()],
    });
    mockRpc.mockResolvedValue({
      data: createdResult({ outcome: 'reused' }),
      error: null,
    });

    const result = await createGroceryHaulFromList({
      personId: PERSON,
      listId: LIST_ID,
      shoppingDate: '2026-08-18',
      creationToken: TOKEN,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('reused');
    expect(result.haul_id).toBe('haul-1');
  });

  it('resolves HAUL_CREATE_OPEN_EXISTS to the canonical existing open Haul', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item(), item({ id: 'item-2', status: 'bought', food_object_id: 'food-milk' })],
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'HAUL_CREATE_OPEN_EXISTS' },
    });
    installFake({
      grocery_hauls: [
        {
          id: 'haul-existing',
          person_id: PERSON,
          source_grocery_list_id: LIST_ID,
          shopping_date: '2026-08-18',
          status: 'planned',
          creation_token: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        },
      ],
      grocery_haul_items: [
        { id: 'hi-1', haul_id: 'haul-existing', person_id: PERSON },
        { id: 'hi-2', haul_id: 'haul-existing', person_id: PERSON },
      ],
    });

    const result = await createGroceryHaulFromList({
      personId: PERSON,
      listId: LIST_ID,
      shoppingDate: '2026-08-18',
      creationToken: TOKEN,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      haul_id: 'haul-existing',
      outcome: 'reused',
      item_count: 2,
    });
  });

  it('maps token mismatch to a conflict after the RPC remains authoritative', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({
      list: list(),
      items: [item()],
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'HAUL_CREATE_TOKEN_MISMATCH' },
    });

    await expect(
      createGroceryHaulFromList({
        personId: PERSON,
        listId: LIST_ID,
        shoppingDate: '2026-08-19',
        creationToken: TOKEN,
      }),
    ).rejects.toBeInstanceOf(GroceryHaulConflictError);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid shopping dates before any RPC call', async () => {
    await expect(
      createGroceryHaulFromList({
        personId: PERSON,
        listId: LIST_ID,
        shoppingDate: '08/18/2026',
        creationToken: TOKEN,
      }),
    ).rejects.toBeInstanceOf(GroceryHaulValidationError);
    expect(mockGetPersistentGroceryListDetail).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('getGroceryHaulDetail', () => {
  it('reads canonical Haul + snapshots for the authenticated person only', async () => {
    installFake({
      grocery_hauls: [
        {
          id: 'haul-1',
          person_id: PERSON,
          source_grocery_list_id: LIST_ID,
          shopping_date: '2026-08-18',
          status: 'planned',
          creation_token: TOKEN,
        },
        {
          id: 'haul-other',
          person_id: 'person-b',
          source_grocery_list_id: 'list-b',
          shopping_date: '2026-08-18',
          status: 'planned',
          creation_token: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        },
      ],
      grocery_haul_items: [
        {
          id: 'hi-1',
          haul_id: 'haul-1',
          person_id: PERSON,
          name_snapshot: 'Oats',
          quantity_snapshot: 2,
          unit_snapshot: 'cup',
        },
        {
          id: 'hi-other',
          haul_id: 'haul-other',
          person_id: 'person-b',
          name_snapshot: 'Secret',
        },
      ],
    });

    const detail = await getGroceryHaulDetail(PERSON, 'haul-1');
    expect(detail.haul.id).toBe('haul-1');
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].name_snapshot).toBe('Oats');
  });
});
