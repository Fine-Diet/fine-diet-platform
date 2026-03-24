/**
 * V1 default intake profile resolution (Fine Diet spec).
 *
 * Single source of truth for default quantity/unit when logging from search, UPC, or custom food.
 * Conversion math remains in lib/units/convert (computeQuantities).
 */

import type { FoodObject, OffServingNormalization } from './types';
import { findMeasure, type Measure } from '../units/convert';

// ---------------------------------------------------------------------------
// V1 locked liquid volume constants (consumer-friendly; see spec §1.1)
// ---------------------------------------------------------------------------

/** ml per 1 US tsp (V1) */
export const V1_ML_PER_TSP = 5;
/** ml per 1 US tbsp (V1) */
export const V1_ML_PER_TBSP = 15;
/** ml per 1 cup (V1) */
export const V1_ML_PER_CUP = 240;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DefaultStrategy =
  | 'label_serving'
  | 'household_measure'
  | 'volume'
  | 'count_item'
  | 'weight'
  | 'per_100g_fallback'
  | 'unknown';

export type UnitConfidence =
  | 'exact'
  | 'label_based'
  | 'food_specific'
  | 'generic_fallback'
  | 'unknown';

export interface DefaultIntakeProfile {
  strategy: DefaultStrategy;
  defaultQuantity: number;
  defaultUnit: string;
  servingLabel: string | null;
  unitConfidence: UnitConfidence;
  /** Dev/debug; optional UI later */
  rationale?: string;
}

/**
 * Context for default resolution — not from search ranking.
 * Pass OFF normalization when logging an OFF search result.
 */
