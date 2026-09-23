/**
 * Live List price-search path (founder Blueberries item).
 * Runs only when SERPAPI_API_KEY is configured in the environment.
 */

import { config as loadDotenv } from 'dotenv';
import { loadEnvConfig } from '@next/env';

import { resolveGroceryPriceSerpApiApiKey } from '../groceryPricingConfig';

loadDotenv({ path: '.env.local' });
loadEnvConfig(process.cwd());

const LIVE = Boolean(resolveGroceryPriceSerpApiApiKey());

const FOUNDER_LIST_ID = '84272329-c998-40ee-9377-67eddeccc115';
const FOUNDER_ITEM_ID = 'e1bed4df-108e-4e7f-bef0-cb5d17e6e8ee';
const FOUNDER_PERSON_ID = '893f480f-85d3-4332-9d08-605952f7cae1';

describe('groceryListPriceSearch live List path', () => {
  (LIVE ? it : it.skip)(
    'searchListGroceryItemPrices returns offers for founder Blueberries item',
    async () => {
      const { searchListGroceryItemPrices } = await import('../groceryListPriceSearchService');
      const result = await searchListGroceryItemPrices({
        personId: FOUNDER_PERSON_ID,
        listId: FOUNDER_LIST_ID,
        itemId: FOUNDER_ITEM_ID,
        retailer: 'Whole Foods',
        postalCode: '94110',
      });
      expect(result.provider_error).toBeNull();
      expect(result.outcome).toBe('results');
      expect(result.offers.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
