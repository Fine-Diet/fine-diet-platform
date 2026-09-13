import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
jest.mock('@/lib/plans/groceryListService', () => ({
  GroceryListNotFoundError: class GroceryListNotFoundError extends Error {},
  getPersistentGroceryListDetail: jest.fn(),
}));

import {
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulNotFoundError,
  getGroceryHaulExecution,
  getGroceryHaulExecutionReadiness,
  startGroceryHaulExecution,
  updateGroceryHaulExecutionItem,
} from '../service';
import {
  GROCERY_HAUL_EXECUTION_READINESS_RPC_NAME,
  GROCERY_HAUL_EXECUTION_START_RPC_NAME,
  SHOPPING_VIEW_EXECUTION_SQL_PATH,
} from '../schema';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';

const PERSON = 'person-1';
const startedAt = '2026-09-08T15:00:00.000Z';

function readiness(executableItemCount = 1) {
  return {
    haul_id: 'haul-1',
    status: 'planned',
    can_start: executableItemCount > 0,
    executable_item_count: executableItemCount,
    blockers: executableItemCount === 0 ? [{
      code: 'zero_executable_items',
      severity: 'blocker',
      message: 'At least one item must have final_quantity greater than zero.',
    }] : [],
    warnings: [
      {
        code: 'missing_purchasing_product',
        severity: 'warning',
        haul_item_id: 'haul-item-1',
        message: 'Purchasing product is not selected.',
      },
      {
        code: 'missing_store_location',
        severity: 'warning',
        haul_item_id: 'haul-item-1',
        message: 'Store or location context is missing.',
      },
      {
        code: 'missing_price',
        severity: 'warning',
        haul_item_id: 'haul-item-1',
        message: 'Price is missing.',
      },
    ],
    deferred_findings: [
      { code: 'source_changes_not_evaluated', evaluation: 'not_evaluated' },
      { code: 'duplicate_conflicts_not_evaluated', evaluation: 'not_evaluated' },
    ],
  };
}

