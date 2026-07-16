/**
 * Preview-only fixture/offline grocery price API smoke.
 *
 * Exercises server services against the Preview Supabase project using SerpAPI
 * fixture overrides (zero live provider calls).
 *
 * Usage:
 *   npx tsx scripts/groceryPricePreviewSmoke.ts
 */

import { randomUUID } from 'crypto';
import { loadEnvConfig } from '@next/env';
import { SERPAPI_EMPTY_FIXTURE, SERPAPI_SPINACH_FIXTURE } from '@/lib/plans/__tests__/fixtures/serpApiShoppingFixtures';

const PERSON_ID = process.env.GROCERY_PRICE_SMOKE_PERSON_ID ?? '893f480f-85d3-4332-9d08-605952f7cae1';
const SEARCH_ITEM_ID = process.env.GROCERY_PRICE_SMOKE_ITEM_ID ?? '43cdfe90-da36-4ecb-be4f-3452fa7b122c';
const MANUAL_ITEM_ID = process.env.GROCERY_PRICE_SMOKE_MANUAL_ITEM_ID ?? '7310b49a-1ff5-411d-8baf-68710595cad4';
const LIST_ID = process.env.GROCERY_PRICE_SMOKE_LIST_ID ?? 'b6373738-00ed-46c6-9fba-cf9236c02e10';

interface SmokeResult {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

const results: SmokeResult[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, status: 'pass', detail });
  console.log(`PASS  ${name}: ${detail}`);
}

function fail(name: string, detail: string): never {
  results.push({ name, status: 'fail', detail });
  console.error(`FAIL  ${name}: ${detail}`);
  throw new Error(`${name}: ${detail}`);
}

async function main() {
  loadEnvConfig(process.cwd());

  const { setSerpApiFetchOverride } = await import('@/lib/plans/groceryPriceSerpApiProvider');
  const { countBilledGroceryPriceSearches } = await import('@/lib/plans/groceryPriceStore');
  const {
    confirmSourcedGroceryPrice,
    getGroceryHaulSummaryForList,
    saveManualGroceryPrice,
    searchGroceryItemPrices,
  } = await import('@/lib/plans/groceryPriceServerService');
  const { groceryItemMatchKey } = await import('@/lib/plans/groceryMatchKeys');
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  const smokeEntitlementId = randomUUID();
  const { error: entitlementErr } = await supabaseAdmin.from('person_entitlements').insert({
    id: smokeEntitlementId,
    person_id: PERSON_ID,
    entitlement_key: 'feature:grocery-price-search',
    is_active: true,
    source: 'manual',
    source_ref: 'pr146-preview-smoke',
    note: 'Temporary premium quota headroom for Preview smoke (removed on exit)',
  });
  if (entitlementErr) {
    throw new Error(`Failed to seed smoke entitlement: ${entitlementErr.message}`);
  }

  try {
    await runSmoke({
      setSerpApiFetchOverride,
      countBilledGroceryPriceSearches,
      confirmSourcedGroceryPrice,
      getGroceryHaulSummaryForList,
      saveManualGroceryPrice,
      searchGroceryItemPrices,
      groceryItemMatchKey,
      supabaseAdmin,
    });
  } finally {
    await supabaseAdmin.from('person_entitlements').delete().eq('id', smokeEntitlementId);
    setSerpApiFetchOverride(null);
  }
}

