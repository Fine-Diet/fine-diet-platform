/**
 * Map persisted grocery price observations onto grocery list rows.
 */

import { groceryItemMatchKey } from './groceryMatchKeys';
import type { GroceryPriceObservation } from './groceryPricingTypes';
import type { GroceryItem } from './types';

export function observationsByMatchKeyFromList(
  observations: GroceryPriceObservation[],
): Record<string, GroceryPriceObservation> {
  return Object.fromEntries(observations.map((row) => [row.match_key, row]));
}

export function mapPriceObservationsToGroceryItems(
  items: GroceryItem[],
  observationsByMatchKey: Record<string, GroceryPriceObservation>,
): Record<string, GroceryPriceObservation> {
  const mapped: Record<string, GroceryPriceObservation> = {};
  for (const item of items) {
    const observation = observationsByMatchKey[groceryItemMatchKey(item)];
    if (observation) {
      mapped[item.id] = observation;
    }
  }
  return mapped;
}

/** Remove item-keyed client state when the row's match identity changes. */
export function detachPriceObservationForItem(
  observationsByItemId: Record<string, GroceryPriceObservation>,
  itemId: string,
): Record<string, GroceryPriceObservation> {
  if (!(itemId in observationsByItemId)) return observationsByItemId;
  const next = { ...observationsByItemId };
  delete next[itemId];
  return next;
}
