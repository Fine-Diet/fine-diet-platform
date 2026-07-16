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
