/**
 * Preview UI boundary QA — validates API contracts backing the grocery pricing UI.
 *
 * Runs against Preview Supabase with SerpAPI fixture overrides (zero live provider calls).
 * Covers UI-01 hydration, UI-02 unresolved manual entry, grounded search/confirm, and haul updates.
 */

import type { GroceryPriceSearchResult } from './groceryPricingTypes';
import { mapPriceObservationsToGroceryItems } from './groceryPricingObservations';
import { groceryItemMatchKey } from './groceryMatchKeys';
import type { GroceryItem } from './types';

export interface GroceryPricePreviewUiQaResult {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface GroceryPricePreviewUiQaDeps {
  searchGroceryItemPrices: (options: {
    personId: string;
    groceryItemId: string;
    retailer: string;
    postalCode: string;
  }) => Promise<GroceryPriceSearchResult>;
  confirmSourcedGroceryPrice: (options: {
    personId: string;
    input: {
      grocery_item_id: string;
      search_event_id: string;
      provider_result_id: string;
    };
  }) => Promise<{ id: string; source: string; match_key: string; line_total: number }>;
  saveManualGroceryPrice: (options: {
    personId: string;
    input: {
      grocery_item_id: string;
      unit_price: number;
      product_title?: string | null;
      retailer?: string | null;
      postal_code?: string | null;
    };
  }) => Promise<{ id: string; source: string; match_key: string; line_total: number }>;
  getGroceryHaulSummaryForList: (options: {
    personId: string;
    groceryListId: string;
  }) => Promise<{
    summary: { priced_item_count: number; estimated_total: number; manual_subtotal: number };
    observations_by_match_key: Record<string, { source: string; line_total: number }>;
  }>;
  loadGroceryItemsForList: (options: {
    personId: string;
    groceryListId: string;
  }) => Promise<GroceryItem[]>;
}

export function validateProviderErrorSearchResult(result: GroceryPriceSearchResult): void {
  if (result.outcome !== 'provider_error') {
    throw new Error(`expected provider_error outcome, got ${result.outcome}`);
  }
  if (result.provider_error == null || !result.provider_error.message) {
    throw new Error('provider_error payload missing message');
  }
}

export async function runGroceryPricePreviewUiQa(options: {
  personId: string;
  groundedItemId: string;
  unresolvedItemId: string;
  listId: string;
  deps: GroceryPricePreviewUiQaDeps;
}): Promise<GroceryPricePreviewUiQaResult[]> {
  const results: GroceryPricePreviewUiQaResult[] = [];
  const { personId, groundedItemId, unresolvedItemId, listId, deps } = options;

  function pass(name: string, detail: string): void {
    results.push({ name, status: 'pass', detail });
  }

  function fail(name: string, detail: string): never {
    results.push({ name, status: 'fail', detail });
    throw new Error(`${name}: ${detail}`);
  }

  const items = await deps.loadGroceryItemsForList({ personId, groceryListId: listId });
  const groundedItem = items.find((item) => item.id === groundedItemId);
  const unresolvedItem = items.find((item) => item.id === unresolvedItemId);
  if (!groundedItem?.food_object_id) {
    fail('fixture_grounded_item', `grounded item ${groundedItemId} missing or unresolved`);
  }
  if (!unresolvedItem || unresolvedItem.food_object_id) {
    fail('fixture_unresolved_item', `unresolved item ${unresolvedItemId} missing or grounded`);
  }

  const searchPostal = `941${Math.floor(Math.random() * 90 + 10)}`;
  const search = await deps.searchGroceryItemPrices({
    personId,
    groceryItemId: groundedItemId,
    retailer: 'Whole Foods Market',
    postalCode: searchPostal,
  });
  if (search.outcome !== 'results' || search.offers.length === 0) {
    fail('grounded_search_confirm', `expected results, got ${search.outcome}`);
  }
  const providerResultId = search.offers[0]?.provider_result_id;
  if (!providerResultId) {
    fail('grounded_search_confirm', 'missing provider_result_id');
  }

  const confirmed = await deps.confirmSourcedGroceryPrice({
    personId,
    input: {
      grocery_item_id: groundedItemId,
      search_event_id: search.search_event_id,
      provider_result_id: providerResultId,
    },
  });
  if (confirmed.source !== 'serpapi') {
    fail('grounded_search_confirm', `expected serpapi observation, got ${confirmed.source}`);
  }
  pass(
    'grounded_search_confirm',
    `observation=${confirmed.id} line_total=${confirmed.line_total}`,
  );

  const unresolvedManual = await deps.saveManualGroceryPrice({
    personId,
    input: {
      grocery_item_id: unresolvedItemId,
      unit_price: 6.75,
      product_title: unresolvedItem!.name,
      retailer: 'Target',
      postal_code: '94110',
    },
  });
  if (unresolvedManual.source !== 'manual') {
    fail('unresolved_manual_entry', `expected manual observation, got ${unresolvedManual.source}`);
  }
  pass(
    'unresolved_manual_entry',
    `observation=${unresolvedManual.id} match_key=${unresolvedManual.match_key}`,
  );

  const groundedManual = await deps.saveManualGroceryPrice({
    personId,
    input: {
      grocery_item_id: groundedItemId,
      unit_price: 4.25,
      product_title: groundedItem!.name,
      retailer: 'Target',
      postal_code: '94110',
    },
  });
  if (groundedManual.source !== 'manual') {
    fail('grounded_manual_entry', `expected manual observation, got ${groundedManual.source}`);
  }
  pass('grounded_manual_entry', `observation=${groundedManual.id} line_total=${groundedManual.line_total}`);

  const haulBeforeRefresh = await deps.getGroceryHaulSummaryForList({ personId, groceryListId: listId });
  if (haulBeforeRefresh.summary.priced_item_count < 2 || haulBeforeRefresh.summary.estimated_total <= 0) {
    fail(
      'haul_summary_updates',
      `expected priced haul, got count=${haulBeforeRefresh.summary.priced_item_count} total=${haulBeforeRefresh.summary.estimated_total}`,
    );
  }
  pass(
    'haul_summary_updates',
    `priced=${haulBeforeRefresh.summary.priced_item_count} total=${haulBeforeRefresh.summary.estimated_total} manual=${haulBeforeRefresh.summary.manual_subtotal}`,
  );

  const haulAfterRefresh = await deps.getGroceryHaulSummaryForList({ personId, groceryListId: listId });
  const mapped = mapPriceObservationsToGroceryItems(items, haulAfterRefresh.observations_by_match_key as never);
  if (!mapped[groundedItemId]) {
    fail('refresh_hydration_grounded', 'grounded row missing hydrated observation');
  }
  if (!mapped[unresolvedItemId]) {
    fail('refresh_hydration_unresolved', 'unresolved row missing hydrated observation');
  }
  if (mapped[groundedItemId]?.source !== 'manual') {
    fail('manual_precedence_grounded', `expected manual on grounded row, got ${mapped[groundedItemId]?.source}`);
  }
  if (mapped[unresolvedItemId]?.source !== 'manual') {
    fail('manual_precedence_unresolved', `expected manual on unresolved row, got ${mapped[unresolvedItemId]?.source}`);
  }
  if (Object.keys(haulAfterRefresh.observations_by_match_key).length === 0) {
    fail('refresh_hydration_bundle', 'observations_by_match_key empty');
  }
  const expectedGroundedKey = groceryItemMatchKey(groundedItem!);
  if (!haulAfterRefresh.observations_by_match_key[expectedGroundedKey]) {
    fail('refresh_hydration_match_key', `missing observation for ${expectedGroundedKey}`);
  }
  pass(
    'refresh_hydration',
    `grounded=${mapped[groundedItemId]?.line_total} unresolved=${mapped[unresolvedItemId]?.line_total}`,
  );

  if (search.provider_error != null) {
    fail('provider_error_shape', 'results search must not include provider_error payload');
  }
  pass(
    'provider_error_shape',
    'results contract valid (provider_error=null, offers>0); HTTP 502 provider_error covered by price-search API tests',
  );

  if (search.quota.remaining < 0) {
    fail('quota_state', 'quota remaining negative');
  }
  pass('quota_state', `remaining=${search.quota.remaining} upgrade_required=${search.quota.upgrade_required}`);

  return results;
}
