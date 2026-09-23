import type {
  GroceryHaulExecutionItemState,
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
 * Control-rail store assignment identity (not canonical estimate.by_store grouping).
 * Postal/search context alone is never a store. Retailer-level assignments dedupe across ZIP.
 */
function storeAssignmentKeyForCount(item: GroceryHaulItem): string | null {
  const retailer = item.retailer?.trim().toLocaleLowerCase() ?? '';
  const storeLocation = item.store_location?.trim().toLocaleLowerCase() ?? '';
  if (!retailer && !storeLocation) return null;
  if (storeLocation) {
    return JSON.stringify([retailer, storeLocation]);
  }
  return JSON.stringify(['retailer', retailer]);
}

/** Distinct store assignments among execution-included Haul items (final_quantity > 0). */
export function countDistinctAssignedStores(items: readonly GroceryHaulItem[]): number {
  const keys = new Set<string>();
  for (const item of items) {
    const quantity = numeric(item.final_quantity) ?? 0;
    if (quantity <= 0) continue;
    const key = storeAssignmentKeyForCount(item);
    if (key) keys.add(key);
  }
  return keys.size;
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

type AcquiredSpendLine = {
  state: GroceryHaulExecutionItemState;
  acquired_price_amount: number | null;
  acquired_quantity: number | null;
};

/**
 * Sum of persisted acquired price × quantity for in-basket rows only.
 * Pending/skipped rows may still carry seeded prepared values at activation.
 */
export function computeFactualAcquiredSubtotal(
  items: readonly AcquiredSpendLine[],
): number | null {
  const priced = items.filter(
    (item) => item.state === 'in_basket'
      && item.acquired_price_amount != null
      && item.acquired_quantity != null,
  );
  if (priced.length === 0) return null;
  return money(priced.reduce(
    (sum, item) => sum + (item.acquired_price_amount as number) * (item.acquired_quantity as number),
    0,
  ));
}
