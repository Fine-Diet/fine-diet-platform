/**
 * Route tests for the Persistent Grocery Lists v1 API surface.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const LIST_ID = 'list-1';
const ITEM_ID = 'item-1';

const mockRequireJournalAccess = jest.fn();
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

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryListService', () => {
  const actual = jest.requireActual('@/lib/plans/groceryListService');
  return {
    ...actual,
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
  };
});

import indexHandler from '@/pages/api/journal/food/grocery-lists/index';
import listDetailHandler from '@/pages/api/journal/food/grocery-lists/[listId]';
import itemsIndexHandler from '@/pages/api/journal/food/grocery-lists/[listId]/items/index';
import itemDetailHandler from '@/pages/api/journal/food/grocery-lists/[listId]/items/[itemId]';
import {
  GroceryListConflictError,
  GroceryListNotFoundError,
  GroceryListValidationError,
} from '@/lib/plans/groceryListService';

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
    end() {
      state.ended = true;
      return res as NextApiResponse;
    },
    setHeader: jest.fn(),
  };
  return res as NextApiResponse & MockResponse;
}

describe('grocery-lists index API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAccess.mockResolvedValue({ personId: CALLER_PERSON });
  });

  it('GET returns the overview', async () => {
    const overview = { default_list: { id: LIST_ID }, named_lists: [], plan_lists: [] };
    mockGetGroceryListsOverview.mockResolvedValue(overview);

    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = createMockRes();
    await indexHandler(req, res);

    expect(mockGetGroceryListsOverview).toHaveBeenCalledWith(CALLER_PERSON);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(overview);
  });

  it('POST creates a named list', async () => {
    const list = { id: 'list-2', title: 'Costco run' };
    mockCreateNamedGroceryList.mockResolvedValue(list);

    const req = {
      method: 'POST',
      query: {},
      body: { title: 'Costco run' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await indexHandler(req, res);

    expect(mockCreateNamedGroceryList).toHaveBeenCalledWith(CALLER_PERSON, 'Costco run');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ list });
  });

  it('POST returns 400 on validation error', async () => {
    mockCreateNamedGroceryList.mockRejectedValue(new GroceryListValidationError('title cannot be empty.'));

    const req = { method: 'POST', query: {}, body: { title: '' } } as unknown as NextApiRequest;
    const res = createMockRes();
    await indexHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests before touching the service', async () => {
    mockRequireJournalAccess.mockResolvedValue(null);

    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = createMockRes();
    await indexHandler(req, res);

    expect(mockGetGroceryListsOverview).not.toHaveBeenCalled();
  });
});

describe('grocery-lists/:listId API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAccess.mockResolvedValue({ personId: CALLER_PERSON });
  });

  it('GET returns list + items', async () => {
    const payload = { list: { id: LIST_ID }, items: [] };
    mockGetPersistentGroceryListDetail.mockResolvedValue(payload);

    const req = { method: 'GET', query: { listId: LIST_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(mockGetPersistentGroceryListDetail).toHaveBeenCalledWith(CALLER_PERSON, LIST_ID);
    expect(res.body).toEqual(payload);
  });

  it('GET returns 404 for a list not owned by the caller', async () => {
    mockGetPersistentGroceryListDetail.mockRejectedValue(new GroceryListNotFoundError('Grocery list not found.'));

    const req = { method: 'GET', query: { listId: LIST_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('PATCH rename delegates with the title', async () => {
    const list = { id: LIST_ID, title: 'New title' };
    mockRenameGroceryList.mockResolvedValue(list);

    const req = {
      method: 'PATCH',
      query: { listId: LIST_ID },
      body: { action: 'rename', title: 'New title' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(mockRenameGroceryList).toHaveBeenCalledWith(CALLER_PERSON, LIST_ID, 'New title');
    expect(res.body).toEqual({ list });
  });

  it('PATCH archive delegates correctly', async () => {
    const list = { id: LIST_ID, status: 'archived' };
    mockArchiveGroceryList.mockResolvedValue(list);

    const req = {
      method: 'PATCH',
      query: { listId: LIST_ID },
      body: { action: 'archive' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(mockArchiveGroceryList).toHaveBeenCalledWith(CALLER_PERSON, LIST_ID);
    expect(res.body).toEqual({ list });
  });

  it('PATCH rejects an unsupported action', async () => {
    const req = {
      method: 'PATCH',
      query: { listId: LIST_ID },
      body: { action: 'nope' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('DELETE returns 409 on conflict (list still has items)', async () => {
    mockDeleteGroceryList.mockRejectedValue(
      new GroceryListConflictError('This list still has items. Archive it instead, or remove all items first.'),
    );

    const req = { method: 'DELETE', query: { listId: LIST_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(res.statusCode).toBe(409);
  });

  it('DELETE returns 204 on success', async () => {
    mockDeleteGroceryList.mockResolvedValue(undefined);

    const req = { method: 'DELETE', query: { listId: LIST_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await listDetailHandler(req, res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });
});

describe('grocery-lists/:listId/items API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAccess.mockResolvedValue({ personId: CALLER_PERSON });
  });

  it('POST adds an item', async () => {
    const item = { id: ITEM_ID, name: 'Milk' };
    mockAddGroceryListItem.mockResolvedValue(item);

    const req = {
      method: 'POST',
      query: { listId: LIST_ID },
      body: { name: 'Milk', quantity: 1, unit: 'gal' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await itemsIndexHandler(req, res);

    expect(mockAddGroceryListItem).toHaveBeenCalledWith(CALLER_PERSON, LIST_ID, {
      name: 'Milk',
      quantity: 1,
      unit: 'gal',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ item });
  });

  it('POST returns 400 on validation error', async () => {
    mockAddGroceryListItem.mockRejectedValue(new GroceryListValidationError('name is required.'));

    const req = {
      method: 'POST',
      query: { listId: LIST_ID },
      body: {},
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await itemsIndexHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates an item', async () => {
    const item = { id: ITEM_ID, status: 'bought' };
    mockUpdateGroceryListItem.mockResolvedValue(item);

    const req = {
      method: 'PATCH',
      query: { listId: LIST_ID, itemId: ITEM_ID },
      body: { status: 'bought' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await itemDetailHandler(req, res);

    expect(mockUpdateGroceryListItem).toHaveBeenCalledWith(CALLER_PERSON, LIST_ID, ITEM_ID, {
      status: 'bought',
    });
    expect(res.body).toEqual({ item });
  });

  it('DELETE removes an item', async () => {
    mockDeleteGroceryListItem.mockResolvedValue(undefined);

    const req = {
      method: 'DELETE',
      query: { listId: LIST_ID, itemId: ITEM_ID },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await itemDetailHandler(req, res);

    expect(mockDeleteGroceryListItem).toHaveBeenCalledWith(CALLER_PERSON, LIST_ID, ITEM_ID);
    expect(res.statusCode).toBe(204);
  });

  it('DELETE returns 404 when the item is not found', async () => {
    mockDeleteGroceryListItem.mockRejectedValue(new GroceryListNotFoundError('Grocery item not found.'));

    const req = {
      method: 'DELETE',
      query: { listId: LIST_ID, itemId: ITEM_ID },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await itemDetailHandler(req, res);

    expect(res.statusCode).toBe(404);
  });
});