function installFake(status = 'active') {
  const initial: Record<string, Row[]> = {
    grocery_hauls: [{
      id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      shopping_date: '2026-09-08',
      status,
      creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      title: 'Weekend',
      budget_amount: 40,
      currency: 'USD',
      shopping_started_at: status === 'active' ? startedAt : null,
      created_at: startedAt,
      updated_at: startedAt,
    }],
    generated_grocery_lists: [{
      id: 'list-1',
      person_id: PERSON,
      title: 'Essentials',
      quantity: 99,
    }],
    grocery_haul_items: [{
      id: 'haul-item-1',
      haul_id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      quantity_snapshot: 4,
      final_quantity: 2,
      product_title: 'Prepared oats',
      retailer: 'Prepared Market',
      price_amount: 3,
    }],
    grocery_haul_execution_items: [{
      id: 'execution-1',
      person_id: PERSON,
      haul_id: 'haul-1',
      haul_item_id: 'haul-item-1',
      sort_ordinal: 1,
      state: 'pending',
      source_grocery_list_id: 'list-1',
      source_name_snapshot: 'Oats',
      source_quantity_snapshot: 4,
      source_unit_snapshot: 'cup',
      prepared_quantity: 2,
      prepared_selected_food_object_id: 'prepared-food',
      prepared_product_title: 'Prepared oats',
      prepared_brand_name: 'Prepared Brand',
      prepared_purchase_unit: 'box',
      prepared_package_size: 12,
      prepared_package_unit: 'oz',
      prepared_package_count: 1,
      prepared_retailer: 'Prepared Market',
      prepared_store_location: 'Downtown',
      prepared_postal_code: '60601',
      prepared_price_amount: 3,
      prepared_price_currency: 'USD',
      prepared_price_source: 'sourced',
      prepared_source_purchasing_choice_id: 'choice-1',
      prepared_source_price_observation_id: 'price-1',
      acquired_quantity: 2,
      acquired_food_object_id: 'prepared-food',
      acquired_product_title: 'Prepared oats',
      acquired_brand_name: 'Prepared Brand',
      acquired_purchase_unit: 'box',
      acquired_package_size: 12,
      acquired_package_unit: 'oz',
      acquired_package_count: 1,
      acquired_retailer: 'Prepared Market',
      acquired_store_location: 'Downtown',
      acquired_postal_code: '60601',
      acquired_price_amount: 3,
      acquired_price_currency: 'USD',
      state_changed_at: startedAt,
      basketed_at: null,
      skipped_at: null,
      acquisition_updated_at: null,
      created_at: startedAt,
      updated_at: startedAt,
    }],
  };
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Packet 9 Shopping View execution contract', () => {
  it('pins the approved Shopping View route to the same Haul identity', () => {
    expect(APP_ROUTE_BUILDERS.foodHaulShop('haul-1'))
      .toBe('/app/food/hauls/haul-1/shop');
  });

  it('defines an atomic owner-safe idempotent activation and immutable snapshots in SQL', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), SHOPPING_VIEW_EXECUTION_SQL_PATH),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.grocery_haul_execution_items');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.start_grocery_haul_execution');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("v_haul.status = 'active'");
    expect(sql).toContain("'outcome', 'already_active'");
    expect(sql).toContain('AND item.final_quantity > 0');
    expect(sql).toContain('item.quantity_snapshot, item.unit_snapshot');
    expect(sql).toContain('item.final_quantity, item.selected_food_object_id');
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_EXECUTION_ZERO_ITEMS'");
    expect(sql).toContain("v_haul.status IN ('closed', 'cancelled')");
    expect(sql).toContain('FOREIGN KEY (haul_item_id, haul_id, person_id)');
    expect(sql).toContain("RAISE EXCEPTION 'HAUL_EXECUTION_SNAPSHOT_IMMUTABLE'");
    expect(sql).toContain('TO service_role');
    expect(sql).not.toMatch(/UPDATE public\.grocery_(items|haul_items|list_)/);
    expect(sql).not.toMatch(/\bpantry_/i);
  });

  it('returns typed blockers, non-blocking warnings, and explicitly deferred conflict classes', async () => {
    mockRpc.mockResolvedValue({ data: readiness(1), error: null });
    const result = await getGroceryHaulExecutionReadiness(PERSON, 'haul-1');
    expect(result.can_start).toBe(true);
    expect(result.warnings.map((finding) => finding.code)).toEqual([
      'missing_purchasing_product',
      'missing_store_location',
      'missing_price',
    ]);
    expect(result.blockers).toEqual([]);
    expect(result.deferred_findings).toEqual([
      { code: 'source_changes_not_evaluated', evaluation: 'not_evaluated' },
      { code: 'duplicate_conflicts_not_evaluated', evaluation: 'not_evaluated' },
    ]);
    expect(mockRpc).toHaveBeenCalledWith(GROCERY_HAUL_EXECUTION_READINESS_RPC_NAME, {
      p_person_id: PERSON,
      p_haul_id: 'haul-1',
    });
  });

  it('starts and safely retries the same Haul identity through the atomic RPC', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          haul_id: 'haul-1',
          status: 'active',
          shopping_started_at: startedAt,
          item_count: 1,
          outcome: 'started',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          haul_id: 'haul-1',
          status: 'active',
          shopping_started_at: startedAt,
          item_count: 1,
          outcome: 'already_active',
        },
        error: null,
      });
    await expect(startGroceryHaulExecution({
      personId: PERSON,
      haulId: 'haul-1',
    })).resolves.toMatchObject({ haul_id: 'haul-1', outcome: 'started' });
    await expect(startGroceryHaulExecution({
      personId: PERSON,
      haulId: 'haul-1',
    })).resolves.toMatchObject({ haul_id: 'haul-1', outcome: 'already_active' });
    expect(mockRpc).toHaveBeenNthCalledWith(1, GROCERY_HAUL_EXECUTION_START_RPC_NAME, {
      p_person_id: PERSON,
      p_haul_id: 'haul-1',
    });
  });

  it('maps zero items, cross-owner absence, and historical activation rejection', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'HAUL_EXECUTION_ZERO_ITEMS' },
    });
    await expect(startGroceryHaulExecution({
      personId: PERSON,
      haulId: 'haul-1',
    })).rejects.toBeInstanceOf(GroceryHaulBlockedError);

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'HAUL_EXECUTION_NOT_FOUND' },
    });
    await expect(startGroceryHaulExecution({
      personId: PERSON,
      haulId: 'other-owner-haul',
    })).rejects.toBeInstanceOf(GroceryHaulNotFoundError);

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'HAUL_EXECUTION_HISTORICAL' },
    });
    await expect(startGroceryHaulExecution({
      personId: PERSON,
      haulId: 'closed-haul',
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);
  });

  it('loads all execution rows and counts in a fixed non-N+1 read path', async () => {
    installFake();
    mockRpc.mockResolvedValue({
      data: { ...readiness(1), status: 'active' },
      error: null,
    });
    const detail = await getGroceryHaulExecution(PERSON, 'haul-1');
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]).toMatchObject({
      source_list_title: 'Essentials',
      source_quantity_snapshot: 4,
      prepared_quantity: 2,
      acquired_quantity: 2,
    });
    expect(detail.summary).toMatchObject({
      total_count: 1,
      pending_count: 1,
      in_basket_count: 0,
      skipped_count: 0,
    });
    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('supports pending ↔ basket and pending ↔ skipped without touching preparation truth', async () => {
    const fake = installFake();
    const preparedBefore = structuredClone(fake.getTable('grocery_haul_items'));
    const listsBefore = structuredClone(fake.getTable('generated_grocery_lists'));

    await expect(updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'in_basket',
    })).resolves.toMatchObject({ state: 'in_basket' });
    await updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'pending',
    });
    await updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'skipped',
    });
    await expect(updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'pending',
    })).resolves.toMatchObject({ state: 'pending' });

    expect(fake.getTable('grocery_haul_items')).toEqual(preparedBefore);
    expect(fake.getTable('generated_grocery_lists')).toEqual(listsBefore);
  });

  it('persists substitutions and actual store/price only as acquisition outcome', async () => {
    const fake = installFake();
    const preparedBefore = structuredClone(fake.getTable('grocery_haul_items'));
    const listsBefore = structuredClone(fake.getTable('generated_grocery_lists'));

    const updated = await updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      acquisition: {
        food_object_id: 'substitute-food',
        product_title: 'Actual substitute',
        retailer: 'Actual Market',
        store_location: 'Uptown',
        price_amount: 2.5,
      },
    });
    expect(updated).toMatchObject({
      prepared_product_title: 'Prepared oats',
      prepared_retailer: 'Prepared Market',
      prepared_price_amount: 3,
      acquired_food_object_id: 'substitute-food',
      acquired_product_title: 'Actual substitute',
      acquired_retailer: 'Actual Market',
      acquired_store_location: 'Uptown',
      acquired_price_amount: 2.5,
      acquired_price_currency: 'USD',
    });
    expect(fake.getTable('grocery_haul_items')).toEqual(preparedBefore);
    expect(fake.getTable('generated_grocery_lists')).toEqual(listsBefore);
  });

  it('rejects execution mutations while the Haul is not active', async () => {
    installFake('planned');
    await expect(updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'in_basket',
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);
  });
});
