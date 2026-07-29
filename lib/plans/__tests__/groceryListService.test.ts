/**
 * Persistent Grocery Lists v1 — service-level tests.
 *
 * Mocks supabaseAdmin entirely (no live DB dependency — the schema this
 * service depends on has not been applied to any environment yet). Focus:
 * ownership scoping, default-list ensure/race behavior, and the guard rails
 * around rename/archive/delete for the default list and plan-derived lists.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  addGroceryListItem,
  archiveGroceryList,
  createNamedGroceryList,
  deleteGroceryList,
  ensureDefaultGroceryList,
  GroceryListConflictError,
  GroceryListNotFoundError,
  GroceryListValidationError,
  renameGroceryList,
  updateGroceryListItem,
} from '../groceryListService';
import type { GeneratedGroceryList, GroceryItem } from '../types';

const mockFrom = supabaseAdmin.from as jest.Mock;
const PERSON = 'person-1';
const LIST_ID = 'list-1';

function defaultListRow(overrides: Partial<GeneratedGroceryList> = {}): GeneratedGroceryList {
  return {
    id: LIST_ID,
    plan_id: null,
    person_id: PERSON,
    title: 'My Grocery List',
    date_range_start: null,
    date_range_end: null,
    mode: 'manual',
    status: 'active',
    export_payload_json: null,
    is_default: true,
    owner_type: 'person',
    owner_id: PERSON,
    created_by_person_id: PERSON,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Chainable query-builder mock. Terminal calls (`single`/`maybeSingle`) and
 * bare `await` (via `.then`) both resolve to the same configured result. */
function makeBuilder(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null, count: result.count };
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'not', 'order', 'limit']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn().mockResolvedValue(resolved);
  builder.maybeSingle = jest.fn().mockResolvedValue(resolved);
  // Make the builder itself awaitable, mirroring supabase-js's thenable
  // PostgrestFilterBuilder, for call sites that don't chain a terminal.
  (builder as unknown as PromiseLike<typeof resolved>).then = ((onFulfilled: (v: typeof resolved) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled)) as never;
  return builder;
}

