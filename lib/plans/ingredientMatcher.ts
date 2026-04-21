/**
 * Plans — Trusted Ingredient Matcher (Packet 6)
 *
 * Purpose
 * -------
 * Given a parsed recipe ingredient (name + quantity + unit + prep note),
 * attempt to ground its nutrition in the platform's trusted food-object
 * corpus before falling back to the legacy heuristic guess table.
 *
 * Contract (locked by Packet 6 §3a "Match hierarchy"):
 *
 *   1. Trusted food-object match      → match_status='matched',  confidence='high'
 *   2. Partial/approximate match      → match_status='partial',  confidence='medium'
 *   3. Heuristic guess-table fallback → match_status='guessed',  confidence='low'
 *   4. Conservative default fallback  → match_status='none',     confidence='low'
 *
 * Hard constraints
 * ----------------
 * - The fixed NDS model is NOT revised here.
 * - Food trust and NDS confidence remain distinct concepts.
 * - We prefer conservative fallback + honest low confidence over false
 *   certainty. Sauces, branded products, and specialty foods are not
 *   aggressively matched to unrelated generic entries.
 * - Matcher is pluggable: the actual DB query lives behind a small
 *   `IngredientLookup` dependency so the pure matching/scaling logic is
 *   unit-testable without a live Supabase.
 *
 * Unit/quantity grounding
 * -----------------------
 * When a trusted food_object exposes a reference `serving_size_g`, we
 * convert the user's quantity+unit into grams and scale the per-serving
 * nutrition by `grams / serving_size_g`. If we can't convert to grams
 * (e.g. "1 handful"), we fall back to the per-serving value as-is
 * multiplied by `quantity_value` with a conservative cap, and mark
 * confidence as medium/low.
 */

import type {
  ImportedMealDraftIngredient,
  IngredientMatchEntry,
  NutritionEstimate,
  NutritionEstimatePerServing,
  PlannedMealPayload,
} from './types';

// ============================================================================
// Lookup interface — pluggable so the pure matcher can be unit-tested
// without a DB.
// ============================================================================

export interface FoodObjectLite {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  aliases: string[] | null;
  serving_size_g: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  source_provider: string | null;
  source_type: string | null;
  is_verified: boolean;
  nutrient_confidence: 'high' | 'medium' | 'low' | null;
}

export interface IngredientLookup {
  /**
   * Return a small candidate set of food_objects plausibly matching
   * the given normalized query. The matcher does its own scoring, so
   * this only needs to be recall-friendly — 10-20 candidates is plenty.
   */
  findCandidates(normalizedQuery: string): Promise<FoodObjectLite[]>;
}

// ============================================================================
// Normalization + tokenization
// ============================================================================

/**
 * Common prep / cooking modifiers that should be stripped before
 * matching. Ingredient labels like "fresh chicken breast, diced" should
 * match a `chicken breast` food_object, not fail because of the
 * descriptor.
 */
const PREP_MODIFIERS = new Set([
  'fresh',
  'cooked',
  'raw',
  'dried',
  'frozen',
  'canned',
  'boiled',
  'baked',
  'grilled',
  'roasted',
  'steamed',
  'fried',
  'whole',
  'sliced',
  'chopped',
  'diced',
  'mashed',
  'peeled',
  'unpeeled',
  'plain',
  'unsweetened',
  'sweetened',
  'salted',
  'unsalted',
  'organic',
  'ripe',
  'large',
  'medium',
  'small',
  'extra',
  'finely',
  'coarsely',
  'lightly',
  'toasted',
  'minced',
  'shredded',
  'grated',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'with',
  'in',
  'for',
  'to',
  'and',
  'or',
  'per',
  'fat',
  'free',
  'low',
  'lite',
  'light',
]);

export function normalizeIngredientName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeIngredientName(s)
    .split(/\s+/)
    .filter((t) => t.length > 0 && !PREP_MODIFIERS.has(t) && !STOP_WORDS.has(t));
}

/**
 * Canonical query string used for the DB lookup. Strips prep modifiers
 * so the DB side doesn't reject a plausible match on pure adjective
 * noise.
 */
export function canonicalQueryFor(ing: ImportedMealDraftIngredient): string {
  const source = ing.normalized_name ?? ing.raw_text ?? '';
  return tokenize(source).join(' ');
}

// ============================================================================
// Scoring
// ============================================================================

interface ScoredCandidate {
  food: FoodObjectLite;
  score: number;
  reason: 'exact_canonical' | 'exact_alias' | 'token_subset' | 'token_overlap';
  tokenOverlap: number; // shared tokens between ingredient and food name
}

