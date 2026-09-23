import type { GroceryHaulItem, GroceryListPriceObservation } from '../types';

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Whether a source-List price observation is safe to apply to the Haul's current
 * prepared product context (not merely the List's active choice).
 */
export function haulListQuoteCompatibleWithPreparedProduct(
  observation: Pick<
    GroceryListPriceObservation,
    'food_object_id' | 'product_title' | 'currency'
  >,
  item: Pick<GroceryHaulItem, 'selected_food_object_id' | 'product_title'>,
  haulCurrency: string,
): boolean {
  if (observation.currency !== haulCurrency) return false;

  const obsFood = observation.food_object_id;
  const haulFood = item.selected_food_object_id;

  if (haulFood && obsFood) return haulFood === obsFood;
  if (haulFood && !obsFood) return false;
  if (!haulFood && obsFood) return false;

  const haulTitle = normalizeTitle(item.product_title);
  const obsTitle = normalizeTitle(observation.product_title);
  if (!haulTitle || !obsTitle) return false;
  return haulTitle === obsTitle || obsTitle.includes(haulTitle) || haulTitle.includes(obsTitle);
}

export function assertHaulListQuoteCompatible(
  observation: Pick<
    GroceryListPriceObservation,
    'food_object_id' | 'product_title' | 'currency'
  >,
  item: Pick<GroceryHaulItem, 'selected_food_object_id' | 'product_title'>,
  haulCurrency: string,
): void {
  if (!haulListQuoteCompatibleWithPreparedProduct(observation, item, haulCurrency)) {
    throw new Error('Selected price observation is not compatible with this Haul product.');
  }
}
