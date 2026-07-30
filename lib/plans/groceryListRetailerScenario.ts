/**
 * Ephemeral retailer-scenario preview for durable Full Haul lists (PR3.2b).
 * Client-safe. Never mutates active quotes — Apply is a separate write path.
 */

import type { GroceryItem, GroceryListPriceObservation, GroceryListPurchasingChoice } from './types';
import {
  compatibleQuotePoolForItem,
  isListPriceCompatibleWithActiveChoice,
  normalizeGroceryRetailerKey,
} from './groceryListPriceObservationDisplay';
import { GROCERY_PRICE_CACHE_TTL_DAYS } from './groceryPricingConfig';

export type RetailerScenarioItemState = 'matched' | 'missing' | 'stale';

export type RetailerScenarioItemRow = {
  item_id: string;
  state: RetailerScenarioItemState;
  quote: GroceryListPriceObservation | null;
  /** Display retailer casing from the matched quote, if any. */
  retailer_display: string | null;
};

export type RetailerScenarioPreview = {
  retailer_key: string;
  retailer_display: string;
  rows: RetailerScenarioItemRow[];
  matched_observation_ids_by_item_id: Record<string, string>;
  matched_count: number;
  missing_count: number;
  stale_count: number;
};

function isQuoteStale(retrievedAt: string, now: Date): boolean {
  const retrieved = new Date(retrievedAt);
  const ageMs = now.getTime() - retrieved.getTime();
  return ageMs > GROCERY_PRICE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/** Distinct retailers present in compatible quote pools (for the selector). */
export function listRetailersFromQuotePools(options: {
  items: GroceryItem[];
  choicesByItemId?: Record<string, GroceryListPurchasingChoice | null | undefined>;
  poolByItemId: Record<string, GroceryListPriceObservation[]>;
}): Array<{ key: string; display: string; quote_count: number }> {
  const counts = new Map<string, { display: string; quote_count: number }>();
  for (const item of options.items) {
    if (item.status === 'skipped') continue;
    const pool = compatibleQuotePoolForItem({
      item,
      choice: options.choicesByItemId?.[item.id] ?? null,
      observationsForItem: options.poolByItemId[item.id] ?? [],
    });
    for (const quote of pool) {
      const key = normalizeGroceryRetailerKey(quote.retailer);
      if (!key) continue;
      const existing = counts.get(key);
      if (existing) {
        existing.quote_count += 1;
      } else {
        counts.set(key, {
          display: quote.retailer?.trim() || key,
          quote_count: 1,
        });
      }
    }
  }
  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, display: value.display, quote_count: value.quote_count }))
    .sort((a, b) => a.display.localeCompare(b.display));
}

/**
 * Best compatible quote for a retailer on one item (newest first among matches).
 * Never returns a quote from another retailer.
 */
export function pickBestQuoteForRetailer(options: {
  item: GroceryItem;
  choice?: GroceryListPurchasingChoice | null;
  observationsForItem: GroceryListPriceObservation[];
  retailerKey: string;
  now?: Date;
}): RetailerScenarioItemRow {
  const now = options.now ?? new Date();
  const key = normalizeGroceryRetailerKey(options.retailerKey);
  if (!key) {
    return {
      item_id: options.item.id,
      state: 'missing',
      quote: null,
      retailer_display: null,
    };
  }

  const compatible = compatibleQuotePoolForItem({
    item: options.item,
    choice: options.choice,
    observationsForItem: options.observationsForItem,
  }).filter((quote) => normalizeGroceryRetailerKey(quote.retailer) === key);

  if (compatible.length === 0) {
    // Incompatible quote at this retailer still counts as stale for disclosure.
    const anyAtRetailer = options.observationsForItem
      .filter((row) => row.grocery_item_id === options.item.id)
      .filter((row) => normalizeGroceryRetailerKey(row.retailer) === key)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const staleCandidate = anyAtRetailer[0] ?? null;
    if (
      staleCandidate &&
      !isListPriceCompatibleWithActiveChoice({
        observation: staleCandidate,
        item: options.item,
        choice: options.choice,
      })
    ) {
      return {
        item_id: options.item.id,
        state: 'stale',
        quote: staleCandidate,
        retailer_display: staleCandidate.retailer,
      };
    }
    return {
      item_id: options.item.id,
      state: 'missing',
      quote: null,
      retailer_display: null,
    };
  }

  const quote = compatible[0]!;
  if (isQuoteStale(quote.retrieved_at, now)) {
    return {
      item_id: options.item.id,
      state: 'stale',
      quote,
      retailer_display: quote.retailer,
    };
  }
  return {
    item_id: options.item.id,
    state: 'matched',
    quote,
    retailer_display: quote.retailer,
  };
}

export function buildRetailerScenarioPreview(options: {
  items: GroceryItem[];
  choicesByItemId?: Record<string, GroceryListPurchasingChoice | null | undefined>;
  poolByItemId: Record<string, GroceryListPriceObservation[]>;
  retailerKey: string;
  now?: Date;
}): RetailerScenarioPreview {
  const rows: RetailerScenarioItemRow[] = [];
  const matched_observation_ids_by_item_id: Record<string, string> = {};
  let matched_count = 0;
  let missing_count = 0;
  let stale_count = 0;
  let retailer_display = options.retailerKey;

  for (const item of options.items) {
    if (item.status === 'skipped') continue;
    const row = pickBestQuoteForRetailer({
      item,
      choice: options.choicesByItemId?.[item.id] ?? null,
      observationsForItem: options.poolByItemId[item.id] ?? [],
      retailerKey: options.retailerKey,
      now: options.now,
    });
    rows.push(row);
    if (row.state === 'matched' && row.quote) {
      matched_count += 1;
      matched_observation_ids_by_item_id[item.id] = row.quote.id;
      if (row.retailer_display) retailer_display = row.retailer_display;
    } else if (row.state === 'stale') {
      stale_count += 1;
      if (row.retailer_display) retailer_display = row.retailer_display;
    } else {
      missing_count += 1;
    }
  }

  return {
    retailer_key: normalizeGroceryRetailerKey(options.retailerKey) ?? options.retailerKey,
    retailer_display,
    rows,
    matched_observation_ids_by_item_id,
    matched_count,
    missing_count,
    stale_count,
  };
}

/** Observations map for computeFullHaulEstimate during preview (matched only). */
export function scenarioMatchedObservationsByItemId(
  preview: RetailerScenarioPreview,
): Map<string, GroceryListPriceObservation> {
  const map = new Map<string, GroceryListPriceObservation>();
  for (const row of preview.rows) {
    if (row.state === 'matched' && row.quote) {
      map.set(row.item_id, row.quote);
    }
  }
  return map;
}