function scoreCandidate(
  queryTokens: string[],
  food: FoodObjectLite,
): ScoredCandidate | null {
  if (queryTokens.length === 0) return null;
  const queryStr = queryTokens.join(' ');
  const canonical = normalizeIngredientName(food.canonical_name);
  const canonicalTokens = tokenize(food.canonical_name);
  const aliases = (food.aliases ?? []).map((a) => normalizeIngredientName(a));

  // 1. Exact canonical or alias match → highest score
  if (canonical === queryStr) {
    return { food, score: 1000, reason: 'exact_canonical', tokenOverlap: queryTokens.length };
  }
  if (aliases.some((a) => a === queryStr)) {
    return { food, score: 900, reason: 'exact_alias', tokenOverlap: queryTokens.length };
  }

  // 2. Ingredient tokens are a complete subset of canonical tokens
  // e.g. "chicken" ⊂ "chicken breast, raw"
  const canonicalTokenSet = new Set(canonicalTokens);
  const querySubsetInCanonical = queryTokens.every((t) => canonicalTokenSet.has(t));
  if (querySubsetInCanonical && queryTokens.length > 0) {
    const overlap = queryTokens.length;
    const lengthPenalty = Math.max(0, canonicalTokens.length - queryTokens.length) * 20;
    return {
      food,
      score: 700 - lengthPenalty,
      reason: 'token_subset',
      tokenOverlap: overlap,
    };
  }

  // 3. Canonical tokens are a complete subset of ingredient tokens
  // e.g. "greek yogurt" query vs "yogurt" canonical
  const querySet = new Set(queryTokens);
  const canonicalSubsetInQuery = canonicalTokens.every((t) => querySet.has(t));
  if (canonicalSubsetInQuery && canonicalTokens.length > 0) {
    const overlap = canonicalTokens.length;
    return {
      food,
      score: 500,
      reason: 'token_subset',
      tokenOverlap: overlap,
    };
  }

  // 4. General token overlap — require at least one meaningful shared token
  let shared = 0;
  for (const t of queryTokens) if (canonicalTokenSet.has(t)) shared++;
  if (shared === 0) return null;

  const ratio = shared / Math.max(queryTokens.length, canonicalTokens.length);
  if (ratio < 0.5) return null;

  return {
    food,
    score: Math.round(300 * ratio),
    reason: 'token_overlap',
    tokenOverlap: shared,
  };
}

function pickBestCandidate(
  queryTokens: string[],
  candidates: FoodObjectLite[],
): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;
  for (const food of candidates) {
    const scored = scoreCandidate(queryTokens, food);
    if (!scored) continue;
    // Tie-break: prefer verified + higher nutrient confidence
    if (!best || scored.score > best.score) {
      best = scored;
    } else if (scored.score === best.score) {
      const a = scored.food;
      const b = best.food;
      if (a.is_verified && !b.is_verified) best = scored;
      else if (
        confidenceRank(a.nutrient_confidence) > confidenceRank(b.nutrient_confidence)
      ) {
        best = scored;
      }
    }
  }
  return best;
}

