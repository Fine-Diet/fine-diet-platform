/**
 * Pure display helpers for list purchasing choices (safe for client bundles).
 */

import type { GroceryItem, GroceryListPurchasingChoice } from './types';
import {
  groundedGroceryMatchKey,
  unresolvedGroceryMatchKey,
} from './groceryMatchKeys';

export function activePurchasingMatchKeyForItem(
  item: GroceryItem,
  choice: GroceryListPurchasingChoice | null | undefined,
): string {
  if (choice && choice.status !== 'unresolved' && choice.match_key) {
    return choice.match_key;
  }
  if (choice?.food_object_id) {
    return groundedGroceryMatchKey(choice.food_object_id, item.unit);
  }
  if (item.food_object_id) {
    return groundedGroceryMatchKey(item.food_object_id, item.unit);
  }
  return unresolvedGroceryMatchKey(item.name, item.unit);
}

export function resolveListShoppingDisplayName(options: {
  item: GroceryItem;
  choice?: GroceryListPurchasingChoice | null;
}): string {
  const fromChoice = options.choice?.shopping_display_name?.trim();
  if (fromChoice) return fromChoice;
  const preferred = options.choice?.preferred_product?.trim();
  if (preferred) return preferred;
  return options.item.name;
}
