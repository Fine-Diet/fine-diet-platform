import fs from 'fs';
import path from 'path';
import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import {
  GroceryHaulConflictError,
  updateGroceryHaulExecutionItem,
  updateGroceryHaulItemPreparation,
} from '../service';
import { ACTIVE_HAUL_PENDING_PREPARATION_SQL_PATH } from '../schema';
import { currentPlanInstructionLabel } from '@/components/food/hauls/presentation';
import type { GroceryHaulExecutionItem } from '@/lib/plans/types';

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
      prepared_product_title: 'Activation oats',
      prepared_retailer: 'Activation Market',
      prepared_quantity: 2,
      acquired_quantity: 2,
      acquired_product_title: 'Activation oats',
      acquired_retailer: 'Activation Market',
      acquired_price_amount: 3,
    }],
  };
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

describe('Active Haul pending-line preparation contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('documents the SQL guard that allows active pending-line preparation edits', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), ACTIVE_HAUL_PENDING_PREPARATION_SQL_PATH),
      'utf8',
    );
    expect(sql).toContain('HAUL_PREPARATION_EXECUTION_LOCKED');
    expect(sql).toContain("v_execution_state IS DISTINCT FROM 'pending'");
    expect(sql).toContain("v_status = 'active'");
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
        finalQuantity: 3,
      },
    });
    expect(updated.product_title).toBe('Edited oats');
    expect(updated.retailer).toBe('Edited Market');
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
    expect(currentPlanInstructionLabel(item)).toContain('Current Market');
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
      acquired_quantity: 2,
      acquired_price_amount: 4,
    });
    expect(updated.prepared_product_title).toBe('Activation oats');
  });
});
