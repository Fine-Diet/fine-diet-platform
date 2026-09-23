/**
 * Live List price-search path — explicit opt-in only.
 */

import { config as loadDotenv } from 'dotenv';
import { loadEnvConfig } from '@next/env';

import {
  isListPriceSearchLiveTestAuthorized,
  resolveListPriceLiveFixtureIds,
} from '../groceryListPriceSearchLiveGuard';

loadDotenv({ path: '.env.local' });
loadEnvConfig(process.cwd());

const LIVE = isListPriceSearchLiveTestAuthorized();
const FIXTURE = resolveListPriceLiveFixtureIds();

describe('groceryListPriceSearch live List path', () => {
  (LIVE && FIXTURE ? it : it.skip)(
    'searchListGroceryItemPrices returns offers for configured list item',
    async () => {
      const { searchListGroceryItemPrices } = await import('../groceryListPriceSearchService');
      const result = await searchListGroceryItemPrices({
        personId: FIXTURE!.personId,
        listId: FIXTURE!.listId,
        itemId: FIXTURE!.itemId,
        retailer: process.env.GROCERY_LIST_PRICE_LIVE_RETAILER?.trim() || 'Whole Foods',
        postalCode: process.env.GROCERY_LIST_PRICE_LIVE_POSTAL?.trim() || '94110',
      });
      expect(result.provider_error).toBeNull();
      expect(result.outcome).toBe('results');
      expect(result.offers.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
