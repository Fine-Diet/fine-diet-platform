import { loadEnvConfig } from '@next/env';

import {
  isListPriceDiagConfirmAuthorized,
  resolveListPriceLiveFixtureIds,
} from '../lib/plans/groceryListPriceSearchLiveGuard';
import { resolveGroceryPriceSerpApiApiKey } from '../lib/plans/groceryPricingConfig';

loadEnvConfig(process.cwd());

async function main() {
  const fixture = resolveListPriceLiveFixtureIds();
  if (!fixture) {
    console.error(
      'Set GROCERY_LIST_PRICE_LIVE_PERSON_ID, GROCERY_LIST_PRICE_LIVE_LIST_ID, and '
      + 'GROCERY_LIST_PRICE_LIVE_ITEM_ID to run this diagnostic.',
    );
    process.exitCode = 1;
    return;
  }

  const mod = await import('../lib/plans/groceryListPriceSearchService');
  const retailer = process.env.GROCERY_LIST_PRICE_LIVE_RETAILER?.trim() || 'Whole Foods';
  const postalCode = process.env.GROCERY_LIST_PRICE_LIVE_POSTAL?.trim() || '94110';

  const result = await mod.searchListGroceryItemPrices({
    personId: fixture.personId,
    listId: fixture.listId,
    itemId: fixture.itemId,
    retailer,
    postalCode,
  });
  const summary = {
    outcome: result.outcome,
    offerCount: result.offers?.length ?? 0,
    provider_error: result.provider_error,
    query: result.query,
    cache_hit: result.cache_hit,
    serpApiKeyConfigured: Boolean(resolveGroceryPriceSerpApiApiKey()),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (result.outcome !== 'results' || result.offers.length === 0) {
    process.exitCode = 1;
    return;
  }

  if (!isListPriceDiagConfirmAuthorized()) {
    console.log(
      JSON.stringify(
        { confirm_skipped: true, hint: 'Set GROCERY_LIST_PRICE_DIAG_CONFIRM=1 to confirm an offer.' },
        null,
        2,
      ),
    );
    return;
  }

  const offer = result.offers[0];
  const confirmation = await mod.confirmListGroceryItemPrice({
    personId: fixture.personId,
    listId: fixture.listId,
    itemId: fixture.itemId,
    input: {
      search_event_id: result.search_event_id,
      provider_result_id: offer.provider_result_id,
      package_count: 1,
    },
  });
  console.log(
    JSON.stringify(
      {
        confirmed: true,
        observation_id: confirmation.observation.id,
        unit_price: confirmation.observation.unit_price,
      },
      null,
      2,
    ),
  );
}

void main();
