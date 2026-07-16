/**
 * Copy SerpAPI offer package metadata into empty shopping-detail fields on confirm.
 */

import { groceryItemMatchKey } from './groceryMatchKeys';
import {
  buildShoppingOverridePayloadAfterPackageMerge,
  buildShoppingPackageMergeFromOffer,
  type OfferPackageDetails,
} from './groceryPricePackageDetails';
import {
  getShoppingOverrideByMatchKey,
  saveShoppingOverride,
  type GroceryListScope,
} from './groceryShoppingOverrideStore';
import type { GroceryItem, GroceryShoppingOverride } from './types';

export async function applyOfferPackageToShoppingDetails(options: {
  personId: string;
  item: GroceryItem;
  scope: GroceryListScope;
  offer: OfferPackageDetails;
}): Promise<GroceryShoppingOverride | null> {
  const { personId, item, scope, offer } = options;
  const matchKey = groceryItemMatchKey(item);
  const existing = await getShoppingOverrideByMatchKey(personId, scope, matchKey);
  const merged = buildShoppingPackageMergeFromOffer(offer, existing);
  if (!merged) {
    return existing;
  }

  const payload = buildShoppingOverridePayloadAfterPackageMerge(item, existing, merged);
  payload.match_key = matchKey;

  return saveShoppingOverride(personId, scope, payload);
}
