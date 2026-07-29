/**
 * Persistent Grocery Lists v1 — service-level tests.
 *
 * Covers the corrected packet's required guarantees:
 *   - person_id is the sole, enforceable ownership boundary (no owner_type /
 *     owner_id pair anywhere in this module).
 *   - Target-list generation via reconcilePlanScopeIntoGroceryList is
 *     additive and idempotent: re-running with unchanged plan data produces
 *     no net writes, preserves manual items and other reconciliation
 *     batches untouched, and preserves per-item status across refreshes.
 *   - Cross-user access is rejected everywhere (list/item lookups scoped to
 *     the caller's own personId return NotFound rather than someone else's
 *     data).
 */

import { createFakeSupabase, type Row } from './testSupabaseFake';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const mockGenerateGroceryList = jest.fn();
const mockListGroceryListsForPerson = jest.fn();

jest.mock('../groceryServerService', () => ({
  generateGroceryList: (...args: unknown[]) => mockGenerateGroceryList(...args),
  listGroceryListsForPerson: (...args: unknown[]) => mockListGroceryListsForPerson(...args),
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  addGroceryListItem,
  archiveGroceryList,
  createNamedGroceryList,
  deleteGroceryList,
  deleteGroceryListItem,
  ensureDefaultGroceryList,
  getGroceryListsOverview,
  getPersistentGroceryListDetail,
  GroceryListConflictError,
  GroceryListNotFoundError,
  GroceryListValidationError,
  reconcilePlanScopeIntoGroceryList,
  renameGroceryList,
  unarchiveGroceryList,
  updateGroceryListItem,
} from '../groceryListService';
import type { GroceryItem, PlannedMeal } from '../types';

const PERSON_A = 'person-a';
const PERSON_B = 'person-b';

function installFake(initial: Record<string, Row[]> = {}) {
  const fake = createFakeSupabase(initial);
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => fake.from(table));
  return fake;
}

function derivedItem(overrides: Partial<GroceryItem> = {}): Pick<
  GroceryItem,
  'name' | 'quantity' | 'unit' | 'food_object_id' | 'source_planned_meal_ids' | 'notes'
> {
  return {
    name: 'Spinach',
    quantity: 2,
    unit: 'cup',
    food_object_id: 'food-spinach',
    source_planned_meal_ids: ['meal-1'],
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// Ownership: person_id is the sole boundary
// ============================================================================

describe('ownership enforcement', () => {
  it('does not leak another person\'s default/named lists into the overview', async () => {
    installFake();
    mockListGroceryListsForPerson.mockResolvedValue([]);

    const overviewA = await getGroceryListsOverview(PERSON_A);
    const overviewB = await getGroceryListsOverview(PERSON_B);

    expect(overviewA.default_list.person_id).toBe(PERSON_A);
    expect(overviewB.default_list.person_id).toBe(PERSON_B);
    expect(overviewA.default_list.id).not.toBe(overviewB.default_list.id);
    expect(overviewA.named_lists).toHaveLength(0);
    expect(overviewB.named_lists).toHaveLength(0);
  });

  it('rejects reading a list owned by a different person', async () => {
    installFake();
    const list = await createNamedGroceryList(PERSON_A, 'Costco run');

    await expect(getPersistentGroceryListDetail(PERSON_B, list.id)).rejects.toThrow(
      GroceryListNotFoundError,
    );
  });

  it('rejects rename/archive/unarchive/delete against a foreign list', async () => {
    installFake();
    const list = await createNamedGroceryList(PERSON_A, 'Costco run');

    await expect(renameGroceryList(PERSON_B, list.id, 'Hijacked')).rejects.toThrow(
      GroceryListNotFoundError,
    );
    await expect(archiveGroceryList(PERSON_B, list.id)).rejects.toThrow(GroceryListNotFoundError);
    await expect(unarchiveGroceryList(PERSON_B, list.id)).rejects.toThrow(GroceryListNotFoundError);
    await expect(deleteGroceryList(PERSON_B, list.id)).rejects.toThrow(GroceryListNotFoundError);
  });

  it('rejects manual item CRUD against a foreign list', async () => {
    installFake();
    const list = await createNamedGroceryList(PERSON_A, 'Costco run');

    await expect(addGroceryListItem(PERSON_B, list.id, { name: 'Milk' })).rejects.toThrow(
      GroceryListNotFoundError,
    );

    const item = await addGroceryListItem(PERSON_A, list.id, { name: 'Milk' });
    await expect(
      updateGroceryListItem(PERSON_B, list.id, item.id, { quantity: 2 }),
    ).rejects.toThrow(GroceryListNotFoundError);
    await expect(deleteGroceryListItem(PERSON_B, list.id, item.id)).rejects.toThrow(
      GroceryListNotFoundError,
    );
  });

  it('rejects reconciling plan demand into a list owned by a different person', async () => {
    installFake();
    const listA = await createNamedGroceryList(PERSON_A, 'Costco run');
    mockGenerateGroceryList.mockResolvedValue({
      list: {},
      items: [],
      pantry_items: [],
      source_meals: [],
    });

    await expect(
      reconcilePlanScopeIntoGroceryList({
        personId: PERSON_B,
        targetListId: listA.id,
        planId: 'plan-1',
        dateStart: '2026-07-15',
        dateEnd: '2026-07-15',
      }),
    ).rejects.toThrow(GroceryListNotFoundError);
  });
});

// ============================================================================
// Default list lifecycle
// ============================================================================

describe('ensureDefaultGroceryList', () => {
  it('creates exactly one default list and is idempotent on repeat calls', async () => {
    const fake = installFake();
    const first = await ensureDefaultGroceryList(PERSON_A);
    const second = await ensureDefaultGroceryList(PERSON_A);

    expect(first.id).toBe(second.id);
    expect(first.is_default).toBe(true);
    expect(first.person_id).toBe(PERSON_A);
    const defaultRows = fake
      .getTable('generated_grocery_lists')
      .filter((r) => r.person_id === PERSON_A && r.is_default === true);
    expect(defaultRows).toHaveLength(1);
  });
});

describe('list lifecycle guards', () => {
  it('refuses to archive or delete the default list', async () => {
    installFake();
    const def = await ensureDefaultGroceryList(PERSON_A);

    await expect(archiveGroceryList(PERSON_A, def.id)).rejects.toThrow(GroceryListValidationError);
    await expect(deleteGroceryList(PERSON_A, def.id)).rejects.toThrow(GroceryListValidationError);
  });

  it('refuses to delete a non-empty list, but allows it once emptied', async () => {
    installFake();
    const list = await createNamedGroceryList(PERSON_A, 'Costco run');
    const item = await addGroceryListItem(PERSON_A, list.id, { name: 'Milk' });

    await expect(deleteGroceryList(PERSON_A, list.id)).rejects.toThrow(GroceryListValidationError);

    await deleteGroceryListItem(PERSON_A, list.id, item.id);
    await expect(deleteGroceryList(PERSON_A, list.id)).resolves.toBeUndefined();
  });

  it('refuses to unarchive into a second default when one is already active', async () => {
    // Simulate legacy/inconsistent data: two rows flagged is_default for the
    // same person, one archived. Unarchiving the archived one should trip
    // the same partial-unique-index conflict Postgres would raise.
    const fake = installFake();
    const activeDefault = await ensureDefaultGroceryList(PERSON_A);
    expect(activeDefault.is_default).toBe(true);

    const rows = fake.getTable('generated_grocery_lists');
    rows.push({
      id: 'legacy-default',
      person_id: PERSON_A,
      created_by_person_id: PERSON_A,
      title: 'My Grocery List',
      plan_id: null,
      date_range_start: null,
      date_range_end: null,
      mode: 'manual',
      status: 'archived',
      is_default: true,
      archived_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    await expect(unarchiveGroceryList(PERSON_A, 'legacy-default')).rejects.toThrow(
      GroceryListConflictError,
    );
  });
});

// ============================================================================
// reconcilePlanScopeIntoGroceryList — additive, idempotent target-list
// generation
// ============================================================================

describe('reconcilePlanScopeIntoGroceryList', () => {
  const PLAN_ID = 'plan-1';
  const DATE_START = '2026-07-15';
  const DATE_END = '2026-07-21';

  function mockDerivedItems(items: ReturnType<typeof derivedItem>[], sourceMeals: PlannedMeal[] = []) {
    mockGenerateGroceryList.mockResolvedValue({
      list: {},
      items,
      pantry_items: [],
      source_meals: sourceMeals,
    });
  }

  it('validates plan id and date inputs before touching any list', async () => {
    installFake();
    await expect(
      reconcilePlanScopeIntoGroceryList({
        personId: PERSON_A,
        planId: '',
        dateStart: DATE_START,
        dateEnd: DATE_END,
      }),
    ).rejects.toThrow(GroceryListValidationError);

    await expect(
      reconcilePlanScopeIntoGroceryList({
        personId: PERSON_A,
        planId: PLAN_ID,
        dateStart: 'not-a-date',
        dateEnd: DATE_END,
      }),
    ).rejects.toThrow(GroceryListValidationError);

    await expect(
      reconcilePlanScopeIntoGroceryList({
        personId: PERSON_A,
        planId: PLAN_ID,
        dateStart: DATE_END,
        dateEnd: DATE_START,
      }),
    ).rejects.toThrow(GroceryListValidationError);

    expect(mockGenerateGroceryList).not.toHaveBeenCalled();
  });

  it('refuses to reconcile into a plan-scoped or archived list', async () => {
    installFake();
    mockDerivedItems([derivedItem()]);

    const named = await createNamedGroceryList(PERSON_A, 'Costco run');
    await archiveGroceryList(PERSON_A, named.id);

    await expect(
      reconcilePlanScopeIntoGroceryList({
        personId: PERSON_A,
        targetListId: named.id,
        planId: PLAN_ID,
        dateStart: DATE_START,
        dateEnd: DATE_END,
      }),
    ).rejects.toThrow(GroceryListValidationError);
  });

  it('defaults to the person\'s default list when no target is given', async () => {
    installFake();
    mockDerivedItems([derivedItem()]);

    const result = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      planId: PLAN_ID,
      dateStart: DATE_START,
      dateEnd: DATE_END,
    });

    expect(result.target_list.is_default).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.batch_item_ids).toHaveLength(1);
  });

  it('is idempotent: re-running unchanged derivation yields no net writes', async () => {
    installFake();
    mockDerivedItems([derivedItem(), derivedItem({ name: 'Oats', food_object_id: 'food-oats', unit: 'g', quantity: 500 })]);

    const first = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      planId: PLAN_ID,
      dateStart: DATE_START,
      dateEnd: DATE_END,
    });
    expect(first.items).toHaveLength(2);

    const second = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      planId: PLAN_ID,
      dateStart: DATE_START,
      dateEnd: DATE_END,
    });

    expect(second.items).toHaveLength(2);
    expect(new Set(second.items.map((i) => i.id))).toEqual(new Set(first.items.map((i) => i.id)));
    expect(new Set(second.batch_item_ids)).toEqual(new Set(first.batch_item_ids));
  });

  it('preserves status on refresh and only inserts/removes what actually changed', async () => {
    installFake();
    mockDerivedItems([
      derivedItem({ name: 'Spinach', food_object_id: 'food-spinach', unit: 'cup', quantity: 2 }),
      derivedItem({ name: 'Oats', food_object_id: 'food-oats', unit: 'g', quantity: 500 }),
    ]);

    const first = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      planId: PLAN_ID,
      dateStart: DATE_START,
      dateEnd: DATE_END,
    });
    const spinach = first.items.find((i) => i.food_object_id === 'food-spinach')!;
    const oats = first.items.find((i) => i.food_object_id === 'food-oats')!;

    await updateGroceryListItem(PERSON_A, first.target_list.id, spinach.id, { status: 'bought' });

    // Second derivation: spinach quantity changed (still present), oats
    // dropped (its contributing meal is gone), and kale is newly added.
    mockDerivedItems([
      derivedItem({ name: 'Spinach', food_object_id: 'food-spinach', unit: 'cup', quantity: 4 }),
      derivedItem({ name: 'Kale', food_object_id: 'food-kale', unit: 'cup', quantity: 1 }),
    ]);

    const second = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      planId: PLAN_ID,
      dateStart: DATE_START,
      dateEnd: DATE_END,
    });

    expect(second.items).toHaveLength(2);
    const refreshedSpinach = second.items.find((i) => i.food_object_id === 'food-spinach')!;
    expect(refreshedSpinach.id).toBe(spinach.id);
    expect(refreshedSpinach.quantity).toBe(4);
    expect(refreshedSpinach.status).toBe('bought');
    expect(second.items.find((i) => i.food_object_id === 'food-oats')).toBeUndefined();
    expect(second.items.find((i) => i.food_object_id === 'food-kale')).toBeDefined();
  });

  it('does not touch manual items or other reconciliation batches on the same list', async () => {
    installFake();
    const defaultList = await ensureDefaultGroceryList(PERSON_A);
    const manualItem = await addGroceryListItem(PERSON_A, defaultList.id, {
      name: 'Paper towels',
      quantity: 1,
    });

    // A different plan's batch, already reconciled into the same list.
    mockDerivedItems([derivedItem({ name: 'Rice', food_object_id: 'food-rice', unit: 'g', quantity: 300 })]);
    const otherPlanResult = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      targetListId: defaultList.id,
      planId: 'plan-other',
      dateStart: '2026-08-01',
      dateEnd: '2026-08-07',
    });
    const otherPlanItemId = otherPlanResult.batch_item_ids[0];

    // Now reconcile the plan under test into the same list.
    mockDerivedItems([derivedItem({ name: 'Spinach', food_object_id: 'food-spinach', unit: 'cup', quantity: 2 })]);
    const result = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      targetListId: defaultList.id,
      planId: PLAN_ID,
      dateStart: DATE_START,
      dateEnd: DATE_END,
    });

    const ids = result.items.map((i) => i.id);
    expect(ids).toContain(manualItem.id);
    expect(ids).toContain(otherPlanItemId);
    expect(result.batch_item_ids).not.toContain(manualItem.id);
    expect(result.batch_item_ids).not.toContain(otherPlanItemId);

    const manual = result.items.find((i) => i.id === manualItem.id)!;
    expect(manual.name).toBe('Paper towels');
    expect(manual.source_type).toBe('manual');
    const otherBatchItem = result.items.find((i) => i.id === otherPlanItemId)!;
    expect(otherBatchItem.source_id).toBe('plan-other');
  });

  it('scopes batches by date range so a different window on the same plan is untouched', async () => {
    installFake();
    const defaultList = await ensureDefaultGroceryList(PERSON_A);

    mockDerivedItems([derivedItem({ name: 'Spinach', food_object_id: 'food-spinach', unit: 'cup', quantity: 2 })]);
    const weekOne = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      targetListId: defaultList.id,
      planId: PLAN_ID,
      dateStart: '2026-07-01',
      dateEnd: '2026-07-07',
    });

    mockDerivedItems([derivedItem({ name: 'Oats', food_object_id: 'food-oats', unit: 'g', quantity: 500 })]);
    const weekTwo = await reconcilePlanScopeIntoGroceryList({
      personId: PERSON_A,
      targetListId: defaultList.id,
      planId: PLAN_ID,
      dateStart: '2026-07-08',
      dateEnd: '2026-07-14',
    });

    const ids = weekTwo.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([weekOne.batch_item_ids[0], weekTwo.batch_item_ids[0]]));
    expect(weekTwo.batch_item_ids).not.toContain(weekOne.batch_item_ids[0]);
  });
});
