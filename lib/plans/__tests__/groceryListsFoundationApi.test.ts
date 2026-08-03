/**
 * Route-level tests for the persistent Grocery Lists v1 API surface.
 *
 * Focus: every route derives `personId` exclusively from the authenticated
 * session (`requireJournalAccess`) and never trusts the request body/query
 * for it — so a caller cannot act on another person's lists, items, or
 * plans by passing someone else's id in the payload. Service-level
 * ownership/idempotency/reconciliation behavior is covered separately in
 * groceryListService.test.ts; these tests only exercise routing, auth
 * wiring, and error-status mapping.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const OTHER_PERSON = 'person-other';

const mockRequireJournalAccess = jest.fn();
jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

const mockGetPlan = jest.fn();
jest.mock('@/lib/plans/planServerService', () => ({
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
}));

// Items routes import groceryListPurchasingChoiceService → supabaseServerClient
// at module load. Mock the client before handlers import so missing env cannot
// abort the suite; these route tests never exercise real DB I/O.
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

// Mirrors the ES5-target `instanceof`-across-Error-subclass fix used in the
// real lib/plans/groceryListService.ts error classes — without it, these
// test doubles would fail `err instanceof GroceryListNotFoundError` checks
// in the route handlers under test.
class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}
class GroceryListValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListValidationError.prototype);
  }
}
class GroceryListConflictError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListConflictError.prototype);
  }
}

const mockGetGroceryListsOverview = jest.fn();
const mockCreateNamedGroceryList = jest.fn();
const mockGetPersistentGroceryListDetail = jest.fn();
const mockRenameGroceryList = jest.fn();
const mockArchiveGroceryList = jest.fn();
const mockUnarchiveGroceryList = jest.fn();
const mockDeleteGroceryList = jest.fn();
const mockAddGroceryListItem = jest.fn();
const mockUpdateGroceryListItem = jest.fn();
const mockDeleteGroceryListItem = jest.fn();
const mockReconcilePlanScopeIntoGroceryList = jest.fn();

jest.mock('@/lib/plans/groceryListService', () => ({
  GroceryListNotFoundError,
  GroceryListValidationError,
  GroceryListConflictError,
  getGroceryListsOverview: (...args: unknown[]) => mockGetGroceryListsOverview(...args),
  createNamedGroceryList: (...args: unknown[]) => mockCreateNamedGroceryList(...args),
  getPersistentGroceryListDetail: (...args: unknown[]) => mockGetPersistentGroceryListDetail(...args),
  renameGroceryList: (...args: unknown[]) => mockRenameGroceryList(...args),
  archiveGroceryList: (...args: unknown[]) => mockArchiveGroceryList(...args),
  unarchiveGroceryList: (...args: unknown[]) => mockUnarchiveGroceryList(...args),
  deleteGroceryList: (...args: unknown[]) => mockDeleteGroceryList(...args),
  addGroceryListItem: (...args: unknown[]) => mockAddGroceryListItem(...args),
  updateGroceryListItem: (...args: unknown[]) => mockUpdateGroceryListItem(...args),
  deleteGroceryListItem: (...args: unknown[]) => mockDeleteGroceryListItem(...args),
  reconcilePlanScopeIntoGroceryList: (...args: unknown[]) => mockReconcilePlanScopeIntoGroceryList(...args),
}));

import indexHandler from '@/pages/api/journal/food/grocery-lists/index';
import listIdHandler from '@/pages/api/journal/food/grocery-lists/[listId]';
import itemsIndexHandler from '@/pages/api/journal/food/grocery-lists/[listId]/items/index';
import itemHandler from '@/pages/api/journal/food/grocery-lists/[listId]/items/[itemId]';
import generateHandler from '@/pages/api/journal/food/grocery-lists/generate';

interface MockResponse {
  statusCode: number;
  body: unknown;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      return res as NextApiResponse;
    },
    end() {
      return res as NextApiResponse;
    },
    setHeader: jest.fn(),
  };
  return res as NextApiResponse & MockResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAccess.mockResolvedValue({ personId: CALLER_PERSON, user: { id: 'auth-user' } });
});

describe('GET/POST /api/journal/food/grocery-lists', () => {
  it('fetches the overview for the authenticated caller only', async () => {
    mockGetGroceryListsOverview.mockResolvedValue({ default_list: {}, named_lists: [], archived_lists: [], plan_lists: [] });
    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = createMockRes();

    await indexHandler(req, res);

    expect(mockGetGroceryListsOverview).toHaveBeenCalledWith(CALLER_PERSON);
    expect(res.statusCode).toBe(200);
  });

  it('creates a named list for the caller, ignoring any person id smuggled in the body', async () => {
    mockCreateNamedGroceryList.mockResolvedValue({ id: 'list-1', person_id: CALLER_PERSON, title: 'Costco run' });
    const req = {
      method: 'POST',
      query: {},
      body: { title: 'Costco run', person_id: OTHER_PERSON },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await indexHandler(req, res);

    expect(mockCreateNamedGroceryList).toHaveBeenCalledWith(CALLER_PERSON, 'Costco run');
    expect(res.statusCode).toBe(201);
  });

  it('maps validation errors to 400', async () => {
    mockCreateNamedGroceryList.mockRejectedValue(new GroceryListValidationError('title is required.'));
    const req = { method: 'POST', query: {}, body: {} } as unknown as NextApiRequest;
    const res = createMockRes();

    await indexHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated callers before touching the service', async () => {
    mockRequireJournalAccess.mockResolvedValue(null);
    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = createMockRes();

    await indexHandler(req, res);
    expect(mockGetGroceryListsOverview).not.toHaveBeenCalled();
  });
});

describe('/api/journal/food/grocery-lists/:listId', () => {
  it('always scopes reads/writes to the caller personId, never a query/body override', async () => {
    mockGetPersistentGroceryListDetail.mockResolvedValue({ list: { id: 'list-1' }, items: [] });
    const req = {
      method: 'GET',
      query: { listId: 'list-1', person_id: OTHER_PERSON },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await listIdHandler(req, res);
    expect(mockGetPersistentGroceryListDetail).toHaveBeenCalledWith(CALLER_PERSON, 'list-1');
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when the service reports the list is not owned by the caller', async () => {
    mockGetPersistentGroceryListDetail.mockRejectedValue(new GroceryListNotFoundError('Grocery list not found.'));
    const req = { method: 'GET', query: { listId: 'someone-elses-list' } } as unknown as NextApiRequest;
    const res = createMockRes();

    await listIdHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('routes PATCH actions to the matching service call', async () => {
    mockRenameGroceryList.mockResolvedValue({ id: 'list-1', title: 'New name' });
    const req = {
      method: 'PATCH',
      query: { listId: 'list-1' },
      body: { action: 'rename', title: 'New name' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await listIdHandler(req, res);
    expect(mockRenameGroceryList).toHaveBeenCalledWith(CALLER_PERSON, 'list-1', 'New name');
    expect(res.statusCode).toBe(200);
  });

  it('maps conflict errors from unarchive to 400', async () => {
    mockUnarchiveGroceryList.mockRejectedValue(new GroceryListConflictError('conflict'));
    const req = {
      method: 'PATCH',
      query: { listId: 'list-1' },
      body: { action: 'unarchive' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await listIdHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('deletes only through the caller-scoped service call', async () => {
    mockDeleteGroceryList.mockResolvedValue(undefined);
    const req = { method: 'DELETE', query: { listId: 'list-1' } } as unknown as NextApiRequest;
    const res = createMockRes();

    await listIdHandler(req, res);
    expect(mockDeleteGroceryList).toHaveBeenCalledWith(CALLER_PERSON, 'list-1');
    expect(res.statusCode).toBe(204);
  });
});

describe('/api/journal/food/grocery-lists/:listId/items', () => {
  it('adds an item scoped to the caller personId', async () => {
    mockAddGroceryListItem.mockResolvedValue({ id: 'item-1', name: 'Milk' });
    const req = {
      method: 'POST',
      query: { listId: 'list-1' },
      body: { name: 'Milk', person_id: OTHER_PERSON },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await itemsIndexHandler(req, res);
    expect(mockAddGroceryListItem).toHaveBeenCalledWith(CALLER_PERSON, 'list-1', {
      name: 'Milk',
      person_id: OTHER_PERSON,
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 404 for a foreign list id', async () => {
    mockAddGroceryListItem.mockRejectedValue(new GroceryListNotFoundError('Grocery list not found.'));
    const req = {
      method: 'POST',
      query: { listId: 'someone-elses-list' },
      body: { name: 'Milk' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await itemsIndexHandler(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('/api/journal/food/grocery-lists/:listId/items/:itemId', () => {
  it('updates an item scoped to the caller personId', async () => {
    mockUpdateGroceryListItem.mockResolvedValue({ id: 'item-1', status: 'bought' });
    const req = {
      method: 'PATCH',
      query: { listId: 'list-1', itemId: 'item-1' },
      body: { status: 'bought' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await itemHandler(req, res);
    expect(mockUpdateGroceryListItem).toHaveBeenCalledWith(CALLER_PERSON, 'list-1', 'item-1', { status: 'bought' });
    expect(res.statusCode).toBe(200);
  });

  it('deletes an item scoped to the caller personId', async () => {
    mockDeleteGroceryListItem.mockResolvedValue(undefined);
    const req = {
      method: 'DELETE',
      query: { listId: 'list-1', itemId: 'item-1' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await itemHandler(req, res);
    expect(mockDeleteGroceryListItem).toHaveBeenCalledWith(CALLER_PERSON, 'list-1', 'item-1');
    expect(res.statusCode).toBe(204);
  });
});

describe('POST /api/journal/food/grocery-lists/generate', () => {
  it('requires the plan to belong to the caller before reconciling', async () => {
    mockGetPlan.mockResolvedValue(null);
    const req = {
      method: 'POST',
      query: {},
      body: { plan_id: 'plan-not-mine', date: '2026-07-15' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await generateHandler(req, res);
    expect(mockGetPlan).toHaveBeenCalledWith(CALLER_PERSON, 'plan-not-mine');
    expect(res.statusCode).toBe(404);
    expect(mockReconcilePlanScopeIntoGroceryList).not.toHaveBeenCalled();
  });

  it('reconciles using the caller personId regardless of any body override', async () => {
    mockGetPlan.mockResolvedValue({ id: 'plan-1' });
    mockReconcilePlanScopeIntoGroceryList.mockResolvedValue({
      target_list: { id: 'list-1' },
      items: [],
      batch_item_ids: [],
      source_meals: [],
      pantry_items: [],
      source_day_count: 0,
      source_meal_count: 0,
      pending_meal_count: 0,
      derived_item_count: 0,
      empty_reason: 'no_plan_days_in_range',
    });
    const req = {
      method: 'POST',
      query: {},
      body: {
        plan_id: 'plan-1',
        date: '2026-07-15',
        date_end: '2026-07-21',
        target_list_id: 'list-1',
        person_id: OTHER_PERSON,
      },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await generateHandler(req, res);

    expect(mockReconcilePlanScopeIntoGroceryList).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      targetListId: 'list-1',
      planId: 'plan-1',
      dateStart: '2026-07-15',
      dateEnd: '2026-07-21',
      forceRegenerate: false,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        batch_item_ids: [],
        empty_reason: 'no_plan_days_in_range',
        source_day_count: 0,
        derived_item_count: 0,
      }),
    );
  });

  it('rejects a malformed date before calling getPlan', async () => {
    const req = {
      method: 'POST',
      query: {},
      body: { plan_id: 'plan-1', date: 'not-a-date' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await generateHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockGetPlan).not.toHaveBeenCalled();
  });

  it('maps not-found target lists (owned by someone else) to 404', async () => {
    mockGetPlan.mockResolvedValue({ id: 'plan-1' });
    mockReconcilePlanScopeIntoGroceryList.mockRejectedValue(
      new GroceryListNotFoundError('Grocery list not found.'),
    );
    const req = {
      method: 'POST',
      query: {},
      body: { plan_id: 'plan-1', date: '2026-07-15', target_list_id: 'someone-elses-list' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await generateHandler(req, res);
    expect(res.statusCode).toBe(404);
  });
});
