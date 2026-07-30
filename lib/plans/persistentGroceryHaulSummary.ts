/**
 * Persistent (planless) grocery list Full Haul assembly.
 *
 * Price precedence (PR3.2a):
 *   1) Explicit active list quote when still compatible
 *   2) Newest compatible list-scoped quote
 *   3) Provenance plan+date grocery_price_observations
 *   4) Unpriced
 */

import type { GroceryItem, GroceryListPurchasingChoice, GroceryListPriceObservation } from './types';
import type { GroceryPriceObservation, GroceryHaulSummary, FullHaulEstimate } from './groceryPricingTypes';
import { groceryItemMatchKey } from './groceryMatchKeys';
import { listCurrentObservationsForScope } from './groceryPriceStore';
import { computeFullHaulEstimate } from './fullHaulEstimate';
import { groceryHaulSummaryFromFullHaul } from './groceryHaulSummary';
import { observationsByMatchKeyFromList } from './groceryPricingObservations';
import {
  extractPlanScopesFromPersistentItems,
  itemProvenanceScope,
  persistentListScopeKey,
} from './persistentGroceryHaulScopes';
import { activePurchasingMatchKeyForItem } from './groceryListPurchasingChoiceDisplay';
import { listPurchasingChoicesForList } from './groceryListPurchasingChoiceStore';
import { listAllListPriceObservations } from './groceryListPriceObservationStore';
import { listActiveQuotesForList } from './groceryListActiveQuoteStore';
import {
  resolveActiveListPriceForItem,
  listPriceToHaulObservation,
  summarizeActiveRetailers,
  compatibleQuotePoolForItem,
} from './groceryListPriceObservationDisplay';

export {
  extractPlanScopesFromPersistentItems,
  itemProvenanceScope,
  persistentListScopeKey,
} from './persistentGroceryHaulScopes';

export { listPriceToHaulObservation } from './groceryListPriceObservationDisplay';

export async function resolveObservationsByItemIdForPersistentList(
  personId: string,
  items: GroceryItem[],
  choicesByItemId?: Record<string, GroceryListPurchasingChoice>,
  listId?: string,
): Promise<{
  observationsByItemId: Map<string, GroceryPriceObservation>;
  observations: GroceryPriceObservation[];
  listPricesByItemId: Record<string, GroceryListPriceObservation>;
  staleListPricesByItemId: Record<string, GroceryListPriceObservation>;
  poolByItemId: Record<string, GroceryListPriceObservation[]>;
  activeObservationIdByItemId: Record<string, string>;
  mixedRetailers: boolean;
  retailerSummary: string | null;
}> {
  const scopes = extractPlanScopesFromPersistentItems(items);
  const obsByScope = new Map<string, Map<string, GroceryPriceObservation>>();
  const allObservations: GroceryPriceObservation[] = [];

  for (const scope of scopes) {
    const rows = await listCurrentObservationsForScope(personId, scope);
    const byMatch = new Map(rows.map((row) => [row.match_key, row]));
    obsByScope.set(persistentListScopeKey(scope), byMatch);
    allObservations.push(...rows);
  }

  let listObservations: GroceryListPriceObservation[] = [];
  let activeByItem: Record<string, string> = {};
  if (listId) {
    try {
      listObservations = await listAllListPriceObservations(personId, listId);
    } catch {
      listObservations = [];
    }
    try {
      const actives = await listActiveQuotesForList(personId, listId);
      activeByItem = Object.fromEntries(
        actives.map((row) => [row.grocery_item_id, row.observation_id]),
      );
    } catch {
      activeByItem = {};
    }
  }

  const listByItem = new Map<string, GroceryListPriceObservation[]>();
  for (const obs of listObservations) {
    const list = listByItem.get(obs.grocery_item_id) ?? [];
    list.push(obs);
    listByItem.set(obs.grocery_item_id, list);
  }

  const observationsByItemId = new Map<string, GroceryPriceObservation>();
  const listPricesByItemId: Record<string, GroceryListPriceObservation> = {};
  const staleListPricesByItemId: Record<string, GroceryListPriceObservation> = {};
  const poolByItemId: Record<string, GroceryListPriceObservation[]> = {};
  const activeObservationIdByItemId: Record<string, string> = {};

  for (const item of items) {
    const choice = choicesByItemId?.[item.id] ?? null;
    const forItem = listByItem.get(item.id) ?? [];
    poolByItemId[item.id] = compatibleQuotePoolForItem({
      item,
      choice,
      observationsForItem: forItem,
    });

    const listResolved = resolveActiveListPriceForItem({
      item,
      choice,
      observationsForItem: forItem,
      activeObservationId: activeByItem[item.id] ?? null,
    });
    if (listResolved.observation) {
      listPricesByItemId[item.id] = listResolved.observation;
      activeObservationIdByItemId[item.id] = listResolved.observation.id;
      observationsByItemId.set(item.id, listPriceToHaulObservation(listResolved.observation));
      continue;
    }
    if (listResolved.stale) {
      staleListPricesByItemId[item.id] = listResolved.stale;
    }

    const scope = itemProvenanceScope(item);
    if (!scope) continue;
    const scopeMap = obsByScope.get(persistentListScopeKey(scope));
    if (!scopeMap) continue;
    const preferredKey = activePurchasingMatchKeyForItem(item, choice);
    const observation =
      scopeMap.get(preferredKey) ?? scopeMap.get(groceryItemMatchKey(item));
    if (observation) {
      observationsByItemId.set(item.id, observation);
    }
  }

  const retailerInfo = summarizeActiveRetailers(Object.values(listPricesByItemId));

  return {
    observationsByItemId,
    observations: allObservations,
    listPricesByItemId,
    staleListPricesByItemId,
    poolByItemId,
    activeObservationIdByItemId,
    mixedRetailers: retailerInfo.mixed,
    retailerSummary: retailerInfo.summary,
  };
}

