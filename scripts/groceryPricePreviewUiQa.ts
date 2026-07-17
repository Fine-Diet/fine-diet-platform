/**
 * Preview-only UI boundary QA for grocery pricing (fixture/offline).
 *
 * Usage:
 *   npx tsx scripts/groceryPricePreviewUiQa.ts
 */

import { randomUUID } from 'crypto';
import { loadEnvConfig } from '@next/env';
import { SERPAPI_SPINACH_FIXTURE } from '@/lib/plans/__tests__/fixtures/serpApiShoppingFixtures';
import { runGroceryPricePreviewUiQa } from '@/lib/plans/groceryPricePreviewUiQaRunner';

const PERSON_ID = process.env.GROCERY_PRICE_SMOKE_PERSON_ID ?? '893f480f-85d3-4332-9d08-605952f7cae1';
const GROUNDED_ITEM_ID = process.env.GROCERY_PRICE_SMOKE_ITEM_ID ?? '43cdfe90-da36-4ecb-be4f-3452fa7b122c';
const UNRESOLVED_ITEM_ID = process.env.GROCERY_PRICE_UI_QA_UNRESOLVED_ITEM_ID ?? '14352e40-a3ba-43b6-b3cc-8369301015ac';
const LIST_ID = process.env.GROCERY_PRICE_SMOKE_LIST_ID ?? 'b6373738-00ed-46c6-9fba-cf9236c02e10';

async function main() {
  loadEnvConfig(process.cwd());

  const { setSerpApiFetchOverride } = await import('@/lib/plans/groceryPriceSerpApiProvider');
  const {
    confirmSourcedGroceryPrice,
    getGroceryHaulSummaryForList,
    saveManualGroceryPrice,
    searchGroceryItemPrices,
  } = await import('@/lib/plans/groceryPriceServerService');
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  const smokeEntitlementId = randomUUID();
  const { error: entitlementErr } = await supabaseAdmin.from('person_entitlements').insert({
    id: smokeEntitlementId,
    person_id: PERSON_ID,
    entitlement_key: 'feature:grocery-price-search',
    is_active: true,
    source: 'manual',
    source_ref: 'pr146-preview-ui-qa',
    note: 'Temporary premium quota headroom for Preview UI QA (removed on exit)',
  });
  if (entitlementErr) {
    throw new Error(`Failed to seed QA entitlement: ${entitlementErr.message}`);
  }

  setSerpApiFetchOverride(async () => SERPAPI_SPINACH_FIXTURE);

  try {
    console.log(`Preview grocery UI QA — person=${PERSON_ID} list=${LIST_ID}`);
    const results = await runGroceryPricePreviewUiQa({
      personId: PERSON_ID,
      groundedItemId: GROUNDED_ITEM_ID,
      unresolvedItemId: UNRESOLVED_ITEM_ID,
      listId: LIST_ID,
      deps: {
        searchGroceryItemPrices,
        confirmSourcedGroceryPrice,
        saveManualGroceryPrice,
        getGroceryHaulSummaryForList,
        loadGroceryItemsForList: async ({ personId, groceryListId }) => {
          const { data, error } = await supabaseAdmin
            .from('grocery_items')
            .select('*')
            .eq('grocery_list_id', groceryListId)
            .eq('person_id', personId);
          if (error) {
            throw new Error(`Failed to load grocery items: ${error.message}`);
          }
          return (data ?? []) as never;
        },
      },
    });

    for (const result of results) {
      console.log(`${result.status.toUpperCase().padEnd(4)} ${result.name}: ${result.detail}`);
    }
    const failed = results.filter((result) => result.status === 'fail');
    if (failed.length > 0) {
      process.exitCode = 1;
      return;
    }
    console.log(`\nAll ${results.length} Preview UI QA checks passed.`);
  } finally {
    await supabaseAdmin.from('person_entitlements').delete().eq('id', smokeEntitlementId);
    setSerpApiFetchOverride(null);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
