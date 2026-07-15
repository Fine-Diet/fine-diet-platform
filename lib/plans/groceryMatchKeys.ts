/**
 * Shared deterministic grocery ingredient match keys.
 *
 * Grounded rows: canonical food identity + normalized unit.
 * Unresolved rows: exact normalized name + normalized unit.
 */

const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsp: 'tsp',
  tsps: 'tsp',
  gram: 'g',
  grams: 'g',
  g: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kg: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lb: 'lb',
  lbs: 'lb',
  serving: 'serving',
  servings: 'serving',
  item: 'item',
  items: 'item',
  each: 'item',
  ea: 'item',
};

export function normalizeGroceryUnit(unit: string | null | undefined): string {
  const raw = (unit ?? '').toLowerCase().trim().replace(/\.$/, '');
  return UNIT_ALIASES[raw] ?? raw;
}

export function groundedGroceryMatchKey(
  foodObjectId: string,
  unit: string | null | undefined,
): string {
  return `${foodObjectId}::${normalizeGroceryUnit(unit)}`;
}

export function unresolvedGroceryMatchKey(
  name: string,
  unit: string | null | undefined,
): string {
  return `${name.toLowerCase().trim()}::${normalizeGroceryUnit(unit)}`;
}

export function groceryItemMatchKey(input: {
  food_object_id: string | null;
  name: string;
  unit: string | null;
}): string {
  if (input.food_object_id) {
    return groundedGroceryMatchKey(input.food_object_id, input.unit);
  }
  return unresolvedGroceryMatchKey(input.name, input.unit);
}

export function derivedItemMatchKey(input: {
  food_object_id: string | null;
  name: string;
  unit: string | null;
}): string {
  return groceryItemMatchKey(input);
}