describe('groceryListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureDefaultGroceryList', () => {
    it('returns the existing default list without inserting', async () => {
      const existing = defaultListRow();
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: existing }));

      const result = await ensureDefaultGroceryList(PERSON);

      expect(result).toEqual(existing);
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('creates a default list when none exists', async () => {
      const created = defaultListRow();
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: null })) // lookup: not found
        .mockImplementationOnce(() => makeBuilder({ data: created })); // insert

      const result = await ensureDefaultGroceryList(PERSON);

      expect(result).toEqual(created);
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('resolves a concurrent-create race by re-fetching the winner', async () => {
      const winner = defaultListRow();
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: null })) // lookup: not found
        .mockImplementationOnce(() =>
          makeBuilder({ data: null, error: { code: '23505', message: 'duplicate key' } }),
        ) // insert loses race
        .mockImplementationOnce(() => makeBuilder({ data: winner })); // re-fetch

      const result = await ensureDefaultGroceryList(PERSON);

      expect(result).toEqual(winner);
      expect(mockFrom).toHaveBeenCalledTimes(3);
    });
  });

  describe('createNamedGroceryList', () => {
    it('rejects an empty title', async () => {
      await expect(createNamedGroceryList(PERSON, '   ')).rejects.toThrow(GroceryListValidationError);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects a non-string title', async () => {
      await expect(createNamedGroceryList(PERSON, 42)).rejects.toThrow(GroceryListValidationError);
    });

    it('creates a named, non-default, planless list with a trimmed title', async () => {
      const created = defaultListRow({ id: 'list-2', is_default: false, title: 'Costco run' });
      const insertMock = jest.fn(() => builder);
      const builder = makeBuilder({ data: created });
      builder.insert = insertMock;
      mockFrom.mockImplementationOnce(() => builder);

      const result = await createNamedGroceryList(PERSON, '  Costco run  ');

      expect(result).toEqual(created);
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: null,
          owner_id: PERSON,
          is_default: false,
          title: 'Costco run',
          status: 'active',
        }),
      );
    });
  });

  describe('renameGroceryList', () => {
    it('throws GroceryListNotFoundError for a list not owned by the caller', async () => {
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: null }));

      await expect(renameGroceryList(PERSON, LIST_ID, 'New title')).rejects.toThrow(
        GroceryListNotFoundError,
      );
    });

    it('refuses to rename the default list', async () => {
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: defaultListRow({ is_default: true }) }));

      await expect(renameGroceryList(PERSON, LIST_ID, 'New title')).rejects.toThrow(
        GroceryListValidationError,
      );
    });

    it('refuses to rename a plan-derived list', async () => {
      mockFrom.mockImplementationOnce(() =>
        makeBuilder({ data: defaultListRow({ is_default: false, plan_id: 'plan-1' }) }),
      );

      await expect(renameGroceryList(PERSON, LIST_ID, 'New title')).rejects.toThrow(
        GroceryListValidationError,
      );
    });

    it('renames a named, planless list', async () => {
      const named = defaultListRow({ is_default: false, title: 'Old title' });
      const renamed = { ...named, title: 'New title' };
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: named })) // ownership load
        .mockImplementationOnce(() => makeBuilder({ data: renamed })); // update

      const result = await renameGroceryList(PERSON, LIST_ID, '  New title  ');
      expect(result.title).toBe('New title');
    });
  });

  describe('archiveGroceryList', () => {
    it('refuses to archive the default list', async () => {
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: defaultListRow({ is_default: true }) }));

      await expect(archiveGroceryList(PERSON, LIST_ID)).rejects.toThrow(GroceryListValidationError);
    });
  });

  describe('deleteGroceryList', () => {
    it('refuses to delete a list that still has items', async () => {
      const named = defaultListRow({ is_default: false });
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: named })) // ownership load
        .mockImplementationOnce(() => makeBuilder({ data: null, count: 3 })); // count check

      await expect(deleteGroceryList(PERSON, LIST_ID)).rejects.toThrow(GroceryListConflictError);
    });

    it('deletes an empty named list', async () => {
      const named = defaultListRow({ is_default: false });
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: named })) // ownership load
        .mockImplementationOnce(() => makeBuilder({ data: null, count: 0 })) // count check
        .mockImplementationOnce(() => makeBuilder({ data: null, error: null })); // delete

      await expect(deleteGroceryList(PERSON, LIST_ID)).resolves.toBeUndefined();
    });

    it('refuses to delete the default list', async () => {
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: defaultListRow({ is_default: true }) }));

      await expect(deleteGroceryList(PERSON, LIST_ID)).rejects.toThrow(GroceryListValidationError);
    });
  });

  describe('addGroceryListItem', () => {
    it('refuses to add manual items to a plan-derived list', async () => {
      mockFrom.mockImplementationOnce(() =>
        makeBuilder({ data: defaultListRow({ plan_id: 'plan-1' }) }),
      );

      await expect(
        addGroceryListItem(PERSON, LIST_ID, { name: 'Milk' }),
      ).rejects.toThrow(GroceryListValidationError);
    });

    it('rejects an empty item name', async () => {
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: defaultListRow() }));

      await expect(addGroceryListItem(PERSON, LIST_ID, { name: '  ' })).rejects.toThrow(
        GroceryListValidationError,
      );
    });

    it('rejects a negative quantity', async () => {
      mockFrom.mockImplementationOnce(() => makeBuilder({ data: defaultListRow() }));

      await expect(
        addGroceryListItem(PERSON, LIST_ID, { name: 'Milk', quantity: -1 }),
      ).rejects.toThrow(GroceryListValidationError);
    });

    it('adds a manual item with provenance set', async () => {
      const item: GroceryItem = {
        id: 'item-1',
        grocery_list_id: LIST_ID,
        person_id: PERSON,
        name: 'Milk',
        quantity: 1,
        unit: 'gal',
        aisle_category: null,
        food_object_id: null,
        source_planned_meal_ids: [],
        status: 'pending',
        notes: null,
        added_by_person_id: PERSON,
        source_type: 'manual',
        created_at: '',
        updated_at: '',
      };
      const insertMock = jest.fn(() => builder);
      const builder = makeBuilder({ data: item });
      builder.insert = insertMock;
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: defaultListRow() })) // ownership load
        .mockImplementationOnce(() => builder); // insert

      const result = await addGroceryListItem(PERSON, LIST_ID, {
        name: '  Milk  ',
        quantity: 1,
        unit: 'gal',
      });

      expect(result).toEqual(item);
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          grocery_list_id: LIST_ID,
          person_id: PERSON,
          added_by_person_id: PERSON,
          source_type: 'manual',
          name: 'Milk',
          quantity: 1,
          unit: 'gal',
          status: 'pending',
        }),
      );
    });
  });

  describe('updateGroceryListItem', () => {
    it('rejects an invalid status value', async () => {
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: defaultListRow() })) // list ownership
        .mockImplementationOnce(() =>
          makeBuilder({
            data: {
              id: 'item-1',
              grocery_list_id: LIST_ID,
              person_id: PERSON,
              name: 'Milk',
              status: 'pending',
            },
          }),
        ); // item ownership

      await expect(
        updateGroceryListItem(PERSON, LIST_ID, 'item-1', { status: 'not_a_status' }),
      ).rejects.toThrow(GroceryListValidationError);
    });

    it('rejects an empty patch', async () => {
      mockFrom
        .mockImplementationOnce(() => makeBuilder({ data: defaultListRow() }))
        .mockImplementationOnce(() =>
          makeBuilder({
            data: {
              id: 'item-1',
              grocery_list_id: LIST_ID,
              person_id: PERSON,
              name: 'Milk',
              status: 'pending',
            },
          }),
        );

      await expect(updateGroceryListItem(PERSON, LIST_ID, 'item-1', {})).rejects.toThrow(
        GroceryListValidationError,
      );
    });
  });
});
