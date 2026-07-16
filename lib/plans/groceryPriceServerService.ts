/**
 * Grocery price search server-side orchestration.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  ConfirmSourcedGroceryPriceInput,
  GroceryHaulSummaryBundle,
  GroceryPriceObservation,
  GroceryPriceSearchResult,
  SaveManualGroceryPriceInput,
} from './groceryPricingTypes';
import type { GroceryItem } from './types';
import type { GroceryListScope } from './groceryShoppingOverrideStore';
import { groceryItemMatchKey } from './groceryMatchKeys';
import { getShoppingOverrideByMatchKey } from './groceryShoppingOverrideStore';
import {
  formatCanonicalFoodShoppingLabel,
  resolveGroceryShoppingDisplayName,
} from './groceryShoppingDisplay';
import {
  GROCERY_PRICE_CACHE_TTL_DAYS,
  GROCERY_PRICE_SEARCH_EVENT_MAX_AGE_MS,
} from './groceryPricingConfig';
import {
  GroceryPriceValidationError,
  assertSafeOutboundUrl,
  normalizeBrandName,
  normalizePackageCount,
  normalizePostalCode,
  normalizeProductTitle,
  normalizeRetailer,
  normalizeUnitPrice,
} from './groceryPricingValidation';
import { addDaysIso, buildGroceryPriceCacheKey } from './groceryPriceCache';
import {
  buildGroceryPriceSearchQuota,
  GroceryPriceQuotaExceededError,
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
  appendManualGroceryPriceObservation,
  appendSourcedGroceryPriceObservation,
  buildCandidateSnapshot,
  getGroceryPriceSearchEvent,
  insertGroceryPriceSearchEvent,
  upsertGroceryPriceCache,
  getGroceryPriceCache,
  listCurrentObservationsForScope,
  searchEventMatchesItemScope,
} from './groceryPriceStore';
import { buildGroceryHaulSummary } from './groceryHaulSummary';
import { observationsByMatchKeyFromList } from './groceryPricingObservations';
import { capConfirmableOffers } from './groceryPricingOfferDisplay';
import { GroceryPriceManualReplaceRequiredError } from './groceryPriceManualReplace';

async function loadGroceryItemScope(
  personId: string,
  itemId: string,
): Promise<{ item: GroceryItem; scope: GroceryListScope }> {
  const { data: item, error: itemErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .eq('person_id', personId)
    .single();
  if (itemErr || !item) {
    throw new Error(`Failed to load grocery item: ${itemErr?.message ?? 'not found'}`);
  }

  const { data: list, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('plan_id, date_range_start, date_range_end')
    .eq('id', item.grocery_list_id)
    .eq('person_id', personId)
    .single();
  if (listErr || !list?.plan_id || !list.date_range_start || !list.date_range_end) {
    throw new Error(`Failed to load grocery list scope: ${listErr?.message ?? 'not found'}`);
  }

  return {
    item: item as unknown as GroceryItem,
    scope: {
      planId: list.plan_id,
      dateStart: list.date_range_start,
      dateEnd: list.date_range_end,
    },
  };
}

async function loadFoodObjectDetails(foodObjectId: string | null) {
  if (!foodObjectId) {
    return {
      canonical_name: null,
      brand_name: null,
      upc: null,
      image_url: null,
      serving_description: null,
    };
  }
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select('canonical_name, brand_name, upc, image_url, serving_description')
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
    serving_description: (data?.serving_description as string | null | undefined) ?? null,
  };
}

async function buildSearchContext(options: {
  personId: string;
  item: GroceryItem;
  scope: GroceryListScope;
  retailer: string;
  postalCode: string;
}): Promise<GroceryPriceSearchContext> {
  const matchKey = groceryItemMatchKey(options.item);
  const override = await getShoppingOverrideByMatchKey(options.personId, options.scope, matchKey);
  const food = await loadFoodObjectDetails(options.item.food_object_id);
  const resolvedProductLabel = food.canonical_name
    ? formatCanonicalFoodShoppingLabel({
        canonical_name: food.canonical_name,
        brand_name: food.brand_name,
      })
    : null;

  return {
    match_key: matchKey,
    food_object_id: options.item.food_object_id,
    canonical_name: food.canonical_name,
    brand_name: food.brand_name,
    upc: food.upc,
    image_url: food.image_url,
    serving_description: food.serving_description,
    required_ingredient_name: resolveGroceryShoppingDisplayName({
      requiredName: options.item.name,
      override,
      resolvedProductLabel,
    }),
    required_quantity: options.item.quantity,
    required_unit: options.item.unit,
    preferred_product: override?.preferred_product ?? null,
    purchase_quantity: override?.purchase_quantity ?? null,
    purchase_unit: override?.purchase_unit ?? null,
    retailer: options.retailer,
    postal_code: options.postalCode,
  };
}

export async function searchGroceryItemPrices(options: {
  personId: string;
  groceryItemId: string;
  retailer: string;
  postalCode: string;
  /** Smoke-only: limit provider fallback strategies (default: all). */
  maxProviderQueries?: number;
}): Promise<GroceryPriceSearchResult> {
  const retailer = normalizeRetailer(options.retailer);
  const postalCode = normalizePostalCode(options.postalCode);
  const { item, scope } = await loadGroceryItemScope(options.personId, options.groceryItemId);
  const matchKey = groceryItemMatchKey(item);
  const context = await buildSearchContext({
    personId: options.personId,
    item,
    scope,
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
      grocery_list_id: item.grocery_list_id,
      plan_id: scope.planId,
      date_range_start: scope.dateStart,
      date_range_end: scope.dateEnd,
      match_key: matchKey,
      food_object_id: item.food_object_id,
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
        grocery_list_id: item.grocery_list_id,
        plan_id: scope.planId,
        date_range_start: scope.dateStart,
        date_range_end: scope.dateEnd,
        match_key: matchKey,
        food_object_id: item.food_object_id,
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
        food_object_id: item.food_object_id,
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
      grocery_list_id: item.grocery_list_id,
      plan_id: scope.planId,
      date_range_start: scope.dateStart,
      date_range_end: scope.dateEnd,
      match_key: matchKey,
      food_object_id: item.food_object_id,
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
        grocery_list_id: item.grocery_list_id,
        plan_id: scope.planId,
        date_range_start: scope.dateStart,
        date_range_end: scope.dateEnd,
        match_key: matchKey,
        food_object_id: item.food_object_id,
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

function buildCandidateSnapshotFromOffers(
  offers: GroceryPriceSearchResult['offers'],
): Record<string, unknown> {
  return {
    count: offers.length,
    offers: offers.slice(0, 12),
  };
}

export async function confirmSourcedGroceryPrice(options: {
  personId: string;
  input: ConfirmSourcedGroceryPriceInput;
}): Promise<GroceryPriceObservation> {
  const { personId, input } = options;
  if (!input.search_event_id || !input.provider_result_id) {
    throw new GroceryPriceValidationError('search_event_id and provider_result_id are required');
  }

  const { item, scope } = await loadGroceryItemScope(personId, input.grocery_item_id);
  const matchKey = groceryItemMatchKey(item);
  const event = await getGroceryPriceSearchEvent(personId, input.search_event_id);
  if (!event) {
    throw new Error('Search event not found');
  }
  if (!searchEventMatchesItemScope(event, scope, matchKey, item.id)) {
    throw new Error('Search event does not belong to this grocery item scope');
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
  const food = await loadFoodObjectDetails(item.food_object_id);

  return appendSourcedGroceryPriceObservation(
    {
      person_id: personId,
      grocery_item_id: item.id,
      grocery_list_id: item.grocery_list_id,
      plan_id: scope.planId,
      date_range_start: scope.dateStart,
      date_range_end: scope.dateEnd,
      match_key: matchKey,
      food_object_id: item.food_object_id,
      retailer: event.retailer,
      postal_code: event.postal_code,
      product_title: candidate.title,
      brand_name: food.brand_name,
      package_size: candidate.package_size,
      package_unit: candidate.package_unit,
      unit_price: candidate.price,
      currency: candidate.currency,
      package_count: packageCount,
      line_total: lineTotal,
      product_url: assertSafeOutboundUrl(candidate.product_url, 'product_url'),
      image_url: assertSafeOutboundUrl(candidate.image_url ?? food.image_url, 'image_url'),
      provider_result_id: candidate.provider_result_id,
      search_event_id: event.id,
      match_confidence: candidate.match_confidence,
    },
    { replaceManual: input.replace_manual === true },
  );
}

export async function saveManualGroceryPrice(options: {
  personId: string;
  input: SaveManualGroceryPriceInput;
}): Promise<GroceryPriceObservation> {
  const { personId, input } = options;
  const { item, scope } = await loadGroceryItemScope(personId, input.grocery_item_id);
  const food = await loadFoodObjectDetails(item.food_object_id);
  const unitPrice = normalizeUnitPrice(input.unit_price);
  const packageCount = normalizePackageCount(input.package_count);
  const lineTotal = Math.round(unitPrice * packageCount * 100) / 100;

  return appendManualGroceryPriceObservation({
    person_id: personId,
    grocery_item_id: item.id,
    grocery_list_id: item.grocery_list_id,
    plan_id: scope.planId,
    date_range_start: scope.dateStart,
    date_range_end: scope.dateEnd,
    match_key: groceryItemMatchKey(item),
    food_object_id: item.food_object_id,
    retailer: input.retailer ? normalizeRetailer(input.retailer) : null,
    postal_code: input.postal_code ? normalizePostalCode(input.postal_code) : null,
    product_title: input.product_title
      ? normalizeProductTitle(input.product_title)
      : resolveGroceryShoppingDisplayName({
          requiredName: item.name,
          resolvedProductLabel: food.canonical_name
            ? formatCanonicalFoodShoppingLabel({
                canonical_name: food.canonical_name,
                brand_name: food.brand_name,
              })
            : null,
        }),
    brand_name: normalizeBrandName(input.brand_name) ?? food.brand_name,
    package_size: typeof input.package_size === 'number' ? input.package_size : null,
    package_unit: typeof input.package_unit === 'string' ? input.package_unit : null,
    unit_price: unitPrice,
    currency: typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim() : 'USD',
    package_count: packageCount,
    line_total: lineTotal,
    product_url: assertSafeOutboundUrl(input.product_url ?? null, 'product_url'),
    image_url: assertSafeOutboundUrl(input.image_url ?? food.image_url ?? null, 'image_url'),
  });
}

export async function getGroceryHaulSummaryForList(options: {
  personId: string;
  groceryListId: string;
}): Promise<GroceryHaulSummaryBundle> {
  const { data: list, error: listErr } = await supabaseAdmin
    .from('generated_grocery_lists')
    .select('id, plan_id, date_range_start, date_range_end')
    .eq('id', options.groceryListId)
    .eq('person_id', options.personId)
    .maybeSingle();
  if (listErr || !list?.plan_id || !list.date_range_start || !list.date_range_end) {
    throw new Error(`Failed to load grocery list: ${listErr?.message ?? 'not found'}`);
  }

  const scope: GroceryListScope = {
    planId: list.plan_id,
    dateStart: list.date_range_start,
    dateEnd: list.date_range_end,
  };

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('grocery_list_id', options.groceryListId)
    .eq('person_id', options.personId);
  if (itemsErr) {
    throw new Error(`Failed to load grocery items: ${itemsErr.message}`);
  }

  const observations = await listCurrentObservationsForScope(options.personId, scope);
  const summary = await buildGroceryHaulSummary({
    personId: options.personId,
    groceryListId: options.groceryListId,
    scope,
    items: (items ?? []) as unknown as GroceryItem[],
  });

  return {
    summary,
    observations_by_match_key: observationsByMatchKeyFromList(observations),
  };
}

export { GroceryPriceManualReplaceRequiredError } from './groceryPriceManualReplace';
export {
  GroceryPriceValidationError,
  GroceryPriceQuotaExceededError,
  GroceryPriceProviderError,
};
