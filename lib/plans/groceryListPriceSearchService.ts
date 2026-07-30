/**
 * List-scoped Find Price (SerpAPI search + confirm) for durable grocery lists.
 *
 * Reuses Stage-1 search/quota/cache stack. Search events use plan_id=null and
 * sentinel dates so they never collide with plan+date scopes. Confirmed offers
 * write grocery_list_price_observations only — never Stage-1 observations.
 */

import type {
  ConfirmSourcedGroceryPriceInput,
  GroceryPriceConfirmationResult,
  GroceryPriceObservation,
  GroceryPriceSearchResult,
} from './groceryPricingTypes';
import type { GroceryItem, GroceryListPurchasingChoice } from './types';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { activePurchasingMatchKeyForItem } from './groceryListPurchasingChoiceDisplay';
import { resolveListShoppingDisplayName } from './groceryListPurchasingChoiceDisplay';
import { getPurchasingChoiceForItem } from './groceryListPurchasingChoiceStore';
import { appendListPriceObservation } from './groceryListPriceObservationStore';
import { listPriceToHaulObservation } from './groceryListPriceObservationDisplay';
import {
  GROCERY_PRICE_CACHE_TTL_DAYS,
  GROCERY_PRICE_SEARCH_EVENT_MAX_AGE_MS,
} from './groceryPricingConfig';
import {
  GroceryPriceValidationError,
  assertSafeOutboundUrl,
  normalizePackageCount,
  normalizePostalCode,
  normalizeRetailer,
} from './groceryPricingValidation';
import { addDaysIso, buildGroceryPriceCacheKey } from './groceryPriceCache';
import {
  buildGroceryPriceSearchQuota,
} from './groceryPriceQuota';
import { finalizeQuotaClaim, reserveGroceryPriceSearchQuota } from './groceryPriceQuotaReservation';
import { rankGroceryPriceCandidates, toSearchOffer } from './groceryPriceRanking';
import type { GroceryPriceSearchContext } from './groceryPriceProviderTypes';
import { GroceryPriceProviderError } from './groceryPriceProviderTypes';
import {
  createLimitedQueryAdapter,
  searchWithQueryFallback,
  serpApiGroceryPriceProvider,
} from './groceryPriceSerpApiProvider';
import {
  buildCandidateSnapshot,
  getGroceryPriceSearchEvent,
  insertGroceryPriceSearchEvent,
  upsertGroceryPriceCache,
  getGroceryPriceCache,
} from './groceryPriceStore';
import { formatCanonicalFoodShoppingLabel } from './groceryShoppingDisplay';
import { capConfirmableOffers } from './groceryPricingOfferDisplay';
import { GroceryListPriceValidationError } from './groceryListPriceObservationService';

/** Sentinel dates for durable-list search events (plan_id null). */
export const LIST_PRICE_SEARCH_SENTINEL_DATE = '1970-01-01';

