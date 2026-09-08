import type {
  GroceryHaulItem,
  GroceryHaulPreparationEstimate,
  GroceryHaulStoreEstimate,
} from '@/lib/plans/types';

function numeric(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function storeKey(item: GroceryHaulItem): string | null {
  if (!item.retailer && !item.store_location && !item.postal_code) return null;
  return JSON.stringify([
    item.retailer?.trim().toLocaleLowerCase() ?? '',
    item.store_location?.trim().toLocaleLowerCase() ?? '',
    item.postal_code?.trim().toLocaleUpperCase() ?? '',
  ]);
}

/**
 * Canonical Haul preparation estimate.
 *
 * Only persisted Haul state participates. List choices/quotes are deliberately
 * not inputs. price_amount is the persisted price per final purchase unit;
 * final_quantity zero excludes the line. Tax is always excluded.
 */
export function computeGroceryHaulPreparationEstimate(
  currency: string,
  items: readonly GroceryHaulItem[],
): GroceryHaulPreparationEstimate {
  let executionItemCount = 0;
  let excludedItemCount = 0;
  let pricedItemCount = 0;
  let unpricedItemCount = 0;
  let missingProductCount = 0;
  let missingStoreCount = 0;
  let manualSubtotal = 0;
  let sourcedSubtotal = 0;
  const stores = new Map<string, GroceryHaulStoreEstimate>();

  for (const item of items) {
    const quantity = numeric(item.final_quantity) ?? 0;
    if (quantity <= 0) {
      excludedItemCount += 1;
      continue;
    }

    executionItemCount += 1;
    if (!item.product_title?.trim()) missingProductCount += 1;
    const key = storeKey(item);
    if (!key) missingStoreCount += 1;

    const price = numeric(item.price_amount);
    const isPriced =
      price != null
      && price >= 0
      && item.price_source != null
      && item.price_currency === currency;
    if (!isPriced) {
      unpricedItemCount += 1;
      continue;
    }

    pricedItemCount += 1;
    const lineTotal = money(quantity * price);
    if (item.price_source === 'manual') {
      manualSubtotal = money(manualSubtotal + lineTotal);
    } else {
      sourcedSubtotal = money(sourcedSubtotal + lineTotal);
    }

    if (key) {
      const store = stores.get(key) ?? {
        store_key: key,
        retailer: item.retailer,
        store_location: item.store_location,
        postal_code: item.postal_code,
        estimated_subtotal: 0,
        priced_item_count: 0,
      };
      store.estimated_subtotal = money(store.estimated_subtotal + lineTotal);
      store.priced_item_count += 1;
      stores.set(key, store);
    }
  }

  const byStore = Array.from(stores.values()).sort((a, b) =>
    a.store_key.localeCompare(b.store_key),
  );

  return {
    currency,
    estimated_total: money(manualSubtotal + sourcedSubtotal),
    estimated_tax: null,
    tax_status: 'excluded',
    execution_item_count: executionItemCount,
    excluded_item_count: excludedItemCount,
    priced_item_count: pricedItemCount,
    unpriced_item_count: unpricedItemCount,
    missing_product_count: missingProductCount,
    missing_store_count: missingStoreCount,
    manual_subtotal: manualSubtotal,
    sourced_subtotal: sourcedSubtotal,
    by_store: byStore,
  };
}
