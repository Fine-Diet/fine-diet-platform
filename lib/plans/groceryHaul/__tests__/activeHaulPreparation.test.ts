import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import {
  acquiredBaselineDiffersFromRow,
  acquisitionPatchFromHaulItem,
  mergeAcquisitionOverlay,
} from '../activePreparation';
import {
  GroceryHaulConflictError,
  getGroceryHaulExecution,
  updateGroceryHaulExecutionItem,
  updateGroceryHaulItemPreparation,
} from '../service';
import {
  ACTIVE_HAUL_PENDING_PREPARATION_SQL_PATH,
  GROCERY_HAUL_EXECUTION_BASKET_RPC_NAME,
  GROCERY_HAUL_EXECUTION_BASKET_SQL_PATH,
  GROCERY_HAUL_EXECUTION_READINESS_RPC_NAME,
} from '../schema';
import { currentPlanInstructionLabel } from '@/components/food/hauls/presentation';
import type { GroceryHaulExecutionItem, GroceryHaulItem } from '@/lib/plans/types';
import { simulateMarkGroceryHaulExecutionInBasket } from './basketRpcTestHelper';

const PERSON = 'person-1';

function installFake(executionState: 'pending' | 'in_basket' | 'skipped' = 'pending') {
  const initial: Record<string, Row[]> = {
    grocery_hauls: [{
      id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      shopping_date: '2026-09-08',
      status: 'active',
      currency: 'USD',
      shopping_started_at: '2026-09-08T15:00:00.000Z',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    }],
    grocery_haul_items: [{
      id: 'haul-item-1',
      haul_id: 'haul-1',
      person_id: PERSON,
      source_grocery_list_id: 'list-1',
      name_snapshot: 'Oats',
      quantity_snapshot: 4,
      unit_snapshot: 'cup',
      final_quantity: 2,
      product_title: 'Current oats',
      retailer: 'Current Market',
      store_location: 'Uptown',
      package_unit: 'box',
      price_amount: 4,
      price_currency: 'USD',
      price_source: 'manual',
      resolution_source: 'haul_edit',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    }],
    grocery_haul_execution_items: [{
      id: 'execution-1',
      haul_id: 'haul-1',
      haul_item_id: 'haul-item-1',
      person_id: PERSON,
      state: executionState,
      sort_ordinal: 1,
      source_grocery_list_id: 'list-1',
      source_name_snapshot: 'Oats',
      prepared_product_title: 'Activation oats',
      prepared_retailer: 'Activation Market',
      prepared_quantity: 2,
      acquired_quantity: 2,
      acquired_product_title: 'Current oats',
      acquired_retailer: 'Current Market',
      acquired_store_location: 'Uptown',
      acquired_package_unit: 'box',
      acquired_price_amount: 4,
      acquired_price_currency: 'USD',
    }],
    generated_grocery_lists: [{ id: 'list-1', person_id: PERSON, title: 'Essentials' }],
  };
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  mockRpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
    if (name === GROCERY_HAUL_EXECUTION_READINESS_RPC_NAME) {
      return {
        data: {
          haul_id: 'haul-1',
          status: 'active',
          can_start: true,
          executable_item_count: 1,
          blockers: [],
          warnings: [],
          deferred_findings: [],
        },
        error: null,
      };
    }
    if (name === GROCERY_HAUL_EXECUTION_BASKET_RPC_NAME) {
      return {
        data: simulateMarkGroceryHaulExecutionInBasket(
          fake.tables,
          params as {
            p_execution_item_id: string;
            p_acquisition_overlay?: Record<string, string | number | null>;
          },
        ),
        error: null,
      };
    }
    return { data: null, error: null };
  });
  return fake;
}

