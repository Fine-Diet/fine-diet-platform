import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { resolveGroceryPriceSerpApiApiKey } = await import('../lib/plans/groceryPricingConfig');
  const mod = await import('../lib/plans/groceryListPriceSearchService');
  const listId = '84272329-c998-40ee-9377-67eddeccc115';
  const itemId = 'e1bed4df-108e-4e7f-bef0-cb5d17e6e8ee';
  const personId = '893f480f-85d3-4332-9d08-605952f7cae1';

  const result = await mod.searchListGroceryItemPrices({
    personId,
    listId,
    itemId,
    retailer: 'Whole Foods',
    postalCode: '94110',
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

  const offer = result.offers[0];
  const confirmation = await mod.confirmListGroceryItemPrice({
    personId,
    listId,
    itemId,
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