async function loadDurableItemAndChoice(
  personId: string,
  listId: string,
  itemId: string,
): Promise<{ item: GroceryItem; choice: GroceryListPurchasingChoice | null }> {
  const { data: list, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('id, person_id, plan_id')
    .eq('id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (listErr || !list) {
    throw new GroceryListPriceValidationError('Grocery list not found.');
  }
  if (list.plan_id) {
    throw new GroceryListPriceValidationError(
      'Use plan grocery Find Price for plan-scoped lists.',
    );
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('grocery_list_id', listId)
    .eq('person_id', personId)
    .maybeSingle();
  if (itemErr || !item) {
    throw new GroceryListPriceValidationError('Grocery item not found.');
  }

  let choice: GroceryListPurchasingChoice | null = null;
  try {
    choice = await getPurchasingChoiceForItem(personId, listId, itemId);
    if (choice?.status === 'unresolved') choice = null;
  } catch {
    choice = null;
  }

  return { item: item as unknown as GroceryItem, choice };
}

async function loadFoodObjectDetails(foodObjectId: string | null) {
  if (!foodObjectId) {
    return {
      canonical_name: null,
      brand_name: null,
      upc: null,
      image_url: null,
    };
  }
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select('canonical_name, brand_name, upc, image_url')
    .eq('id', foodObjectId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load food object: ${error.message}`);
  }
  return {
    canonical_name: (data?.canonical_name as string | null | undefined) ?? null,
    brand_name: (data?.brand_name as string | null | undefined) ?? null,
    upc: (data?.upc as string | null | undefined) ?? null,
    image_url: (data?.image_url as string | null | undefined) ?? null,
  };
}

async function buildListSearchContext(options: {
  item: GroceryItem;
  choice: GroceryListPurchasingChoice | null;
  retailer: string;
  postalCode: string;
}): Promise<{ context: GroceryPriceSearchContext; matchKey: string; foodObjectId: string | null }> {
  const matchKey = activePurchasingMatchKeyForItem(options.item, options.choice);
  const foodObjectId =
    options.choice?.food_object_id ?? options.item.food_object_id ?? null;
  const food = await loadFoodObjectDetails(foodObjectId);
  const resolvedProductLabel = food.canonical_name
    ? formatCanonicalFoodShoppingLabel({
        canonical_name: food.canonical_name,
        brand_name: food.brand_name,
      })
    : null;
  const shoppingName = resolveListShoppingDisplayName({
    item: options.item,
    choice: options.choice,
  });

  return {
    matchKey,
    foodObjectId,
    context: {
      match_key: matchKey,
      food_object_id: foodObjectId,
      canonical_name: food.canonical_name,
      brand_name: food.brand_name,
      upc: food.upc,
      image_url: food.image_url,
      required_ingredient_name: shoppingName || options.item.name,
      required_quantity: options.item.quantity,
      required_unit: options.item.unit,
      preferred_product: options.choice?.preferred_product ?? resolvedProductLabel,
      purchase_quantity: options.choice?.purchase_quantity ?? null,
      purchase_unit: options.choice?.purchase_unit ?? null,
      retailer: options.retailer,
      postal_code: options.postalCode,
    },
  };
}

function buildCandidateSnapshotFromOffers(
  offers: GroceryPriceSearchResult['offers'],
): Record<string, unknown> {
  return {
    count: offers.length,
    offers: offers.slice(0, 12),
  };
}

function searchEventMatchesListItem(
  event: {
    grocery_item_id: string | null;
    grocery_list_id: string | null;
    plan_id: string | null;
    date_range_start: string;
    date_range_end: string;
    match_key: string;
  },
  options: { listId: string; itemId: string; matchKey: string },
): boolean {
  if (event.plan_id != null) return false;
  if (event.date_range_start !== LIST_PRICE_SEARCH_SENTINEL_DATE) return false;
  if (event.date_range_end !== LIST_PRICE_SEARCH_SENTINEL_DATE) return false;
  if (event.match_key !== options.matchKey) return false;
  if (event.grocery_list_id && event.grocery_list_id !== options.listId) return false;
  if (event.grocery_item_id && event.grocery_item_id !== options.itemId) return false;
  return true;
}

export async function searchListGroceryItemPrices(options: {
  personId: string;
  listId: string;
  itemId: string;
  retailer: string;
  postalCode: string;
  maxProviderQueries?: number;
}): Promise<GroceryPriceSearchResult> {
  const retailer = normalizeRetailer(options.retailer);
  const postalCode = normalizePostalCode(options.postalCode);
  const { item, choice } = await loadDurableItemAndChoice(
    options.personId,
    options.listId,
    options.itemId,
  );
  const { context, matchKey, foodObjectId } = await buildListSearchContext({
    item,
    choice,
    retailer,
    postalCode,
  });
  const cacheKey = buildGroceryPriceCacheKey(context);
  const now = new Date();

  const cached = await getGroceryPriceCache(cacheKey);
  if (cached && new Date(cached.expires_at).getTime() > now.getTime()) {
    const event = await insertGroceryPriceSearchEvent({
      person_id: options.personId,
      grocery_item_id: item.id,
      grocery_list_id: options.listId,
      plan_id: null,
      date_range_start: LIST_PRICE_SEARCH_SENTINEL_DATE,
      date_range_end: LIST_PRICE_SEARCH_SENTINEL_DATE,
      match_key: matchKey,
      food_object_id: foodObjectId,
      provider: cached.provider,
      query: cached.query_used,
      retailer,
      postal_code: postalCode,
      cache_key: cacheKey,
      cache_hit: true,
      billed: false,
      result_count: cached.offers_json.length,
      candidate_snapshot: buildCandidateSnapshotFromOffers(cached.offers_json),
    });
    const quota = await buildGroceryPriceSearchQuota({
      personId: options.personId,
      consumedThisRequest: false,
    });
    return {
      provider: 'serpapi',
      search_event_id: event.id,
      query: cached.query_used,
      retailer,
      postal_code: postalCode,
      cache_hit: true,
      outcome: cached.offers_json.length > 0 ? 'results' : 'zero_results',
      retrieved_at: cached.retrieved_at,
      expires_at: cached.expires_at,
      offers: capConfirmableOffers(cached.offers_json),
      quota,
      provider_error: null,
    };
  }

  const reservation = await reserveGroceryPriceSearchQuota(options.personId);
  const providerAdapter =
    options.maxProviderQueries != null
      ? createLimitedQueryAdapter(serpApiGroceryPriceProvider, options.maxProviderQueries)
      : serpApiGroceryPriceProvider;

  try {
    const fallback = await searchWithQueryFallback(context, providerAdapter);
    if (fallback.kind === 'zero_results') {
      const event = await insertGroceryPriceSearchEvent({
        person_id: options.personId,
        grocery_item_id: item.id,
        grocery_list_id: options.listId,
        plan_id: null,
        date_range_start: LIST_PRICE_SEARCH_SENTINEL_DATE,
        date_range_end: LIST_PRICE_SEARCH_SENTINEL_DATE,
        match_key: matchKey,
        food_object_id: foodObjectId,
        provider: 'serpapi',
        query: context.required_ingredient_name,
        retailer,
        postal_code: postalCode,
        cache_key: cacheKey,
        cache_hit: false,
        billed: false,
        result_count: 0,
        candidate_snapshot: { count: 0, offers: [] },
      });
      await finalizeQuotaClaim({
        claimId: reservation.claimId,
        status: 'released',
        searchEventId: event.id,
      });
      const quota = await buildGroceryPriceSearchQuota({ personId: options.personId });
      return {
        provider: 'serpapi',
        search_event_id: event.id,
        query: context.required_ingredient_name,
        retailer,
        postal_code: postalCode,
        cache_hit: false,
        outcome: 'zero_results',
        retrieved_at: now.toISOString(),
        expires_at: addDaysIso(now, GROCERY_PRICE_CACHE_TTL_DAYS),
        offers: [],
        quota,
        provider_error: null,
      };
    }

    const ranked = rankGroceryPriceCandidates(context, fallback.result.candidates);
    const offers = capConfirmableOffers(ranked.map(toSearchOffer));
    const billed = offers.length > 0;
    const retrievedAt = fallback.result.retrieved_at;
    const expiresAt = addDaysIso(now, GROCERY_PRICE_CACHE_TTL_DAYS);

    if (offers.length > 0) {
      await upsertGroceryPriceCache({
        cache_key: cacheKey,
        food_object_id: foodObjectId,
        preferred_product: context.preferred_product,
        retailer,
        postal_code: postalCode,
        provider: 'serpapi',
        query_used: fallback.result.query,
        offers,
        retrieved_at: retrievedAt,
        expires_at: expiresAt,
      });
    }

    const event = await insertGroceryPriceSearchEvent({
      person_id: options.personId,
      grocery_item_id: item.id,
      grocery_list_id: options.listId,
      plan_id: null,
      date_range_start: LIST_PRICE_SEARCH_SENTINEL_DATE,
      date_range_end: LIST_PRICE_SEARCH_SENTINEL_DATE,
      match_key: matchKey,
      food_object_id: foodObjectId,
      provider: 'serpapi',
      query: fallback.result.query,
      retailer,
      postal_code: postalCode,
      cache_key: cacheKey,
      cache_hit: false,
      billed,
      result_count: offers.length,
      candidate_snapshot: buildCandidateSnapshot(ranked),
    });

    await finalizeQuotaClaim({
      claimId: reservation.claimId,
      status: billed ? 'billed' : 'released',
      searchEventId: event.id,
    });

    const quota = await buildGroceryPriceSearchQuota({
      personId: options.personId,
      consumedThisRequest: billed,
    });

    return {
      provider: 'serpapi',
      search_event_id: event.id,
      query: fallback.result.query,
      retailer,
      postal_code: postalCode,
      cache_hit: false,
      outcome: offers.length > 0 ? 'results' : 'zero_results',
      retrieved_at: retrievedAt,
      expires_at: expiresAt,
      offers,
      quota,
      provider_error: null,
    };
  } catch (error) {
    await finalizeQuotaClaim({
      claimId: reservation.claimId,
      status: 'released',
    }).catch(() => undefined);

    if (error instanceof GroceryPriceProviderError) {
      const event = await insertGroceryPriceSearchEvent({
        person_id: options.personId,
        grocery_item_id: item.id,
        grocery_list_id: options.listId,
        plan_id: null,
        date_range_start: LIST_PRICE_SEARCH_SENTINEL_DATE,
        date_range_end: LIST_PRICE_SEARCH_SENTINEL_DATE,
        match_key: matchKey,
        food_object_id: foodObjectId,
        provider: 'serpapi',
        query: context.required_ingredient_name,
        retailer,
        postal_code: postalCode,
        cache_key: cacheKey,
        cache_hit: false,
        billed: false,
        result_count: 0,
        candidate_snapshot: { error: error.code },
      });
      const quota = await buildGroceryPriceSearchQuota({ personId: options.personId });
      return {
        provider: 'serpapi',
        search_event_id: event.id,
        query: context.required_ingredient_name,
        retailer,
        postal_code: postalCode,
        cache_hit: false,
        outcome: 'provider_error',
        retrieved_at: now.toISOString(),
        expires_at: addDaysIso(now, GROCERY_PRICE_CACHE_TTL_DAYS),
        offers: [],
        quota,
        provider_error: {
          code: error.code,
          message: error.message,
        },
      };
    }
    throw error;
  }
}

export async function confirmListGroceryItemPrice(options: {
  personId: string;
  listId: string;
  itemId: string;
  input: Omit<ConfirmSourcedGroceryPriceInput, 'grocery_item_id'>;
}): Promise<GroceryPriceConfirmationResult> {
  const { personId, listId, itemId, input } = options;
  if (!input.search_event_id || !input.provider_result_id) {
    throw new GroceryPriceValidationError('search_event_id and provider_result_id are required');
  }

  const { item, choice } = await loadDurableItemAndChoice(personId, listId, itemId);
  const matchKey = activePurchasingMatchKeyForItem(item, choice);
  const event = await getGroceryPriceSearchEvent(personId, input.search_event_id);
  if (!event) {
    throw new Error('Search event not found');
  }
  if (
    !searchEventMatchesListItem(event, {
      listId,
      itemId,
      matchKey,
    })
  ) {
    throw new Error('Search event does not belong to this grocery list item');
  }

  const ageMs = Date.now() - new Date(event.created_at).getTime();
  if (ageMs > GROCERY_PRICE_SEARCH_EVENT_MAX_AGE_MS) {
    throw new GroceryPriceValidationError('Search event is too old to confirm');
  }

  const snapshot = event.candidate_snapshot ?? {};
  const offers = Array.isArray(snapshot.offers) ? snapshot.offers : [];
  const candidate = offers.find(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      (entry as { provider_result_id?: string }).provider_result_id === input.provider_result_id,
  ) as GroceryPriceSearchResult['offers'][number] | undefined;

  if (!candidate) {
    throw new GroceryPriceValidationError('provider_result_id was not found in the search event');
  }

  const packageCount = normalizePackageCount(input.package_count);
  const lineTotal = Math.round(candidate.price * packageCount * 100) / 100;
  const foodObjectId = choice?.food_object_id ?? item.food_object_id ?? null;

  const listObs = await appendListPriceObservation({
    person_id: personId,
    grocery_list_id: listId,
    grocery_item_id: itemId,
    match_key: matchKey,
    purchasing_choice_id: choice?.id ?? null,
    food_object_id: foodObjectId,
    source: 'serpapi',
    retailer: event.retailer,
    postal_code: event.postal_code,
    product_title: candidate.title,
    brand_name: null,
    package_size: candidate.package_size,
    package_unit: candidate.package_unit,
    unit_price: candidate.price,
    currency: candidate.currency,
    package_count: packageCount,
    line_total: lineTotal,
    product_url: assertSafeOutboundUrl(candidate.product_url, 'product_url'),
    image_url: assertSafeOutboundUrl(candidate.image_url, 'image_url'),
    provider_result_id: candidate.provider_result_id,
    search_event_id: event.id,
    match_confidence: candidate.match_confidence,
  });

  const observation: GroceryPriceObservation = listPriceToHaulObservation(listObs);
  try {
    const { upsertActiveQuote } = await import('./groceryListActiveQuoteStore');
    await upsertActiveQuote({
      personId,
      listId,
      itemId,
      observationId: listObs.id,
    });
  } catch {
    // Active-quote table may not exist yet.
  }
  return { observation, shopping_override: null };
}
