/**
 * Pure helpers for list-scoped price quotes (client-safe).
 */

import type { GroceryItem, GroceryListPriceObservation, GroceryListPurchasingChoice } from './types';
import { activePurchasingMatchKeyForItem } from './groceryListPurchasingChoiceDisplay';

function normalizePackageUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  const trimmed = unit.trim().toLowerCase();
  return trimmed || null;
}

/** Normalize retailer for scenario matching; preserve display casing on the row. */
export function normalizeGroceryRetailerKey(retailer: string | null | undefined): string | null {
  if (retailer == null) return null;
  const trimmed = retailer.trim().toLowerCase();
  return trimmed || null;
}

/**
 * A prior list quote is reusable when it matches the active purchasing
 * identity. Prefer exact match_key; also accept choice-id / food_object_id
 * alignment so quotes still feed Full Haul after benign identity churn.
 */
export function isListPriceCompatibleWithActiveChoice(options: {
  observation: Pick<
    GroceryListPriceObservation,
    'match_key' | 'package_unit' | 'purchasing_choice_id' | 'food_object_id'
  >;
  item: GroceryItem;
  choice?: GroceryListPurchasingChoice | null;
}): boolean {
  const activeKey = activePurchasingMatchKeyForItem(options.item, options.choice);
  const matchKeyOk = options.observation.match_key === activeKey;
  const choiceIdOk =
    Boolean(options.choice?.id) &&
    options.observation.purchasing_choice_id === options.choice?.id;
  const foodOk =
    Boolean(options.choice?.food_object_id) &&
    options.observation.food_object_id === options.choice?.food_object_id;
  const itemFoodOk =
    !options.choice &&
    Boolean(options.item.food_object_id) &&
    options.observation.food_object_id === options.item.food_object_id;

  if (!matchKeyOk && !choiceIdOk && !foodOk && !itemFoodOk) return false;

  const obsUnit = normalizePackageUnit(options.observation.package_unit);
  const choiceUnit = normalizePackageUnit(options.choice?.purchase_unit);
  if (obsUnit && choiceUnit && obsUnit !== choiceUnit) return false;
  return true;
}

export function resolveActiveListPriceForItem(options: {
  item: GroceryItem;
  choice?: GroceryListPurchasingChoice | null;
  /** Quote pool for this item (any match_key / retailer). */
  observationsForItem: GroceryListPriceObservation[];
  /** Explicit active observation id when set and still present in the pool. */
  activeObservationId?: string | null;
}): {
  observation: GroceryListPriceObservation | null;
  stale: GroceryListPriceObservation | null;
  /** True when an explicit active pointer existed but was incompatible. */
  active_stale: boolean;
} {
  const byKey = options.observationsForItem
    .filter((row) => row.grocery_item_id === options.item.id)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const pointed =
    options.activeObservationId
      ? byKey.find((row) => row.id === options.activeObservationId) ?? null
      : null;

  if (pointed) {
    if (
      isListPriceCompatibleWithActiveChoice({
        observation: pointed,
        item: options.item,
        choice: options.choice,
      })
    ) {
      return { observation: pointed, stale: null, active_stale: false };
    }
    // Orphaned / incompatible pointer — fall through to newest compatible.
    const newestCompatible =
      byKey.find((row) =>
        isListPriceCompatibleWithActiveChoice({
          observation: row,
          item: options.item,
          choice: options.choice,
        }),
      ) ?? null;
    if (newestCompatible) {
      return { observation: newestCompatible, stale: pointed, active_stale: true };
    }
    return { observation: null, stale: pointed, active_stale: true };
  }

  const activeKey = activePurchasingMatchKeyForItem(options.item, options.choice);
  const exact = byKey.find((row) => row.match_key === activeKey) ?? null;
  if (
    exact &&
    isListPriceCompatibleWithActiveChoice({
      observation: exact,
      item: options.item,
      choice: options.choice,
    })
  ) {
    return { observation: exact, stale: null, active_stale: false };
  }

  const soft =
    byKey.find((row) =>
      isListPriceCompatibleWithActiveChoice({
        observation: row,
        item: options.item,
        choice: options.choice,
      }),
    ) ?? null;
  if (soft) {
    return { observation: soft, stale: null, active_stale: false };
  }

  const stale = byKey[0] ?? null;
  return { observation: null, stale, active_stale: false };
}

/** Compatible quotes for an item (newest first) — the selectable pool. */
export function compatibleQuotePoolForItem(options: {
  item: GroceryItem;
  choice?: GroceryListPurchasingChoice | null;
  observationsForItem: GroceryListPriceObservation[];
}): GroceryListPriceObservation[] {
  return options.observationsForItem
    .filter((row) => row.grocery_item_id === options.item.id)
    .filter((row) =>
      isListPriceCompatibleWithActiveChoice({
        observation: row,
        item: options.item,
        choice: options.choice,
      }),
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function summarizeActiveRetailers(
  activeQuotes: Array<Pick<GroceryListPriceObservation, 'retailer'>>,
): { mixed: boolean; summary: string | null; keys: string[] } {
  const keys = Array.from(
    new Set(
      activeQuotes
        .map((q) => normalizeGroceryRetailerKey(q.retailer))
        .filter((k): k is string => Boolean(k)),
    ),
  ).sort();
  if (keys.length === 0) {
    return { mixed: false, summary: null, keys };
  }
  if (keys.length === 1) {
    const display = activeQuotes.find(
      (q) => normalizeGroceryRetailerKey(q.retailer) === keys[0],
    )?.retailer;
    return { mixed: false, summary: display?.trim() || keys[0], keys };
  }
  return { mixed: true, summary: 'Mixed retailers', keys };
}

/** Map a list price quote into the haul / GroceryPricePanel observation shape. */
export function listPriceToHaulObservation(
  listPrice: GroceryListPriceObservation,
): import('./groceryPricingTypes').GroceryPriceObservation {
  return {
    id: listPrice.id,
    person_id: listPrice.person_id,
    grocery_item_id: listPrice.grocery_item_id,
    grocery_list_id: listPrice.grocery_list_id,
    plan_id: null,
    date_range_start: '1970-01-01',
    date_range_end: '1970-01-01',
    match_key: listPrice.match_key,
    food_object_id: listPrice.food_object_id,
    source: listPrice.source,
    retailer: listPrice.retailer,
    postal_code: listPrice.postal_code,
    product_title: listPrice.product_title,
    brand_name: listPrice.brand_name,
    package_size: listPrice.package_size,
    package_unit: listPrice.package_unit,
    unit_price: listPrice.unit_price,
    currency: listPrice.currency,
    package_count: listPrice.package_count,
    line_total: listPrice.line_total,
    product_url: listPrice.product_url,
    image_url: listPrice.image_url,
    provider_result_id: listPrice.provider_result_id,
    search_event_id: listPrice.search_event_id,
    retrieved_at: listPrice.retrieved_at,
    match_confidence: listPrice.match_confidence,
    user_confirmed: listPrice.user_confirmed,
    supersedes_observation_id: listPrice.supersedes_observation_id,
    created_at: listPrice.created_at,
  };
}
