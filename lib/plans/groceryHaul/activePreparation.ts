import type {
  GroceryHaul,
  GroceryHaulExecutionItemState,
  GroceryHaulItem,
} from '@/lib/plans/types';

export function acquisitionPatchFromHaulItem(
  item: GroceryHaulItem,
  defaultCurrency: string,
): Record<string, string | number | null> {
  return {
    acquired_quantity: item.final_quantity,
    acquired_food_object_id: item.selected_food_object_id,
    acquired_product_title: item.product_title,
    acquired_brand_name: item.brand_name,
    acquired_purchase_unit: item.purchase_unit,
    acquired_package_size: item.package_size,
    acquired_package_count: item.package_count,
    acquired_retailer: item.retailer,
    acquired_store_location: item.store_location,
    acquired_postal_code: item.postal_code,
    acquired_price_amount: item.price_amount,
    acquired_price_currency: item.price_amount == null ? null : (item.price_currency ?? defaultCurrency),
  };
}

export function assertHaulItemPreparationAllowed(
  haul: GroceryHaul,
  executionState: GroceryHaulExecutionItemState | null,
): void {
  if (haul.status === 'closed' || haul.status === 'cancelled') {
    throw new Error('HAUL_PREPARATION_HISTORICAL');
  }
  if (haul.status === 'planned') return;
  if (haul.status === 'active') {
    if (executionState === 'pending') return;
    throw new Error('HAUL_PREPARATION_EXECUTION_LOCKED');
  }
  throw new Error('HAUL_PREPARATION_NOT_DRAFT');
}
