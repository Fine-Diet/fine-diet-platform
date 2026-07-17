import type { FoodSearchResult } from '@/lib/food/types';

function cleanLabel(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

/**
 * Returns only explicit shopping-appropriate serving metadata already present
 * on the canonical food-search row. Numeric nutrition serving defaults such as
 * FoodObject.servingSizeG / servingDescription are intentionally not promoted
 * into package-size UI.
 */
export function resolveFoodSearchShoppingSizeLabel(
  result: Pick<FoodSearchResult, 'food' | 'offNormalization'>,
): string | null {
  const candidates = [
    cleanLabel(result.offNormalization?.serving_size_text),
    cleanLabel(result.food.householdServingText),
  ].filter((value): value is string => value != null);

  const unique: Record<string, string> = {};
  for (const value of candidates) {
    unique[value.toLowerCase()] = value;
  }
  const labels = Object.values(unique);
  return labels.length === 1 ? labels[0] : null;
}
