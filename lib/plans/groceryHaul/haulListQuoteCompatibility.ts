import type { GroceryHaulItem, GroceryListPriceObservation } from '../types';

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Strip trailing package/size tokens before title-only comparison (conservative). */
const PACKAGE_SIZE_TITLE_SUFFIX =
  /\s*,?\s*\d+(\.\d+)?\s*(oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|l|liter|liters|ct|count|pk|pack|ea)\.?\s*$/i;

export function conservativeHaulProductTitleKey(value: string | null | undefined): string {
  return normalizeTitle(value).replace(PACKAGE_SIZE_TITLE_SUFFIX, '').trim();
}

function titleOnlyQuoteCompatible(
  haulTitle: string | null | undefined,
  observationTitle: string | null | undefined,
): boolean {
  const haulNormalized = normalizeTitle(haulTitle);
  const obsNormalized = normalizeTitle(observationTitle);
  if (!haulNormalized || !obsNormalized) return false;
  if (haulNormalized === obsNormalized) return true;
  const haulKey = conservativeHaulProductTitleKey(haulTitle);
  const obsKey = conservativeHaulProductTitleKey(observationTitle);
  return haulKey !== '' && haulKey === obsKey;
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

  return titleOnlyQuoteCompatible(item.product_title, observation.product_title);
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