describe('Active Haul pending-line preparation contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('documents reviewed SQL for pending-line edits and atomic basket capture', () => {
    const prepSql = fs.readFileSync(
      path.join(process.cwd(), ACTIVE_HAUL_PENDING_PREPARATION_SQL_PATH),
      'utf8',
    );
    const basketSql = fs.readFileSync(
      path.join(process.cwd(), GROCERY_HAUL_EXECUTION_BASKET_SQL_PATH),
      'utf8',
    );
    expect(prepSql).toContain('HAUL_PREPARATION_EXECUTION_LOCKED');
    expect(basketSql).toContain('FOR UPDATE');
    expect(basketSql).toContain('mark_grocery_haul_execution_in_basket');
    expect(basketSql).toContain('acquired_package_unit');
  });

  it('merges partial acquisition overlays on top of the current preparation baseline', () => {
    const item = {
      final_quantity: 2,
      selected_food_object_id: null,
      product_title: 'Current oats',
      brand_name: null,
      purchase_unit: null,
      package_size: null,
      package_unit: 'box',
      package_count: null,
      retailer: 'Current Market',
      store_location: 'Uptown',
      postal_code: null,
      price_amount: 4,
      price_currency: 'USD',
    } as GroceryHaulItem;
    const merged = mergeAcquisitionOverlay(
      acquisitionPatchFromHaulItem(item, 'USD'),
      { product_title: 'Substitute oats', package_unit: 'can' },
      'USD',
    );
    expect(merged.acquired_product_title).toBe('Substitute oats');
    expect(merged.acquired_package_unit).toBe('can');
    expect(merged.acquired_retailer).toBe('Current Market');
  });

  it('allows active pending-line preparation edits without changing source snapshots', async () => {
    const fake = installFake('pending');
    const before = structuredClone(fake.getTable('grocery_haul_items')[0]);
    const updated = await updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: {
        productTitle: 'Edited oats',
        retailer: 'Edited Market',
        storeLocation: 'West',
        packageUnit: 'can',
        finalQuantity: 3,
      },
    });
    expect(updated.product_title).toBe('Edited oats');
    expect(updated.package_unit).toBe('can');
    expect(updated.quantity_snapshot).toBe(before.quantity_snapshot);
  });

  it('blocks active preparation edits while execution is in_basket or skipped', async () => {
    installFake('in_basket');
    await expect(updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: { finalQuantity: 1 },
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);

    installFake('skipped');
    await expect(updateGroceryHaulItemPreparation({
      personId: PERSON,
      haulId: 'haul-1',
      itemId: 'haul-item-1',
      patch: { finalQuantity: 1 },
    })).rejects.toBeInstanceOf(GroceryHaulConflictError);
  });

  it('uses current preparation for pending Shopping View instructions', () => {
    const item = {
      state: 'pending',
      prepared_product_title: 'Activation oats',
      prepared_retailer: 'Activation Market',
      prepared_quantity: 2,
      prepared_store_location: 'Downtown',
      current_preparation: {
        quantity: 3,
        selected_food_object_id: null,
        product_title: 'Current oats',
        brand_name: null,
        purchase_unit: null,
        package_size: null,
        package_unit: null,
        package_count: null,
        retailer: 'Current Market',
        store_location: 'Uptown',
        postal_code: null,
        price_amount: 4,
        price_currency: 'USD',
        price_source: 'manual',
        is_executable: true,
      },
    } as GroceryHaulExecutionItem;
    expect(currentPlanInstructionLabel(item)).toContain('Current oats');
    expect(currentPlanInstructionLabel(item)).not.toContain('Activation oats');
  });

  it('records current preparation as acquisition truth on pending -> in_basket', async () => {
    installFake('pending');
    const updated = await updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'in_basket',
    });
    expect(updated).toMatchObject({
      state: 'in_basket',
      acquired_product_title: 'Current oats',
      acquired_retailer: 'Current Market',
      acquired_store_location: 'Uptown',
      acquired_package_unit: 'box',
      acquired_quantity: 2,
      acquired_price_amount: 4,
    });
    expect(updated.prepared_product_title).toBe('Activation oats');
    expect(mockRpc).toHaveBeenCalledWith(
      GROCERY_HAUL_EXECUTION_BASKET_RPC_NAME,
      expect.objectContaining({ p_execution_item_id: 'execution-1' }),
    );
  });

  it('preserves a pending substitute when In Basket is clicked without a new acquisition patch', async () => {
    const fake = installFake('pending');
    fake.getTable('grocery_haul_execution_items')[0] = {
      ...fake.getTable('grocery_haul_execution_items')[0],
      acquired_product_title: 'Substitute oats',
      acquired_retailer: 'Substitute Market',
      acquired_package_unit: 'can',
      acquired_price_amount: 2.5,
    };
    const baseline = acquisitionPatchFromHaulItem(
      fake.getTable('grocery_haul_items')[0] as unknown as GroceryHaulItem,
      'USD',
    );
    expect(acquiredBaselineDiffersFromRow(
      fake.getTable('grocery_haul_execution_items')[0],
      baseline,
    )).toBe(true);

    const updated = await updateGroceryHaulExecutionItem({
      personId: PERSON,
      haulId: 'haul-1',
      executionItemId: 'execution-1',
      state: 'in_basket',
    });
    expect(updated.acquired_product_title).toBe('Substitute oats');
    expect(updated.acquired_package_unit).toBe('can');
  });

  it('reports executable-only progress counts and excluded audit rows', async () => {
    const fake = installFake('pending');
    fake.getTable('grocery_haul_items')[0].final_quantity = 0;
    const detail = await getGroceryHaulExecution(PERSON, 'haul-1');
    expect(detail.summary).toMatchObject({
      total_count: 0,
      pending_count: 0,
      excluded_count: 1,
    });
  });
});