function confidenceRank(c: FoodObjectLite['nutrient_confidence']): number {
  switch (c) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

// ============================================================================
// Unit → grams conversion (used when a trusted food_object grounds us
// against a per-serving-by-grams basis)
// ============================================================================

/**
 * Approximate grams for a `quantity_value` + `quantity_unit`. Returns
 * null when we can't ground the unit in mass. The caller then falls
 * back to a quantity-only scaling with lower confidence.
 *
 * Values below are intentionally conservative; they are meant to map
 * common recipe units to a grams basis, not to rival a proper
 * density-aware converter.
 */
export function unitToGrams(
  quantity_value: number | null,
  quantity_unit: string | null,
): number | null {
  if (quantity_value === null || !Number.isFinite(quantity_value) || quantity_value <= 0) {
    return null;
  }
  const unit = (quantity_unit ?? '').toLowerCase().trim().replace(/\.$/, '');
  if (!unit) return null;

  if (/^(g|gram|grams)$/.test(unit)) return quantity_value;
  if (/^(kg|kilogram|kilograms)$/.test(unit)) return quantity_value * 1000;
  if (/^(oz|ounce|ounces)$/.test(unit)) return quantity_value * 28.35;
  if (/^(lb|lbs|pound|pounds)$/.test(unit)) return quantity_value * 453.59;
  if (/^(ml|milliliter|milliliters)$/.test(unit)) return quantity_value; // ~1g/ml approximation
  if (/^(l|liter|liters)$/.test(unit)) return quantity_value * 1000;
  if (/^(cup|cups|c)$/.test(unit)) return quantity_value * 240;
  if (/^(tbsp|tablespoon|tablespoons|tbl|tbs)$/.test(unit)) return quantity_value * 15;
  if (/^(tsp|teaspoon|teaspoons|ts)$/.test(unit)) return quantity_value * 5;
  if (/^(pinch|pinches|dash)$/.test(unit)) return quantity_value * 0.5;
  // piece / slice / clove / egg / each — unknown mass → null (fall back)
  return null;
}

// ============================================================================
// Legacy heuristic guess-table fallback (kept for Tier 3 of the match
// hierarchy — unchanged numbers from Packet 4 behaviour).
// ============================================================================

interface MacroGuess {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

const DEFAULT_GUESS: MacroGuess = {
  calories: 50,
  protein_g: 2,
  carbs_g: 6,
  fat_g: 2,
  fiber_g: 1,
};

interface GuessTableRow {
  match: RegExp;
  label: string;
  guess: MacroGuess;
}

const GUESS_TABLE: GuessTableRow[] = [
  { match: /chicken|turkey|poultry/, label: 'poultry', guess: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 } },
  { match: /beef|steak|burger/, label: 'beef', guess: { calories: 250, protein_g: 26, carbs_g: 0, fat_g: 17, fiber_g: 0 } },
  { match: /pork|bacon|ham/, label: 'pork', guess: { calories: 242, protein_g: 27, carbs_g: 0, fat_g: 14, fiber_g: 0 } },
  { match: /salmon|tuna|fish/, label: 'fish', guess: { calories: 200, protein_g: 25, carbs_g: 0, fat_g: 10, fiber_g: 0 } },
  { match: /shrimp|prawn/, label: 'shrimp', guess: { calories: 100, protein_g: 20, carbs_g: 1, fat_g: 1, fiber_g: 0 } },
  { match: /egg\b/, label: 'egg', guess: { calories: 70, protein_g: 6, carbs_g: 1, fat_g: 5, fiber_g: 0 } },
  { match: /yogurt|yoghurt/, label: 'yogurt', guess: { calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2, fiber_g: 0 } },
  { match: /milk/, label: 'milk', guess: { calories: 60, protein_g: 3, carbs_g: 5, fat_g: 3, fiber_g: 0 } },
  { match: /cheese/, label: 'cheese', guess: { calories: 110, protein_g: 7, carbs_g: 1, fat_g: 9, fiber_g: 0 } },
  { match: /rice/, label: 'rice', guess: { calories: 130, protein_g: 3, carbs_g: 28, fat_g: 0, fiber_g: 0 } },
  { match: /pasta|noodle|spaghetti/, label: 'pasta', guess: { calories: 150, protein_g: 5, carbs_g: 30, fat_g: 1, fiber_g: 2 } },
  { match: /bread|toast|roll|bun/, label: 'bread', guess: { calories: 80, protein_g: 3, carbs_g: 15, fat_g: 1, fiber_g: 1 } },
  { match: /oat|oatmeal|granola|muesli/, label: 'oats', guess: { calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4 } },
  { match: /potato/, label: 'potato', guess: { calories: 160, protein_g: 4, carbs_g: 37, fat_g: 0, fiber_g: 4 } },
  { match: /oil|olive/, label: 'oil', guess: { calories: 120, protein_g: 0, carbs_g: 0, fat_g: 14, fiber_g: 0 } },
  { match: /butter/, label: 'butter', guess: { calories: 100, protein_g: 0, carbs_g: 0, fat_g: 11, fiber_g: 0 } },
  { match: /avocado/, label: 'avocado', guess: { calories: 160, protein_g: 2, carbs_g: 9, fat_g: 15, fiber_g: 7 } },
  { match: /almond|walnut|pecan|cashew|nut/, label: 'nut', guess: { calories: 180, protein_g: 6, carbs_g: 6, fat_g: 16, fiber_g: 3 } },
  { match: /banana/, label: 'banana', guess: { calories: 105, protein_g: 1, carbs_g: 27, fat_g: 0, fiber_g: 3 } },
  { match: /berr|blueberr|strawberr|raspberr/, label: 'berry', guess: { calories: 60, protein_g: 1, carbs_g: 14, fat_g: 0, fiber_g: 3 } },
  { match: /apple|pear/, label: 'apple/pear', guess: { calories: 95, protein_g: 0, carbs_g: 25, fat_g: 0, fiber_g: 4 } },
  { match: /broccoli|cauliflower|spinach|kale|lettuce|arugula|green/, label: 'leafy/cruciferous', guess: { calories: 30, protein_g: 2, carbs_g: 5, fat_g: 0, fiber_g: 2 } },
  { match: /tomato/, label: 'tomato', guess: { calories: 25, protein_g: 1, carbs_g: 5, fat_g: 0, fiber_g: 2 } },
  { match: /onion|shallot/, label: 'onion', guess: { calories: 40, protein_g: 1, carbs_g: 9, fat_g: 0, fiber_g: 2 } },
  { match: /garlic/, label: 'garlic', guess: { calories: 5, protein_g: 0, carbs_g: 1, fat_g: 0, fiber_g: 0 } },
  { match: /beans?|lentil|chickpea/, label: 'legume', guess: { calories: 180, protein_g: 12, carbs_g: 30, fat_g: 1, fiber_g: 8 } },
  { match: /tofu|tempeh/, label: 'tofu/tempeh', guess: { calories: 140, protein_g: 15, carbs_g: 3, fat_g: 8, fiber_g: 1 } },
  { match: /sugar|honey|syrup/, label: 'sugar/syrup', guess: { calories: 50, protein_g: 0, carbs_g: 13, fat_g: 0, fiber_g: 0 } },
];

function guessFromName(name: string | null): { guess: MacroGuess; label: string | null } {
  if (!name) return { guess: { ...DEFAULT_GUESS }, label: null };
  const lc = name.toLowerCase();
  for (const row of GUESS_TABLE) {
    if (row.match.test(lc)) return { guess: { ...row.guess }, label: row.label };
  }
  return { guess: { ...DEFAULT_GUESS }, label: null };
}

/**
 * Scale a GUESS_TABLE row by quantity + unit. These multipliers target
 * a ~100g-serving baseline for weights and a conservative "typical
 * portion" baseline for volumes — unchanged from Packet 4 post-QA.
 */
function scaleGuessByQuantity(
  guess: MacroGuess,
  quantity_value: number | null,
  quantity_unit: string | null,
): MacroGuess {
  if (quantity_value === null || quantity_value <= 0) return guess;
  const per = (quantity_unit ?? '').toLowerCase();
  let multiplier = quantity_value;
  if (
    per === '' ||
    /^(piece|pieces|pcs|slice|slices|each|egg|eggs|whole)$/.test(per)
  ) {
    // Packet 24: `whole` is the count-inferred pseudo-unit emitted by
    // the hardened phrase parser when a quantity was present but no
    // unit could be identified (`1 red pepper`, `2 carrots`). Treat it
    // identically to piece/slice/each so count-based language does not
    // silently inflate into a volume-unit multiplier.
    multiplier = quantity_value;
  } else if (/^(cup|cups|c)$/.test(per)) {
    multiplier = quantity_value * 1.5;
  } else if (/^(tablespoon|tablespoons|tbsp|tbl|tbs)\.?$/.test(per)) {
    multiplier = quantity_value * 0.15;
  } else if (/^(teaspoon|teaspoons|tsp|ts)\.?$/.test(per)) {
    multiplier = quantity_value * 0.05;
  } else if (/^(ounce|ounces|oz)$/.test(per)) {
    multiplier = quantity_value * 0.28;
  } else if (/^(pound|pounds|lb|lbs)$/.test(per)) {
    multiplier = quantity_value * 4.54;
  } else if (/^(gram|grams|g)$/.test(per)) {
    multiplier = quantity_value / 100;
  } else if (/^(kilogram|kilograms|kg)$/.test(per)) {
    multiplier = quantity_value * 10;
  } else if (/^(milliliter|milliliters|ml)$/.test(per)) {
    multiplier = quantity_value / 100;
  } else if (/^(liter|liters|l)$/.test(per)) {
    multiplier = quantity_value * 10;
  } else if (/^(clove|cloves)$/.test(per)) {
    multiplier = quantity_value * 0.1;
  } else if (/^(pinch|pinches|dash)$/.test(per)) {
    multiplier = quantity_value * 0.02;
  }
  return {
    calories: guess.calories * multiplier,
    protein_g: guess.protein_g * multiplier,
    carbs_g: guess.carbs_g * multiplier,
    fat_g: guess.fat_g * multiplier,
    fiber_g: guess.fiber_g * multiplier,
  };
}

// ============================================================================
// Core: match a single ingredient
// ============================================================================

export interface IngredientMatchResult {
  /** Per-serving IngredientMatchRecord for `ingredient_match_json`. */
  record: IngredientMatchEntry;
  /** Per-item totals BEFORE per-serving division (full recipe share). */
  total_contribution: MacroGuess;
  /** Per-serving nutrition contribution, already divided by servings. */
  per_serving_contribution: MacroGuess;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeServingDivision<T extends MacroGuess>(total: T, servings: number): MacroGuess {
  const svg = servings > 0 ? servings : 1;
  return {
    calories: Math.round(total.calories / svg),
    protein_g: round1(total.protein_g / svg),
    carbs_g: round1(total.carbs_g / svg),
    fat_g: round1(total.fat_g / svg),
    fiber_g: round1(total.fiber_g / svg),
  };
}

/**
 * Synchronous heuristic-only matcher (Tiers 3 & 4 of the Packet 6
 * hierarchy). Produces a Packet 6 IngredientMatchRecord without
 * touching the DB. Used by the pure `runRecipeImport` parser path and
 * as the deterministic fallback when a lookup is unavailable.
 */
export function matchIngredientHeuristicOnly(
  ing: ImportedMealDraftIngredient,
  index: number,
  servings: number | null,
): IngredientMatchResult {
  const svg = servings && servings > 0 ? servings : 1;
  const { guess, label } = guessFromName(ing.normalized_name ?? ing.raw_text);
  const scaled = scaleGuessByQuantity(guess, ing.quantity_value, ing.quantity_unit);
  const per_serving = computeServingDivision(scaled, svg);

  const isDefault = label === null;
  const status: IngredientMatchEntry['match_status'] = isDefault ? 'none' : 'guessed';
  const source_kind: IngredientMatchEntry['source_kind'] = isDefault
    ? 'default_guess'
    : 'heuristic_guess';

  const unitLabel =
    ing.quantity_unit === 'whole'
      ? 'whole item(s)'
      : ing.quantity_unit ?? 'serving(s)';
  const approxNote =
    ing.quantity_source === 'count_inferred'
      ? ' (count-inferred — size of a typical whole item is approximate)'
      : ing.quantity_source === 'range_midpoint'
        ? ' (range midpoint — quantity was a range in the source)'
        : '';
  const explanation = isDefault
    ? 'No heuristic rule recognized this ingredient. Using a conservative default estimate — edit to add a trusted source.'
    : `Heuristic fallback: "${label}" row scaled by ${ing.quantity_value ?? 1} ${unitLabel}${approxNote}. No trusted food-object match attempted in this path.`;

  return {
    record: {
      ingredient_index: index,
      raw_text: ing.raw_text,
      normalized_name: ing.normalized_name ?? null,
      quantity_value: ing.quantity_value,
      quantity_unit: ing.quantity_unit,
      preparation_note: ing.preparation_note ?? null,
      match_status: status,
      confidence: 'low',
      source_kind,
      source_id: null,
      source_label: isDefault ? 'Default estimate' : `Heuristic: ${label}`,
      per_serving_estimate: {
        calories: per_serving.calories,
        protein_g: per_serving.protein_g,
        carbs_g: per_serving.carbs_g,
        fat_g: per_serving.fat_g,
      },
      explanation,
      food_object_id: null,
      match_confidence: isDefault ? 'none' : 'low',
      match_source: 'none',
      notes: explanation,
    },
    total_contribution: scaled,
    per_serving_contribution: per_serving,
  };
}

export function matchIngredientsHeuristicOnly(
  ingredients: ImportedMealDraftIngredient[],
  servings: number | null,
): IngredientsMatchedResult {
  const results: IngredientMatchResult[] = ingredients.map((ing, i) =>
    matchIngredientHeuristicOnly(ing, i, servings),
  );
  return aggregateResults(
    results,
    servings,
    ingredients.length,
    collectParseSignals(ingredients),
  );
}

export async function matchIngredient(
  ing: ImportedMealDraftIngredient,
  index: number,
  servings: number | null,
  lookup: IngredientLookup,
  override?: IngredientMatchOverride | null,
): Promise<IngredientMatchResult> {
  const svg = servings && servings > 0 ? servings : 1;
  const nameQuery = canonicalQueryFor(ing);
  const queryTokens = tokenize(ing.normalized_name ?? ing.raw_text ?? '');

  // --- Packet 28: honour user-choice overrides before scoring ---
  //
  // When the caller supplies an `applied` override with a locked
  // `source_id`, we resolve the food-object directly via the lookup
  // and ground nutrition against it. The matcher does not re-score
  // alternatives for this row — the user explicitly committed this
  // source, so the UI's "Trusted source applied" label must hold
  // across saves and edits.
  if (override?.user_choice === 'applied' && override.source_id) {
    const lockedFood = await resolveFoodObjectById(override.source_id, lookup, nameQuery);
    if (lockedFood && hasUsableFoodObjectNutrition(lockedFood)) {
      const lockedScored: ScoredCandidate = {
        food: lockedFood,
        // `score` and `reason` here are synthetic: the chosen source
        // bypasses scoring. We set score ≥ 700 so `groundAgainstFoodObject`
        // resolves match_status='matched' and preserves the user's
        // committed-source label.
        score: 900,
        reason: 'exact_alias',
        tokenOverlap: 0,
      };
      const grounded = groundAgainstFoodObject(ing, lockedScored);
      if (grounded) {
        const per_serving = computeServingDivision(grounded.total, svg);
        const explanation =
          `User-applied trusted source. Nutrition scaled from ` +
          `"${formatFoodLabel(lockedFood)}" (${grounded.explanation.replace(/^Matched to trusted food-object [^()]+\(/, '').replace(/\)\.\s*Nutrition scaled from the food-object's per-serving values\.$/, ')')}).`;
        return {
          record: {
            ingredient_index: index,
            raw_text: ing.raw_text,
            normalized_name: ing.normalized_name ?? null,
            quantity_value: ing.quantity_value,
            quantity_unit: ing.quantity_unit,
            preparation_note: ing.preparation_note ?? null,
            match_status: 'matched',
            confidence: grounded.confidence,
            source_kind: 'food_object',
            source_id: lockedFood.id,
            source_label: formatFoodLabel(lockedFood),
            per_serving_estimate: {
              calories: per_serving.calories,
              protein_g: per_serving.protein_g,
              carbs_g: per_serving.carbs_g,
              fat_g: per_serving.fat_g,
            },
            explanation,
            user_choice: 'applied',
            applied_at: override.applied_at ?? new Date().toISOString(),
            food_object_id: lockedFood.id,
            match_confidence: grounded.confidence,
            match_source: 'manual',
            notes: explanation,
          },
          total_contribution: grounded.total,
          per_serving_contribution: per_serving,
        };
      }
    }
    // If the locked food-object disappears (deleted / unreachable)
    // we fall through to the normal matcher path so the UI doesn't
    // stall on a dangling reference. The user_choice is preserved
    // below when we wrap the fallback result.
  }

  // --- Tier 1 & 2: trusted food-object lookup ---
  let best: ScoredCandidate | null = null;
  // Rejected rows skip the trusted path entirely — the user said
  // "Not this source" and we must not re-suggest it. Heuristic /
  // default fallback owns the estimate for rejected rows.
  if (override?.user_choice !== 'rejected' && nameQuery.length > 0) {
    try {
      const candidates = await lookup.findCandidates(nameQuery);
      best = pickBestCandidate(queryTokens, candidates);
    } catch (err) {
      // Degrade gracefully — matcher must never throw into the import
      // pipeline. A lookup failure just means we fall through to the
      // heuristic guess-table layer with an explanatory note.
      if (process.env.NODE_ENV !== 'production') {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn('[ingredientMatcher] lookup failed:', reason);
      }
      best = null;
    }
  }

  if (best && best.score >= 500 && hasUsableFoodObjectNutrition(best.food)) {
    const grounded = groundAgainstFoodObject(ing, best);
    if (grounded) {
      const per_serving = computeServingDivision(grounded.total, svg);
      return {
        record: {
          ingredient_index: index,
          raw_text: ing.raw_text,
          normalized_name: ing.normalized_name ?? null,
          quantity_value: ing.quantity_value,
          quantity_unit: ing.quantity_unit,
          preparation_note: ing.preparation_note ?? null,
          match_status: grounded.status,
          confidence: grounded.confidence,
          source_kind: 'food_object',
          source_id: best.food.id,
          source_label: formatFoodLabel(best.food),
          per_serving_estimate: {
            calories: per_serving.calories,
            protein_g: per_serving.protein_g,
            carbs_g: per_serving.carbs_g,
            fat_g: per_serving.fat_g,
          },
          explanation: grounded.explanation,
          // Legacy Packet 4 fields (back-compat for older readers)
          food_object_id: best.food.id,
          match_confidence: grounded.confidence,
          match_source: best.reason === 'exact_canonical' || best.reason === 'exact_alias' ? 'exact_name' : 'fuzzy_name',
          notes: grounded.explanation,
        },
        total_contribution: grounded.total,
        per_serving_contribution: per_serving,
      };
    }
  }

  // --- Tier 3 & 4: heuristic / default fallback ---
  // When we get here either no query was available, no candidate was
  // plausible, or the best candidate lacked usable nutrition data. We
  // tighten the explanation so the UI can distinguish "matcher ran but
  // found nothing trusted" from the pure-sync path.
  const fallback = matchIngredientHeuristicOnly(ing, index, servings);
  const isDefault = fallback.record.source_kind === 'default_guess';
  let tighterExplanation = isDefault
    ? 'No trusted food-object match and no heuristic rule recognized this ingredient. Using a conservative default estimate — edit to add a trusted source.'
    : `No trusted food-object match. Fell back to the "${(fallback.record.source_label ?? 'heuristic').replace(/^Heuristic:\s*/, '')}" heuristic row, scaled by ${ing.quantity_value ?? 1} ${ing.quantity_unit ?? 'serving(s)'}.`;

  // Packet 28 — carry user_choice forward on the fallback record so
  // the UI can keep showing "Suggestion dismissed" + Restore after a
  // rejection, and surface a clear note when a previously applied
  // source has become unresolvable.
  let forwardUserChoice: IngredientMatchEntry['user_choice'] | undefined;
  let forwardAppliedAt: string | null | undefined;
  if (override?.user_choice === 'rejected') {
    forwardUserChoice = 'rejected';
    forwardAppliedAt = override.applied_at ?? null;
    tighterExplanation =
      isDefault
        ? 'Suggestion dismissed by user. Using a conservative default estimate — edit to add a trusted source.'
        : `Suggestion dismissed by user. ${tighterExplanation}`;
  } else if (override?.user_choice === 'applied') {
    // Locked source failed to resolve — keep the applied flag so
    // the UI still reads "Trusted source applied" (reversible)
    // and the user can undo/reapply without losing context.
    forwardUserChoice = 'applied';
    forwardAppliedAt = override.applied_at ?? null;
    tighterExplanation =
      `Previously applied trusted source is temporarily unavailable. ` +
      `Falling back to a heuristic estimate; the source will reattach on next save once it is reachable.`;
  }

  return {
    ...fallback,
    record: {
      ...fallback.record,
      explanation: tighterExplanation,
      notes: tighterExplanation,
      ...(forwardUserChoice !== undefined ? { user_choice: forwardUserChoice } : {}),
      ...(forwardAppliedAt !== undefined ? { applied_at: forwardAppliedAt } : {}),
    },
  };
}

/**
 * Packet 28 — per-row override for `matchIngredient`. Used by
 * `matchIngredients` when the caller wants to honour previously
 * recorded `user_choice` decisions during a rebuild.
 */
export interface IngredientMatchOverride {
  user_choice: 'applied' | 'rejected';
  source_id: string | null;
  applied_at?: string | null;
}

/**
 * Resolve a food-object by id using the caller's lookup. Most
 * lookups are keyword-based, so we try a targeted query built from
 * the ingredient's normalized name first, then filter by id. When
 * the caller is the default Supabase lookup, we also expose a
 * `findById` shortcut via duck typing so the locked source can be
 * fetched directly.
 */
async function resolveFoodObjectById(
  id: string,
  lookup: IngredientLookup,
  nameQuery: string,
): Promise<FoodObjectLite | null> {
  const withFindById = lookup as IngredientLookup & {
    findById?: (id: string) => Promise<FoodObjectLite | null>;
  };
  if (typeof withFindById.findById === 'function') {
    try {
      return await withFindById.findById(id);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn('[ingredientMatcher] findById failed:', reason);
      }
    }
  }
  if (nameQuery.length >= 2) {
    try {
      const candidates = await lookup.findCandidates(nameQuery);
      const hit = candidates.find((c) => c.id === id);
      if (hit) return hit;
    } catch {
      // Fall through.
    }
  }
  return null;
}

function hasUsableFoodObjectNutrition(f: FoodObjectLite): boolean {
  // We need at least calories OR protein to be able to ground a meal
  // totals calculation honestly. Otherwise the food_object doesn't
  // carry enough signal to beat the heuristic fallback.
  return (
    (typeof f.calories === 'number' && f.calories > 0) ||
    (typeof f.protein_g === 'number' && f.protein_g > 0)
  );
}

interface GroundedAgainstFoodObject {
  total: MacroGuess;
  status: 'matched' | 'partial';
  confidence: 'high' | 'medium';
  explanation: string;
}

function groundAgainstFoodObject(
  ing: ImportedMealDraftIngredient,
  scored: ScoredCandidate,
): GroundedAgainstFoodObject | null {
  const f = scored.food;
  const baseServingG = f.serving_size_g && f.serving_size_g > 0 ? f.serving_size_g : null;
  const grams = unitToGrams(ing.quantity_value, ing.quantity_unit);

  let multiplier: number;
  let basis: string;
  let confidence: 'high' | 'medium';

  if (grams !== null && baseServingG !== null) {
    // Preferred path: grams → scaled by serving_size_g
    multiplier = grams / baseServingG;
    basis = `${grams.toFixed(0)}g / ${baseServingG}g serving`;
    confidence = scored.score >= 900 ? 'high' : 'medium';
  } else if (ing.quantity_value !== null && ing.quantity_value > 0) {
    // Fallback: use the food's per-serving values × quantity_value as
    // an approximation. This is honest but less precise, so we cap
    // confidence at medium and surface the reason in the explanation.
    // Packet 24 — when the hardened parser tells us the amount is
    // count-inferred or a range midpoint, surface that provenance in
    // the basis string so the estimate explanation is honest.
    multiplier = ing.quantity_value;
    const unitTag =
      ing.quantity_unit === 'whole'
        ? ' whole item(s)'
        : ing.quantity_unit
          ? ` ${ing.quantity_unit}`
          : '';
    const approxTag =
      ing.quantity_source === 'count_inferred'
        ? ' (count-inferred)'
        : ing.quantity_source === 'range_midpoint'
          ? ' (range midpoint)'
          : '';
    basis = `${ing.quantity_value}${unitTag} × per-serving (${baseServingG ?? 100}g basis)${approxTag}`;
    confidence = 'medium';
  } else {
    // No quantity at all → assume one serving.
    multiplier = 1;
    basis = `1 serving (${baseServingG ?? 100}g basis)`;
    confidence = 'medium';
  }

  const cal = (f.calories ?? 0) * multiplier;
  const pro = (f.protein_g ?? 0) * multiplier;
  const carb = (f.carbs_g ?? 0) * multiplier;
  const fat = (f.fat_g ?? 0) * multiplier;

  const total: MacroGuess = {
    calories: cal,
    protein_g: pro,
    carbs_g: carb,
    fat_g: fat,
    fiber_g: 0,
  };

  const status: 'matched' | 'partial' =
    scored.reason === 'exact_canonical' || scored.reason === 'exact_alias'
      ? 'matched'
      : scored.score >= 700
        ? 'matched'
        : 'partial';

  // Downgrade confidence when match is partial
  if (status === 'partial' && confidence === 'high') confidence = 'medium';

  const explanation =
    `Matched to trusted food-object "${formatFoodLabel(f)}" ` +
    `(${status}, ${basis}). Nutrition scaled from the food-object's per-serving values.`;

  return { total, status, confidence, explanation };
}

function formatFoodLabel(f: FoodObjectLite): string {
  if (f.brand_name && f.brand_name.trim().length > 0) {
    return `${f.brand_name} — ${f.canonical_name}`;
  }
  return f.canonical_name;
}

// ============================================================================
// Batch matcher + aggregation helpers
// ============================================================================

export interface IngredientsMatchedResult {
  records: IngredientMatchEntry[];
  per_serving_totals: NutritionEstimatePerServing;
  /** Share of ingredients that resolved to a trusted food-object match. */
  trusted_ratio: number;
  /** Suggested estimate-level confidence given the mix of match tiers. */
  estimate_confidence: NutritionEstimate['confidence'];
  /** Per-ingredient per-serving nutrition contributions (index-aligned). */
  per_item_per_serving: Array<{ calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
}

export async function matchIngredients(
  ingredients: ImportedMealDraftIngredient[],
  servings: number | null,
  lookup: IngredientLookup,
  opts: {
    /**
     * Packet 28 — previously persisted match entries. When provided,
     * `user_choice='applied'` / `'rejected'` records are turned into
     * per-row overrides so the matcher honours prior user decisions
     * during rebuilds. Rows without a matching prior entry fall
     * through to the normal scoring path.
     */
    priorMatches?: IngredientMatchEntry[] | null;
  } = {},
): Promise<IngredientsMatchedResult> {
  const priorByIndex = new Map<number, IngredientMatchEntry>();
  if (opts.priorMatches) {
    for (const m of opts.priorMatches) {
      if (typeof m.ingredient_index === 'number') {
        priorByIndex.set(m.ingredient_index, m);
      }
    }
  }
  const results: IngredientMatchResult[] = [];
  for (let i = 0; i < ingredients.length; i++) {
    const prior = priorByIndex.get(i);
    const override: IngredientMatchOverride | null = prior?.user_choice
      ? {
          user_choice: prior.user_choice,
          source_id: prior.source_id,
          applied_at: prior.applied_at ?? null,
        }
      : null;
    const r = await matchIngredient(ingredients[i], i, servings, lookup, override);
    results.push(r);
  }
  return aggregateResults(
    results,
    servings,
    ingredients.length,
    collectParseSignals(ingredients),
  );
}

/**
 * Packet 24 — Roll up parser confidence signals so the aggregate
 * estimate can cap its own confidence honestly. `anyLowParse` fires
 * for ranges and explicit low-confidence parser outputs;
 * `anyCountInferred` fires when at least one phrase was classified
 * as whole-item / count-based (`1 apple`, `2 carrots`).
 */
function collectParseSignals(
  ingredients: ImportedMealDraftIngredient[],
): { anyLowParse: boolean; anyCountInferred: boolean } {
  let anyLowParse = false;
  let anyCountInferred = false;
  for (const ing of ingredients) {
    if (ing.parse_confidence === 'low') anyLowParse = true;
    if (ing.quantity_source === 'count_inferred') anyCountInferred = true;
    if (ing.quantity_source === 'range_midpoint') anyLowParse = true;
  }
  return { anyLowParse, anyCountInferred };
}

function aggregateResults(
  results: IngredientMatchResult[],
  servings: number | null,
  totalCount: number,
  parseSignals?: {
    anyLowParse: boolean;
    anyCountInferred: boolean;
  },
): IngredientsMatchedResult {
  const svg = servings && servings > 0 ? servings : 1;
  let total_cal = 0;
  let total_pro = 0;
  let total_carb = 0;
  let total_fat = 0;
  let total_fiber = 0;
  let trusted = 0;

  for (const r of results) {
    total_cal += r.total_contribution.calories;
    total_pro += r.total_contribution.protein_g;
    total_carb += r.total_contribution.carbs_g;
    total_fat += r.total_contribution.fat_g;
    total_fiber += r.total_contribution.fiber_g;
    if (r.record.match_status === 'matched') trusted++;
  }

  const per_serving: NutritionEstimatePerServing = {
    calories: Math.round(total_cal / svg),
    protein_g: round1(total_pro / svg),
    carbs_g: round1(total_carb / svg),
    fat_g: round1(total_fat / svg),
    fiber_g: round1(total_fiber / svg),
    added_sugar_g: null,
  };

  const trusted_ratio = totalCount > 0 ? trusted / totalCount : 0;

  // Estimate confidence: high when ≥70% matched AND ≥4 ingredients,
  // medium when ≥30% matched OR ≥4 ingredients overall, else low.
  let estimate_confidence: NutritionEstimate['confidence'] = 'low';
  if (totalCount >= 4 && trusted_ratio >= 0.7) estimate_confidence = 'high';
  else if (trusted_ratio >= 0.3 || totalCount >= 4) estimate_confidence = 'medium';

  // Packet 24 — Propagate parse uncertainty into estimate confidence.
  // A single low-confidence parse (range midpoint, clearly
  // under-specified phrase) or an entire recipe of count-inferred
  // whole-item phrases should not surface as a high-confidence
  // nutrition estimate. We cap at `medium` rather than collapse all
  // the way to `low` so a mostly-trusted recipe with one fuzzy line
  // stays usable, just not overconfident.
  if (
    parseSignals &&
    (parseSignals.anyLowParse || parseSignals.anyCountInferred) &&
    estimate_confidence === 'high'
  ) {
    estimate_confidence = 'medium';
  }

  return {
    records: results.map((r) => r.record),
    per_serving_totals: per_serving,
    trusted_ratio,
    estimate_confidence,
    per_item_per_serving: results.map((r) => ({
      calories: r.per_serving_contribution.calories,
      protein_g: r.per_serving_contribution.protein_g,
      carbs_g: r.per_serving_contribution.carbs_g,
      fat_g: r.per_serving_contribution.fat_g,
    })),
  };
}

// ============================================================================
// Attachable-payload builder using the matcher output
// ============================================================================

interface AttachableTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface AttachableItemMacros {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface AttachableItem {
  name: string | null;
  quantity: number | null;
  unit: string | null;
  calories: number;
  macros: AttachableItemMacros;
  food_object_id: string | null;
}

interface AttachablePayloadShape {
  items: AttachableItem[];
  totals: AttachableTotals;
  notes_md: string;
}

export function buildAttachablePayloadFromMatches(
  title: string,
  ingredients: ImportedMealDraftIngredient[],
  matched: IngredientsMatchedResult,
): PlannedMealPayload {
  const items: AttachableItem[] = ingredients.map((ing, i) => {
    const rec = matched.records[i];
    const est = matched.per_item_per_serving[i] ?? { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    return {
      name: ing.normalized_name ?? ing.raw_text,
      quantity: ing.quantity_value,
      unit: ing.quantity_unit,
      calories: est.calories,
      macros: {
        protein_g: est.protein_g,
        carbs_g: est.carbs_g,
        fat_g: est.fat_g,
      },
      food_object_id: rec?.source_kind === 'food_object' ? rec.source_id : null,
    };
  });

  const shape: AttachablePayloadShape = {
    items,
    totals: {
      calories: matched.per_serving_totals.calories,
      protein_g: matched.per_serving_totals.protein_g,
      carbs_g: matched.per_serving_totals.carbs_g,
      fat_g: matched.per_serving_totals.fat_g,
    },
    notes_md: `Imported — ${title}`,
  };
  return shape as unknown as PlannedMealPayload;
}

// ============================================================================
// Default Supabase-backed lookup
// ============================================================================

/**
 * Build the default lookup that queries `food_objects` via
 * `supabaseAdmin`. Lazy-imports the admin client so this module stays
 * importable from contexts where server-only deps are not desired.
 */
export function createDefaultIngredientLookup(): IngredientLookup & {
  findById(id: string): Promise<FoodObjectLite | null>;
} {
  const FOOD_OBJECT_COLUMNS =
    'id, canonical_name, brand_name, aliases, serving_size_g, ' +
    'calories, protein_g, carbs_g, fat_g, source_provider, source_type, ' +
    'is_verified, nutrient_confidence';

  return {
    async findCandidates(query: string): Promise<FoodObjectLite[]> {
      if (!query || query.length < 2) return [];
      const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

      // Escape LIKE specials + single quotes for PostgREST `or` filter.
      const safe = query.replace(/[%_]/g, '\\$&').replace(/'/g, "''");

      const filter =
        `canonical_name.ilike.${safe},` +
        `canonical_name.ilike.%${safe}%,` +
        `aliases.cs.{${safe}}`;

      const { data, error } = await supabaseAdmin
        .from('food_objects')
        .select(FOOD_OBJECT_COLUMNS)
        .eq('is_deleted', false)
        .or(filter)
        .limit(15);

      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[ingredientMatcher.findCandidates] query error:', error.message);
        }
        return [];
      }

      return (data ?? []) as unknown as FoodObjectLite[];
    },

    /**
     * Packet 28 — direct food-object lookup by id. Used by the
     * matcher when honouring `user_choice='applied'` overrides: we
     * need to resolve the locked source without relying on the
     * ingredient's name tokens reaching it via a keyword query.
     */
    async findById(id: string): Promise<FoodObjectLite | null> {
      if (!id) return null;
      const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
      const { data, error } = await supabaseAdmin
        .from('food_objects')
        .select(FOOD_OBJECT_COLUMNS)
        .eq('id', id)
        .eq('is_deleted', false)
        .maybeSingle();
      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[ingredientMatcher.findById] query error:', error.message);
        }
        return null;
      }
      return (data ?? null) as unknown as FoodObjectLite | null;
    },
  };
}