export async function buildPersistentListHaulSummary(options: {
  personId: string;
  groceryListId: string;
  items: GroceryItem[];
  planLabels?: Record<string, string>;
}): Promise<{
  summary: GroceryHaulSummary;
  full_haul: FullHaulEstimate;
  observations_by_match_key: Record<string, GroceryPriceObservation>;
  observations_by_item_id: Record<string, GroceryPriceObservation>;
  list_prices_by_item_id: Record<string, GroceryListPriceObservation>;
  stale_list_prices_by_item_id: Record<string, GroceryListPriceObservation>;
  quote_pool_by_item_id: Record<string, GroceryListPriceObservation[]>;
  active_observation_id_by_item_id: Record<string, string>;
}> {
  let choicesByItemId: Record<string, GroceryListPurchasingChoice> = {};
  try {
    const choices = await listPurchasingChoicesForList(
      options.personId,
      options.groceryListId,
    );
    choicesByItemId = Object.fromEntries(
      choices.map((choice) => [choice.grocery_item_id, choice]),
    );
  } catch {
    choicesByItemId = {};
  }

  const {
    observationsByItemId,
    observations,
    listPricesByItemId,
    staleListPricesByItemId,
    poolByItemId,
    activeObservationIdByItemId,
    mixedRetailers,
    retailerSummary,
  } = await resolveObservationsByItemIdForPersistentList(
    options.personId,
    options.items,
    choicesByItemId,
    options.groceryListId,
  );

  const fullHaulBase = computeFullHaulEstimate({
    groceryListId: options.groceryListId,
    items: options.items,
    observationsByItemId,
    listPlanId: null,
    planLabels: options.planLabels,
    tax: { status: 'excluded' },
  });

  const fullHaul: FullHaulEstimate = {
    ...fullHaulBase,
    mixed_retailers: mixedRetailers,
    retailer_summary: retailerSummary,
  };

  return {
    summary: groceryHaulSummaryFromFullHaul(fullHaul),
    full_haul: fullHaul,
    observations_by_match_key: observationsByMatchKeyFromList(observations),
    observations_by_item_id: Object.fromEntries(observationsByItemId.entries()),
    list_prices_by_item_id: listPricesByItemId,
    stale_list_prices_by_item_id: staleListPricesByItemId,
    quote_pool_by_item_id: poolByItemId,
    active_observation_id_by_item_id: activeObservationIdByItemId,
  };
}