export interface DefaultIntakeContext {
  offNormalization?: OffServingNormalization | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMeasures(m: FoodObject['measures']): Measure[] | null {
  return m && m.length > 0 ? m : null;
}

function isGramUnit(servingUnit: string | null | undefined): boolean {
  const u = (servingUnit || '').toLowerCase().trim();
  return u === 'g' || u === 'gram' || u === 'grams';
}

function isMlUnit(servingUnit: string | null | undefined): boolean {
  const u = (servingUnit || '').toLowerCase().trim();
  return u === 'ml' || u === 'milliliter' || u === 'milliliters';
}

/** Gram-native branded: USDA branded dataset + gram serving (spec §1.6) */
function isGramNativeBranded(food: FoodObject): boolean {
  return food.sourceDataset === 'branded' && isGramUnit(food.servingUnit) && food.servingSizeG > 0;
}

const VOLUME_HINT =
  /\b(cup|ml|fl\s*oz|floz|fluid\s*oz|litre|liter|l)\b/i;
const LIQUID_HINT =
  /\b(milk|juice|broth|beverage|drink|creamer|dressing|water)\b/i;

function combinedLabelText(food: FoodObject): string {
  return `${food.householdServingText || ''} ${food.servingDescription || ''}`.toLowerCase();
}

/** Trusted volume-style label for milk/juice/etc.; includes product name liquid hints for cup defaults */
function volumeLikeText(food: FoodObject): boolean {
  const t = combinedLabelText(food);
  if (VOLUME_HINT.test(t) || LIQUID_HINT.test(t)) return true;
  const name = (food.canonicalName || '').toLowerCase();
  return LIQUID_HINT.test(name);
}

function labelMentionsUnit(food: FoodObject, ...tokens: string[]): boolean {
  const t = combinedLabelText(food);
  return tokens.some((x) => t.includes(x.toLowerCase()));
}

/**
 * Household / count eligibility: measure row with grams, OR label clearly names unit (spec §5.1).
 */
function hasTrustedMeasureWithGrams(food: FoodObject, unit: string): boolean {
  const m = findMeasure(unit, toMeasures(food.measures));
  return !!(m && typeof m.grams === 'number' && m.grams > 0);
}

function householdOrCountEligible(food: FoodObject, unit: string): boolean {
  if (hasTrustedMeasureWithGrams(food, unit)) return true;
  const synonyms: Record<string, string[]> = {
    tablespoon: ['tablespoon', 'tbsp', 'tbs'],
    teaspoon: ['teaspoon', 'tsp'],
    cup: ['cup'],
    slice: ['slice'],
    bar: ['bar'],
    container: ['container'],
    cookie: ['cookie'],
    scoop: ['scoop'],
    bottle: ['bottle'],
    packet: ['packet'],
    stick: ['stick'],
    can: ['can'],
    oz: ['oz', 'ounce'],
  };
  const keys = synonyms[unit.toLowerCase()] || [unit.toLowerCase()];
  return keys.some((k) => labelMentionsUnit(food, k));
}

function per100gFallback(rationale: string): DefaultIntakeProfile {
  return {
    strategy: 'per_100g_fallback',
    defaultQuantity: 100,
    defaultUnit: 'g',
    servingLabel: null,
    unitConfidence: 'generic_fallback',
    rationale,
  };
}

function unknownProfile(rationale: string): DefaultIntakeProfile {
  return {
    strategy: 'unknown',
    defaultQuantity: 1,
    defaultUnit: 'serving',
    servingLabel: null,
    unitConfidence: 'unknown',
    rationale,
  };
}

// ---------------------------------------------------------------------------
// OFF (conservative)
// ---------------------------------------------------------------------------

function resolveOffProfile(food: FoodObject, ctx: DefaultIntakeContext): DefaultIntakeProfile {
  const n = ctx.offNormalization;
  if (!n) {
    return per100gFallback('OFF item without offNormalization in ctx');
  }

  const weak =
    n.serving_confidence === 'low' ||
    (n.serving_size_g == null && n.normalization_status === 'raw');

  if (weak) {
    return per100gFallback('OFF weak serving metadata');
  }

  if (typeof n.serving_size_g === 'number' && n.serving_size_g > 0) {
    return {
      strategy: 'weight',
      defaultQuantity: n.serving_size_g,
      defaultUnit: 'g',
      servingLabel: null,
      unitConfidence: n.serving_confidence === 'high' ? 'label_based' : 'generic_fallback',
      rationale: 'OFF parsed serving_size_g',
    };
  }

  return per100gFallback('OFF no usable parsed serving');
}

// ---------------------------------------------------------------------------
// Non-OFF resolution
// ---------------------------------------------------------------------------

function tryLabelServingNonGram(food: FoodObject): DefaultIntakeProfile | null {
  const ssg = food.servingSizeG;
  if (typeof ssg !== 'number' || ssg <= 0) return null;

  if (isGramUnit(food.servingUnit)) return null;

  if (isMlUnit(food.servingUnit)) {
    return {
      strategy: 'label_serving',
      defaultQuantity: 1,
      defaultUnit: 'serving',
      servingLabel: null,
      unitConfidence: 'label_based',
      rationale: 'ml label — abstract serving',
    };
  }

  const su = (food.servingUnit || 'serving').toLowerCase().trim();
  if (
    su === '' ||
    su === 'serving' ||
    su === 'servings' ||
    su === 'container' ||
    su === 'piece' ||
    su === 'pieces'
  ) {
    return {
      strategy: 'label_serving',
      defaultQuantity: 1,
      defaultUnit: 'serving',
      servingLabel: null,
      unitConfidence: 'label_based',
      rationale: 'non-gram label serving',
    };
  }

  return null;
}

function tryVolume(food: FoodObject): DefaultIntakeProfile | null {
  const measures = toMeasures(food.measures);
  if (!measures) return null;

  const cup = findMeasure('cup', measures);
  if (!cup || !(cup.grams > 0)) return null;

  if (!volumeLikeText(food) && !labelMentionsUnit(food, 'cup')) return null;

  return {
    strategy: 'volume',
    defaultQuantity: 1,
    defaultUnit: 'cup',
    servingLabel: null,
    unitConfidence: hasTrustedMeasureWithGrams(food, 'cup') ? 'label_based' : 'generic_fallback',
    rationale: 'liquid/pourable volume default (cup)',
  };
}

function tryHouseholdMeasure(food: FoodObject): DefaultIntakeProfile | null {
  for (const unit of ['tablespoon', 'teaspoon'] as const) {
    if (!householdOrCountEligible(food, unit)) continue;
    return {
      strategy: 'household_measure',
      defaultQuantity: 1,
      defaultUnit: unit,
      servingLabel: null,
      unitConfidence: hasTrustedMeasureWithGrams(food, unit) ? 'exact' : 'label_based',
      rationale: `household default (${unit})`,
    };
  }
  // Dry / non-volume cup (baking flour, etc.) — not handled by volume branch
  if (
    householdOrCountEligible(food, 'cup') &&
    !volumeLikeText(food)
  ) {
    return {
      strategy: 'household_measure',
      defaultQuantity: 1,
      defaultUnit: 'cup',
      servingLabel: null,
      unitConfidence: hasTrustedMeasureWithGrams(food, 'cup') ? 'exact' : 'label_based',
      rationale: 'household default (cup, dry)',
    };
  }
  return null;
}

const COUNT_TRY_ORDER = [
  'slice',
  'bar',
  'container',
  'cookie',
  'scoop',
  'bottle',
  'packet',
  'stick',
  'can',
] as const;

function tryCountItem(food: FoodObject): DefaultIntakeProfile | null {
  for (const unit of COUNT_TRY_ORDER) {
    if (!householdOrCountEligible(food, unit)) continue;
    return {
      strategy: 'count_item',
      defaultQuantity: 1,
      defaultUnit: unit,
      servingLabel: null,
      unitConfidence: hasTrustedMeasureWithGrams(food, unit) ? 'exact' : 'label_based',
      rationale: `count/item default (${unit})`,
    };
  }
  return null;
}

function tryWeightGrams(food: FoodObject): DefaultIntakeProfile | null {
  const ssg = food.servingSizeG;
  if (typeof ssg !== 'number' || ssg <= 0) return null;
  if (!isGramUnit(food.servingUnit)) return null;

  return {
    strategy: 'weight',
    defaultQuantity: ssg,
    defaultUnit: 'g',
    servingLabel: null,
    unitConfidence: 'label_based',
    rationale: isGramNativeBranded(food)
      ? 'gram-native branded (§1.6)'
      : 'gram-native serving',
  };
}

function resolveUserCustom(food: FoodObject): DefaultIntakeProfile | null {
  if (!food.personId) return null;

  const ssg = food.servingSizeG;
  if (typeof ssg === 'number' && ssg > 0 && isGramUnit(food.servingUnit)) {
    return {
      strategy: 'weight',
      defaultQuantity: ssg,
      defaultUnit: 'g',
      servingLabel: null,
      unitConfidence: 'exact',
      rationale: 'user custom food (grams)',
    };
  }

  return {
    strategy: 'label_serving',
    defaultQuantity: 1,
    defaultUnit: 'serving',
    servingLabel: null,
    unitConfidence: 'exact',
    rationale: 'user custom food',
  };
}

function resolveNonOff(food: FoodObject): DefaultIntakeProfile {
  const custom = resolveUserCustom(food);
  if (custom) return custom;

  const label = tryLabelServingNonGram(food);
  if (label) return label;

  const vol = tryVolume(food);
  if (vol) return vol;

  const hh = tryHouseholdMeasure(food);
  if (hh) return hh;

  const count = tryCountItem(food);
  if (count) return count;

  const w = tryWeightGrams(food);
  if (w) return w;

  if (typeof food.servingSizeG === 'number' && food.servingSizeG > 0) {
    return {
      strategy: 'label_serving',
      defaultQuantity: 1,
      defaultUnit: 'serving',
      servingLabel: null,
      unitConfidence: 'generic_fallback',
      rationale: 'fallback 1 serving with known servingSizeG',
    };
  }

  return unknownProfile('insufficient serving data');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the default intake profile for a food. Single source of truth for V1 defaults.
 *
 * `qtyOverride` at log time must multiply this profile’s “one log” (defaultQuantity × defaultUnit).
 */
export function resolveDefaultIntakeProfile(
  food: FoodObject,
  ctx: DefaultIntakeContext = {},
): DefaultIntakeProfile {
  if (food.sourceProvider === 'off') {
    return resolveOffProfile(food, ctx);
  }
  return resolveNonOff(food);
}

/**
 * @deprecated Use resolveDefaultIntakeProfile. Thin wrapper for legacy call sites.
 */
export function getDefaultIntakeQuantityAndUnit(
  food: FoodObject,
  ctx?: DefaultIntakeContext,
): { quantity: number; unit: string } {
  const p = resolveDefaultIntakeProfile(food, ctx ?? {});
  return { quantity: p.defaultQuantity, unit: p.defaultUnit };
}
