/**
 * Opt-in guards for live List price-search integration tests and diagnostics.
 */

import { resolveGroceryPriceSerpApiApiKey } from './groceryPricingConfig';

export const LIST_PRICE_SEARCH_LIVE_TEST_ACK_ENV = 'GROCERY_LIST_PRICE_SEARCH_LIVE_TEST';
export const LIST_PRICE_DIAG_CONFIRM_ENV = 'GROCERY_LIST_PRICE_DIAG_CONFIRM';
export const LIST_PRICE_LIVE_PERSON_ID_ENV = 'GROCERY_LIST_PRICE_LIVE_PERSON_ID';
export const LIST_PRICE_LIVE_LIST_ID_ENV = 'GROCERY_LIST_PRICE_LIVE_LIST_ID';
export const LIST_PRICE_LIVE_ITEM_ID_ENV = 'GROCERY_LIST_PRICE_LIVE_ITEM_ID';

export function isListPriceSearchLiveTestAuthorized(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LIST_PRICE_SEARCH_LIVE_TEST_ACK_ENV] === '1'
    && Boolean(resolveGroceryPriceSerpApiApiKey());
}

export function isListPriceDiagConfirmAuthorized(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LIST_PRICE_DIAG_CONFIRM_ENV] === '1';
}

export function resolveListPriceLiveFixtureIds(
  env: NodeJS.ProcessEnv = process.env,
): { personId: string; listId: string; itemId: string } | null {
  const personId = env[LIST_PRICE_LIVE_PERSON_ID_ENV]?.trim() ?? '';
  const listId = env[LIST_PRICE_LIVE_LIST_ID_ENV]?.trim() ?? '';
  const itemId = env[LIST_PRICE_LIVE_ITEM_ID_ENV]?.trim() ?? '';
  if (!personId || !listId || !itemId) return null;
  return { personId, listId, itemId };
}
