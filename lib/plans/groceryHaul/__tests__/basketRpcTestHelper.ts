import type { Row } from '@/lib/plans/__tests__/testSupabaseFake';
import {
  acquisitionPatchFromHaulItem,
  mergeAcquisitionOverlay,
  shouldPreservePendingAcquisitionOutcome,
} from '../activePreparation';
import type { GroceryHaulAcquisitionPatch } from '@/lib/plans/types';

function overlayJsonToPatch(
  overlay: Record<string, string | number | null>,
): GroceryHaulAcquisitionPatch {
  const patch: GroceryHaulAcquisitionPatch = {};
  const map: Array<[string, keyof GroceryHaulAcquisitionPatch]> = [
    ['acquired_quantity', 'quantity'],
    ['acquired_food_object_id', 'food_object_id'],
    ['acquired_product_title', 'product_title'],
    ['acquired_brand_name', 'brand_name'],
    ['acquired_purchase_unit', 'purchase_unit'],
    ['acquired_package_size', 'package_size'],
    ['acquired_package_unit', 'package_unit'],
    ['acquired_package_count', 'package_count'],
    ['acquired_retailer', 'retailer'],
    ['acquired_store_location', 'store_location'],
    ['acquired_postal_code', 'postal_code'],
    ['acquired_price_amount', 'price_amount'],
    ['acquired_price_currency', 'price_currency'],
  ];
  for (const [column, key] of map) {
    if (overlay[column] !== undefined) patch[key] = overlay[column] as never;
  }
  return patch;
}

function haulItemRowToPatchItem(row: Row) {
  return {
    final_quantity: Number(row.final_quantity),
    selected_food_object_id: row.selected_food_object_id ? String(row.selected_food_object_id) : null,
    product_title: row.product_title ? String(row.product_title) : null,
    brand_name: row.brand_name ? String(row.brand_name) : null,
    purchase_unit: row.purchase_unit ? String(row.purchase_unit) : null,
    package_size: row.package_size == null ? null : Number(row.package_size),
    package_unit: row.package_unit ? String(row.package_unit) : null,
    package_count: row.package_count == null ? null : Number(row.package_count),
    retailer: row.retailer ? String(row.retailer) : null,
    store_location: row.store_location ? String(row.store_location) : null,
    postal_code: row.postal_code ? String(row.postal_code) : null,
    price_amount: row.price_amount == null ? null : Number(row.price_amount),
    price_currency: row.price_currency ? String(row.price_currency) : null,
  };
}

export function simulateMarkGroceryHaulExecutionInBasket(
  tables: Record<string, Row[]>,
  params: {
    p_execution_item_id: string;
    p_acquisition_overlay?: Record<string, string | number | null>;
  },
  currency = 'USD',
): Row {
  const executionRows = tables.grocery_haul_execution_items ?? [];
  const execution = executionRows.find((row) => row.id === params.p_execution_item_id);
  if (!execution) throw new Error('HAUL_EXECUTION_NOT_FOUND');
  if (execution.state !== 'pending') throw new Error('HAUL_EXECUTION_INVALID_TRANSITION');
  const item = (tables.grocery_haul_items ?? []).find((row) => row.id === execution.haul_item_id);
  if (!item) throw new Error('HAUL_EXECUTION_NOT_FOUND');
  if (Number(item.final_quantity) <= 0) throw new Error('HAUL_EXECUTION_NOT_EXECUTABLE');

  const overlay = params.p_acquisition_overlay ?? {};
  const baseline = acquisitionPatchFromHaulItem(haulItemRowToPatchItem(item) as never, currency);
  const preserveSubstitute = Object.keys(overlay).length === 0
    && shouldPreservePendingAcquisitionOutcome({
      acquisitionUpdatedAt: execution.acquisition_updated_at == null
        ? null
        : String(execution.acquisition_updated_at),
      preparationUpdatedAt: item.updated_at == null ? null : String(item.updated_at),
    });

  const next = { ...execution, state: 'in_basket' };
  if (!preserveSubstitute) {
    const merged = mergeAcquisitionOverlay(
      baseline,
      overlayJsonToPatch(overlay),
      currency,
    );
    Object.assign(next, merged);
  }
  const index = executionRows.findIndex((row) => row.id === params.p_execution_item_id);
  executionRows[index] = next;
  tables.grocery_haul_execution_items = executionRows;
  return next;
}
