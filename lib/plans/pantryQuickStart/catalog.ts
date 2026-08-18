/**
 * Product-default Pantry Quick Start catalog.
 *
 * These are starting suggestions, never learned facts. Lookup queries are
 * hints for canonical food_objects resolution — they are not pantry truth.
 * Labels stay in the UI layer so analytics can use staple/category ids only.
 */

export const PANTRY_QUICK_START_POLICY_ID = 'pantry-quick-start.assumption' as const;
export const PANTRY_QUICK_START_POLICY_VERSION = 'v1' as const;

export const PANTRY_QUICK_START_DEFAULT_QUANTITY = 1;
export const PANTRY_QUICK_START_DEFAULT_UNIT = 'item';

export type PantryStapleCategoryId =
  | 'oils_and_fats'
  | 'seasonings'
  | 'grains_and_starches'
  | 'proteins'
  | 'produce_basics';

export interface PantryStapleDefinition {
  id: string;
  categoryId: PantryStapleCategoryId;
  lookupQuery: string;
  defaultQuantity: number;
  defaultUnit: string;
}

export interface PantryCategoryDefinition {
  id: PantryStapleCategoryId;
  stapleIds: readonly string[];
}

export const PANTRY_QUICK_START_CATEGORY_ORDER: readonly PantryStapleCategoryId[] = [
  'oils_and_fats',
  'seasonings',
  'grains_and_starches',
  'proteins',
  'produce_basics',
];

export const PANTRY_QUICK_START_CATEGORY_LABELS: Record<PantryStapleCategoryId, string> = {
  oils_and_fats: 'Oils and fats',
  seasonings: 'Seasonings',
  grains_and_starches: 'Grains and starches',
  proteins: 'Proteins',
  produce_basics: 'Produce basics',
};

export const PANTRY_QUICK_START_STAPLE_LABELS: Record<string, string> = {
  'oils.olive_oil': 'Olive oil',
  'oils.butter': 'Butter',
  'seasonings.salt': 'Salt',
  'seasonings.black_pepper': 'Black pepper',
  'seasonings.garlic': 'Garlic',
  'grains.rice': 'Rice',
  'grains.oats': 'Oats',
  'grains.pasta': 'Pasta',
  'proteins.eggs': 'Eggs',
  'proteins.canned_beans': 'Canned beans',
  'proteins.peanut_butter': 'Peanut butter',
  'produce.onions': 'Onions',
  'produce.lemons': 'Lemons',
};

const staple = (
  id: string,
  categoryId: PantryStapleCategoryId,
  lookupQuery: string,
): PantryStapleDefinition => ({
  id,
  categoryId,
  lookupQuery,
  defaultQuantity: PANTRY_QUICK_START_DEFAULT_QUANTITY,
  defaultUnit: PANTRY_QUICK_START_DEFAULT_UNIT,
});

export const PANTRY_QUICK_START_STAPLES: readonly PantryStapleDefinition[] = [
  staple('oils.olive_oil', 'oils_and_fats', 'olive oil'),
  staple('oils.butter', 'oils_and_fats', 'butter'),
  staple('seasonings.salt', 'seasonings', 'salt'),
  staple('seasonings.black_pepper', 'seasonings', 'black pepper'),
  staple('seasonings.garlic', 'seasonings', 'garlic'),
  staple('grains.rice', 'grains_and_starches', 'rice'),
  staple('grains.oats', 'grains_and_starches', 'oats'),
  staple('grains.pasta', 'grains_and_starches', 'pasta'),
  staple('proteins.eggs', 'proteins', 'eggs'),
  staple('proteins.canned_beans', 'proteins', 'canned beans'),
  staple('proteins.peanut_butter', 'proteins', 'peanut butter'),
  staple('produce.onions', 'produce_basics', 'onions'),
  staple('produce.lemons', 'produce_basics', 'lemons'),
];

export const PANTRY_QUICK_START_CATEGORIES: readonly PantryCategoryDefinition[] =
  PANTRY_QUICK_START_CATEGORY_ORDER.map((id) => ({
    id,
    stapleIds: PANTRY_QUICK_START_STAPLES.filter((row) => row.categoryId === id).map(
      (row) => row.id,
    ),
  }));

export function stapleById(id: string): PantryStapleDefinition | null {
  return PANTRY_QUICK_START_STAPLES.find((row) => row.id === id) ?? null;
}
