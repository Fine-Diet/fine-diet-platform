/**
 * OFF Normalization — Phase 3
 *
 * Lightweight utilities for:
 * 1. Parsing OFF mirror serving/nutrition fields
 * 2. Near-exact curated match heuristic for the thin-result gate
 *
 * Principles:
 * - Minimal parsing only — raw OFF mirror payload is never modified
 * - Simple and explainable — no ML/AI
 * - All derived values are metadata alongside the original row
 */

import type { FoodSearchResult, OffServingNormalization } from './types';

// ============================================================================
// Serving size parsing
// ============================================================================

/**
 * Parse grams from a free-form serving size text string.
 *
 * Handled patterns (case-insensitive):
 *   "150g"         → 150
 *   "150 g"        → 150
 *   "150 grams"    → 150
 *   "150gr"        → 150
 *   "1 cup (150g)" → 150   (parenthetical grams)
 *   "(150 grams)"  → 150
 *
 * Returns null when no gram value is parseable.
 */
export function parseServingSizeG(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  // Direct gram prefix: "150g", "150 g", "150grams", "150 gr"
  const direct = t.match(/^(\d+(?:\.\d+)?)\s*g(?:rams?|r)?(?:\s|$|,)/);
  if (direct) {
    const v = parseFloat(direct[1]);
    return isNaN(v) ? null : v;
  }

  // Parenthetical: "(150g)" or "1 serving (150 grams)"
  const parens = t.match(/\((\d+(?:\.\d+)?)\s*g(?:rams?|r)?\)/);
  if (parens) {
    const v = parseFloat(parens[1]);
    return isNaN(v) ? null : v;
  }

  return null;
}

/**
 * Compute a completeness score 0–5 from populated nutrition fields.
 *
 * Scoring:
 *   +1  calories (energy_kcal_100g)
 *   +1  protein
 *   +1  carbs
 *   +1  fat
 *   +1  any micronutrient (fiber, sugars, or sodium)
 */
export function computeCompletenessScore(row: {
  energy_kcal_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
}): number {
  let score = 0;
  if (row.energy_kcal_100g != null) score++;
  if (row.protein_g_100g != null) score++;
  if (row.carbs_g_100g != null) score++;
  if (row.fat_g_100g != null) score++;
  if (row.fiber_g_100g != null || row.sugars_g_100g != null || row.sodium_mg_100g != null) score++;
  return score;
}

/**
 * Build the full OffServingNormalization record for an OFF mirror row.
 * All OFF Phase 1 imports store nutrition per 100g.
 */
export function normalizeOffRow(row: {
  serving_size: string | null;
  quantity: string | null;
  energy_kcal_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugars_g_100g: number | null;
  sodium_mg_100g: number | null;
}): OffServingNormalization {
  const rawText = row.serving_size || row.quantity || null;
  const parsedG = parseServingSizeG(rawText);
  const completeness = computeCompletenessScore(row);

  const servingConfidence: 'high' | 'medium' | 'low' =
    parsedG != null ? 'high' : rawText != null ? 'medium' : 'low';

  return {
    serving_size_text: rawText,
    serving_size_g: parsedG,
    nutrition_basis: 'per_100g', // all Phase 1 OFF data is per 100g
    serving_confidence: servingConfidence,
    completeness_score: completeness,
    normalization_status: parsedG != null ? 'parsed' : 'raw',
  };
}

// ============================================================================
// Near-exact curated match heuristic
// ============================================================================

/**
 * Normalize a string for near-exact comparison.
 * - lowercase
 * - strip punctuation (keeping word chars and spaces)
 * - collapse whitespace
 * - trim
 */
export function normalizeForNearExact(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true when any curated result is a near-exact match for the raw query.
 *
 * Rules (all applied after normalizeForNearExact on both sides):
 * 1. name === query                        — exact match
 * 2. name starts with query               — e.g. "banana" matches "banana raw"
 * 3. all query tokens found in name+brand — e.g. "greek yogurt" in "plain greek yogurt (fage)"
 * 4. single-token query: query is one of the name's whitespace tokens
 *                                         — e.g. "banana" in ["banana", "chips"]
 *
 * Only curated (non-OFF) results are checked.
 * Returns false when curatedResults is empty.
 */
export function hasNearExactCuratedMatch(
  rawQuery: string,
  curatedResults: FoodSearchResult[]
): boolean {
  if (curatedResults.length === 0) return false;

  const normQuery = normalizeForNearExact(rawQuery);
  const queryTokens = normQuery.split(' ').filter(Boolean);
  if (queryTokens.length === 0) return false;

  const primaryToken = queryTokens[0];

  for (const r of curatedResults) {
    if (r.source === 'off') continue;

    const normName = normalizeForNearExact(r.food.canonicalName);
    const normBrand = r.food.brandName ? normalizeForNearExact(r.food.brandName) : '';
    const combined = normBrand ? `${normName} ${normBrand}` : normName;

    // Rule 1: exact name match
    if (normName === normQuery) return true;

    // Rule 2: name starts with query
    if (normName.startsWith(normQuery)) return true;

    // Rule 3: all query tokens present in name+brand (multi-token queries)
    if (queryTokens.length >= 2 && queryTokens.every((t) => combined.includes(t))) return true;

    // Rule 4: single-token exact word match in name
    if (queryTokens.length === 1 && normName.split(' ').includes(primaryToken)) return true;
  }

  return false;
}