async function runSmoke(deps: {
  setSerpApiFetchOverride: (fn: ((url: string) => Promise<unknown>) | null) => void;
  countBilledGroceryPriceSearches: (options: { personId: string }) => Promise<number>;
  confirmSourcedGroceryPrice: typeof import('@/lib/plans/groceryPriceServerService').confirmSourcedGroceryPrice;
  getGroceryHaulSummaryForList: typeof import('@/lib/plans/groceryPriceServerService').getGroceryHaulSummaryForList;
  saveManualGroceryPrice: typeof import('@/lib/plans/groceryPriceServerService').saveManualGroceryPrice;
  searchGroceryItemPrices: typeof import('@/lib/plans/groceryPriceServerService').searchGroceryItemPrices;
  groceryItemMatchKey: typeof import('@/lib/plans/groceryMatchKeys').groceryItemMatchKey;
  supabaseAdmin: typeof import('@/lib/supabaseServerClient').supabaseAdmin;
}): Promise<void> {
  const {
    setSerpApiFetchOverride,
    countBilledGroceryPriceSearches,
    confirmSourcedGroceryPrice,
    getGroceryHaulSummaryForList,
    saveManualGroceryPrice,
    searchGroceryItemPrices,
    groceryItemMatchKey,
    supabaseAdmin,
  } = deps;

  async function loadListScope(listId: string) {
    const { data, error } = await supabaseAdmin
      .from('generated_grocery_lists')
      .select('id, plan_id, date_range_start, date_range_end')
      .eq('id', listId)
      .eq('person_id', PERSON_ID)
      .single();
    if (error || !data?.plan_id || !data.date_range_start || !data.date_range_end) {
      throw new Error(`Failed to load list scope: ${error?.message ?? 'missing scope'}`);
    }
    return data;
  }

  console.log(`Preview grocery price smoke — person=${PERSON_ID}`);

  const billedBefore = await countBilledGroceryPriceSearches({ personId: PERSON_ID });

  setSerpApiFetchOverride(async () => SERPAPI_EMPTY_FIXTURE);
  const zeroPostal = `100${Math.floor(Math.random() * 90 + 10)}`;
  const zero = await searchGroceryItemPrices({
    personId: PERSON_ID,
    groceryItemId: MANUAL_ITEM_ID,
    retailer: 'Target',
    postalCode: zeroPostal,
  });
  if (zero.outcome !== 'zero_results') {
    fail('quota_zero_results', `expected zero_results, got ${zero.outcome}`);
  }
  if (zero.quota.consumed_this_request) {
    fail('quota_zero_results_nonbilling', 'zero_results must not consume quota');
  }
  const billedAfterZero = await countBilledGroceryPriceSearches({ personId: PERSON_ID });
  if (billedAfterZero !== billedBefore) {
    fail('quota_zero_results_count', `billed count changed ${billedBefore} -> ${billedAfterZero}`);
  }
  pass('quota_zero_results_nonbilling', `billed unchanged at ${billedAfterZero}`);

  setSerpApiFetchOverride(async () => SERPAPI_SPINACH_FIXTURE);
  const searchPostal = `941${Math.floor(Math.random() * 90 + 10)}`;
  const search = await searchGroceryItemPrices({
    personId: PERSON_ID,
    groceryItemId: SEARCH_ITEM_ID,
    retailer: 'Whole Foods Market',
    postalCode: searchPostal,
  });
  if (search.outcome !== 'results' || search.offers.length === 0) {
    fail('price_search', `expected results, got ${search.outcome}`);
  }
  if (!search.cache_hit && !search.quota.consumed_this_request) {
    fail('price_search_billing', 'expected billed fresh search to consume quota');
  }
  pass(
    'price_search',
    `event=${search.search_event_id} offers=${search.offers.length} cache_hit=${search.cache_hit}`,
  );

  const providerResultId = search.offers[0]?.provider_result_id;
  if (!providerResultId) {
    fail('price_confirm_setup', 'missing provider_result_id');
  }

  const observation = await confirmSourcedGroceryPrice({
    personId: PERSON_ID,
    input: {
      grocery_item_id: SEARCH_ITEM_ID,
      search_event_id: search.search_event_id,
      provider_result_id: providerResultId,
    },
  });
  if (observation.source !== 'serpapi') {
    fail('price_confirm', `expected serpapi observation, got ${observation.source}`);
  }
  pass('price_confirm', `observation=${observation.id} line_total=${observation.line_total}`);

  const manual = await saveManualGroceryPrice({
    personId: PERSON_ID,
    input: {
      grocery_item_id: MANUAL_ITEM_ID,
      unit_price: 12.5,
      product_title: 'Preview Smoke Cod',
      retailer: 'Whole Foods Market',
      postal_code: '94110',
    },
  });
  if (manual.source !== 'manual') {
    fail('price_manual', `expected manual observation, got ${manual.source}`);
  }
  pass('price_manual', `observation=${manual.id} line_total=${manual.line_total}`);

  const haul = await getGroceryHaulSummaryForList({
    personId: PERSON_ID,
    groceryListId: LIST_ID,
  });
  if (haul.priced_item_count < 1 || haul.estimated_total <= 0) {
    fail('haul_summary', `expected priced haul, got count=${haul.priced_item_count} total=${haul.estimated_total}`);
  }
  pass(
    'haul_summary',
    `priced=${haul.priced_item_count}/${haul.total_item_count} total=${haul.estimated_total}`,
  );

  const staleClaimId = randomUUID();
  const { error: staleErr } = await supabaseAdmin.from('grocery_price_search_quota_claims').insert({
    id: staleClaimId,
    person_id: PERSON_ID,
    window_key: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`,
    status: 'pending',
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  if (staleErr) {
    fail('quota_stale_claim_seed', staleErr.message);
  }

  const { data: reclaimedClaimId, error: claimErr } = await supabaseAdmin.rpc(
    'claim_grocery_price_search_quota',
    {
      p_person_id: PERSON_ID,
      p_window_key: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`,
      p_limit: 50,
      p_claim_ttl_seconds: 300,
    },
  );
  if (claimErr || !reclaimedClaimId) {
    fail('quota_stale_claim_recovery', claimErr?.message ?? 'claim returned null');
  }

  const { data: staleRow } = await supabaseAdmin
    .from('grocery_price_search_quota_claims')
    .select('status, finalized_at')
    .eq('id', staleClaimId)
    .single();
  if (staleRow?.status !== 'released' || !staleRow.finalized_at) {
    fail('quota_stale_claim_recovery', `stale claim status=${staleRow?.status ?? 'missing'}`);
  }

  await supabaseAdmin
    .from('grocery_price_search_quota_claims')
    .update({ status: 'released', finalized_at: new Date().toISOString() })
    .eq('id', reclaimedClaimId as string);
  pass('quota_stale_claim_recovery', `released stale=${staleClaimId}`);

  const scope = await loadListScope(LIST_ID);
  const { data: sourceItem } = await supabaseAdmin
    .from('grocery_items')
    .select('*')
    .eq('id', SEARCH_ITEM_ID)
    .eq('person_id', PERSON_ID)
    .single();
  if (!sourceItem) {
    fail('regeneration_setup', 'source item missing');
  }

  const regeneratedListId = randomUUID();
  const regeneratedItemId = randomUUID();
  const { error: regListErr } = await supabaseAdmin.from('generated_grocery_lists').insert({
    id: regeneratedListId,
    plan_id: scope.plan_id,
    person_id: PERSON_ID,
    title: 'Preview smoke regenerated list',
    date_range_start: scope.date_range_start,
    date_range_end: scope.date_range_end,
    mode: 'manual',
    status: 'draft',
    export_payload_json: {},
  });
  if (regListErr) {
    fail('regeneration_setup', regListErr.message);
  }

  const { error: regItemErr } = await supabaseAdmin.from('grocery_items').insert({
    id: regeneratedItemId,
    grocery_list_id: regeneratedListId,
    person_id: PERSON_ID,
    name: sourceItem.name,
    quantity: sourceItem.quantity,
    unit: sourceItem.unit,
    aisle_category: sourceItem.aisle_category,
    food_object_id: sourceItem.food_object_id,
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
  });
  if (regItemErr) {
    fail('regeneration_setup', regItemErr.message);
  }

  const regMatchKey = groceryItemMatchKey(sourceItem);
  if (regMatchKey !== observation.match_key) {
    fail('regeneration_setup', `match_key mismatch ${regMatchKey} vs ${observation.match_key}`);
  }

  const regHaul = await getGroceryHaulSummaryForList({
    personId: PERSON_ID,
    groceryListId: regeneratedListId,
  });
  if (regHaul.priced_item_count < 1) {
    fail('regeneration_durability', `expected priced regenerated item, got ${regHaul.priced_item_count}`);
  }
  pass('regeneration_durability', `regenerated list priced=${regHaul.priced_item_count}`);

  await supabaseAdmin.from('grocery_items').delete().eq('id', regeneratedItemId);
  await supabaseAdmin.from('generated_grocery_lists').delete().eq('id', regeneratedListId);

  const disposablePlanId = randomUUID();
  const disposableListId = randomUUID();
  const disposableItemId = randomUUID();
  const { error: planErr } = await supabaseAdmin.from('plans').insert({
    id: disposablePlanId,
    person_id: PERSON_ID,
    title: 'Preview smoke disposable plan',
    plan_shape: 'week',
    source: 'ai_generated',
    status: 'active',
    start_date: '2026-07-15',
    end_date: '2026-07-21',
    input_snapshot_json: { smoke: true },
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  });
  if (planErr) {
    fail('plan_deletion_setup', planErr.message);
  }

  const { error: dispListErr } = await supabaseAdmin.from('generated_grocery_lists').insert({
    id: disposableListId,
    plan_id: disposablePlanId,
    person_id: PERSON_ID,
    title: 'Preview smoke disposable list',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-21',
    mode: 'manual',
    status: 'draft',
    export_payload_json: {},
  });
  if (dispListErr) {
    fail('plan_deletion_setup', dispListErr.message);
  }

  const { error: dispItemErr } = await supabaseAdmin.from('grocery_items').insert({
    id: disposableItemId,
    grocery_list_id: disposableListId,
    person_id: PERSON_ID,
    name: 'Preview Smoke Spinach',
    quantity: 2,
    unit: 'cup',
    aisle_category: null,
    food_object_id: sourceItem.food_object_id,
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
  });
  if (dispItemErr) {
    fail('plan_deletion_setup', dispItemErr.message);
  }

  setSerpApiFetchOverride(async () => SERPAPI_SPINACH_FIXTURE);
  const planPostal = `941${Math.floor(Math.random() * 90 + 10)}`;
  const planSearch = await searchGroceryItemPrices({
    personId: PERSON_ID,
    groceryItemId: disposableItemId,
    retailer: 'Whole Foods Market',
    postalCode: planPostal,
  });
  if (planSearch.outcome !== 'results') {
    fail('plan_deletion_search', planSearch.outcome);
  }
  if (planSearch.cache_hit || !planSearch.quota.consumed_this_request) {
    fail('plan_deletion_search', 'expected fresh billed search for plan-deletion probe');
  }

  const billedBeforeDelete = await countBilledGroceryPriceSearches({ personId: PERSON_ID });
  const planEventId = planSearch.search_event_id;

  const { error: deletePlanErr } = await supabaseAdmin.from('plans').delete().eq('id', disposablePlanId);
  if (deletePlanErr) {
    fail('plan_deletion_execute', deletePlanErr.message);
  }

  const { data: preservedEvent } = await supabaseAdmin
    .from('grocery_price_search_events')
    .select('id, plan_id, billed')
    .eq('id', planEventId)
    .single();
  if (!preservedEvent || preservedEvent.plan_id !== null || !preservedEvent.billed) {
    fail(
      'plan_deletion_history',
      `event missing or plan_id=${preservedEvent?.plan_id ?? 'null'} billed=${preservedEvent?.billed ?? 'missing'}`,
    );
  }

  const billedAfterDelete = await countBilledGroceryPriceSearches({ personId: PERSON_ID });
  if (billedAfterDelete !== billedBeforeDelete) {
    fail(
      'plan_deletion_quota_preservation',
      `billed count changed ${billedBeforeDelete} -> ${billedAfterDelete}`,
    );
  }
  pass(
    'plan_deletion_history_preservation',
    `event=${planEventId} plan_id=null billed_count=${billedAfterDelete}`,
  );

  console.log('\nSummary:');
  console.log(JSON.stringify({ paid_serpapi_calls: 0, billed_before: billedBefore, results }, null, 2));
}

main()
  .then(() => {
    if (results.some((r) => r.status === 'fail')) process.exit(1);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nSmoke aborted:', error instanceof Error ? error.message : error);
    console.log(JSON.stringify({ paid_serpapi_calls: 0, results }, null, 2));
    process.exit(1);
  });
