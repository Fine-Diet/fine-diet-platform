/**
 * lib/plans/trustedSourceSearch.ts
 *
 * Plans Phase 30 — Journal-grade trusted-source search for the
 * import-draft row-level "Find / Replace source" panel.
 *
 * This module is a *row-search* helper; it is deliberately smaller and
 * more focused than `lib/food/foodServerService.ts:searchFoods` (which
 * owns the full Journal search experience, sectioning, user
 * preferences, OFF fallbacks, etc.). We reuse the Journal normalization
 * + AND-grouped DB filter + brand-gated fallback primitives so branded
 * trusted queries ("Rao's Homemade Tomato Basil Sauce",
 * "Rao tomato basil sauce", "Raos tomato basil") retrieve the correct
 * trusted object reliably, then layer in lightweight row-context
 * ranking so the candidate list on a specific ingredient row prefers
 * the right product class (e.g. a sauce row prefers sauce candidates
 * over unrelated same-brand items).
 *
 * Contract alignment with Packet 30:
 *   - Trusted-only by default — this helper ONLY queries the trusted
 *     `food_objects` pool. It does NOT mix in OFF / untrusted results.
 *   - Normalization is inherited from `lib/food/searchNormalization` so
 *     apostrophe-safe matching, multi-token behaviour, brand-aware
 *     token detection, and alias membership match the Journal search
 *     stack verbatim.
 *   - Ranking adds a small, explicit row-context bonus on top of the
 *     Journal-style primary scoring so it remains understandable and
 *     bounded (not an opaque ML reshuffle).
 *   - No change to trusted food-object governance, NDS, or the
 *     Packet 28/29 source apply/replace/row-save flows.
 */

import {
  normalizeSearchQuery,
  countTokenGroupMatches,
  buildAndGroupedFilter,
  buildBrandGatedFallbackFilter,
  matchesBrandGroup,
  escapeForLike,
  type TokenGroup,
} from '@/lib/food/searchNormalization';
import type { FoodObjectLite } from '@/lib/plans/ingredientMatcher';

// Columns we need for both ranking and UI preview. Keep in sync with
// `createDefaultIngredientLookup` FOOD_OBJECT_COLUMNS so downstream
// consumers can treat rows as `FoodObjectLite`.
const FOOD_OBJECT_COLUMNS =
  'id, canonical_name, brand_name, aliases, serving_size_g, ' +
  'calories, protein_g, carbs_g, fat_g, source_provider, source_type, ' +
  'is_verified, nutrient_confidence';

export interface RowContext {
  /**
   * Best available "what is this row" signal. Prefer
   * `normalized_name`; fall back to the raw text if the UI only has
   * that. The ingredient phrase is normalized through the same Journal
   * tokenizer so matching is consistent (apostrophes, punctuation).
   */
  ingredient_name: string | null;
  /**
   * Optional prep-note context. Not every row has one; when present it
   * often carries classifying info ("marinara", "fire-roasted",
   * "unsweetened") that helps disambiguate same-brand siblings.
   */
  preparation_note?: string | null;
}

export interface TrustedSearchOptions {
  /** Max rows returned after ranking. Defaults to 12 (matches UI cap). */
  limit?: number;
  /** Optional row context to apply lightweight secondary ranking. */
  row?: RowContext | null;
}

export interface ScoredTrustedCandidate {
  food: FoodObjectLite;
  /**
   * Composed relevance score. Higher is better. Only used for sorting
   * — callers should not compare across queries.
   */
  score: number;
  /** How many primary-query token groups this candidate matched. */
  tokenMatchCount: number;
  /** How many brand-like primary-query token groups matched. */
  brandGroupHits: number;
  /** How many *extra* row-context token groups matched (not in query). */
  rowContextHits: number;
}

/**
 * Run a Journal-grade trusted-only search, then layer row-context
 * bonuses on top. Returns scored candidates sorted by relevance.
 *
 * Returns `[]` for empty / below-minimum queries rather than throwing
 * so the API handler can keep its "empty query = empty list" shape.
 */
export async function searchTrustedFoodObjectsForRow(
  rawQuery: string,
  options: TrustedSearchOptions = {},
): Promise<ScoredTrustedCandidate[]> {
  const { limit = 12, row = null } = options;

  if (!rawQuery || rawQuery.trim().length < 2) {
    return [];
  }

  const primary = normalizeSearchQuery(rawQuery);
  if (primary.tokens.length === 0) return [];

  // Row-context tokens — drop anything that overlaps with the primary
  // query so the bonus only rewards *new* signal beyond what the user
  // typed. This keeps the bonus a true tie-breaker, not a score
  // multiplier.
  const rowContextGroups = buildRowContextGroups(row, primary.tokenGroups);

  // === Phase A: AND-grouped strict fetch ===
  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

  // We fetch a larger pool than `limit` so ranking has room to pick
  // the best item rather than whatever the DB ordered us.
  const fetchCap = Math.max(limit * 10, 60);

  let foodRows: FoodObjectLite[] = [];
  const phaseAFilter = buildAndGroupedFilter(primary.tokenGroups);
  if (phaseAFilter) {
    const { data, error } = await supabaseAdmin
      .from('food_objects')
      .select(FOOD_OBJECT_COLUMNS)
      .eq('is_deleted', false)
      .or(phaseAFilter)
      .limit(fetchCap);
    if (!error && Array.isArray(data)) {
      foodRows = data as unknown as FoodObjectLite[];
    } else if (error && process.env.NODE_ENV !== 'production') {
      console.warn('[trustedSourceSearch] Phase A error:', error.message);
    }
  }

  // === Phase B: brand-gated fallback (same logic as Journal) ===
  if (foodRows.length < 5) {
    const { filter, requiresBrandHit, brandGroupVariants } =
      buildBrandGatedFallbackFilter(primary.tokenGroups);
    if (filter) {
      const { data, error } = await supabaseAdmin
        .from('food_objects')
        .select(FOOD_OBJECT_COLUMNS)
        .eq('is_deleted', false)
        .or(filter)
        .limit(fetchCap);
      if (!error && Array.isArray(data)) {
        let fallbackRows = data as unknown as FoodObjectLite[];
        if (requiresBrandHit && brandGroupVariants.length > 0) {
          fallbackRows = fallbackRows.filter((r) =>
            matchesBrandGroup(r.canonical_name, r.brand_name, brandGroupVariants),
          );
        }
        const seen = new Set(foodRows.map((r) => r.id));
        for (const r of fallbackRows) {
          if (!seen.has(r.id)) {
            foodRows.push(r);
            seen.add(r.id);
          }
        }
      } else if (error && process.env.NODE_ENV !== 'production') {
        console.warn('[trustedSourceSearch] Phase B error:', error.message);
      }
    }
  }

  // === Phase C: prefix fallback only if still empty ===
  if (foodRows.length === 0) {
    const firstVariant =
      primary.tokenGroups[0]?.dbVariants[0] ?? primary.tokens[0] ?? '';
    if (firstVariant.length >= 2) {
      const escaped = escapeForLike(firstVariant);
      const prefixFilter =
        `canonical_name.ilike.${escaped}%,` +
        `brand_name.ilike.${escaped}%`;
      const { data } = await supabaseAdmin
        .from('food_objects')
        .select(FOOD_OBJECT_COLUMNS)
        .eq('is_deleted', false)
        .or(prefixFilter)
        .limit(Math.max(limit * 2, 20));
      if (Array.isArray(data)) {
        foodRows = data as unknown as FoodObjectLite[];
      }
    }
  }

  if (foodRows.length === 0) return [];

  // === Score every row ===
  const scored: ScoredTrustedCandidate[] = foodRows.map((food) =>
    scoreCandidate(food, primary.tokens, primary.tokenGroups, rowContextGroups),
  );

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tie-break: verified first, then shorter canonical
    // name (less likely to be a modifier-heavy variant), then id.
    const av = a.food.is_verified ? 1 : 0;
    const bv = b.food.is_verified ? 1 : 0;
    if (bv !== av) return bv - av;
    const an = (a.food.canonical_name ?? '').length;
    const bn = (b.food.canonical_name ?? '').length;
    if (an !== bn) return an - bn;
    return a.food.id.localeCompare(b.food.id);
  });

  return scored.slice(0, limit);
}

// ----------------------------------------------------------------
// Internals
// ----------------------------------------------------------------

/**
 * Derive row-context token groups from the ingredient's name + prep
 * note, discarding any tokens the primary query already contains. We
 * do this so the row-context bonus only rewards *additional* signal
 * beyond what the user typed (prevents double-counting the same match
 * twice).
 */
function buildRowContextGroups(
  row: RowContext | null,
  primaryGroups: TokenGroup[],
): TokenGroup[] {
  if (!row) return [];
  const parts: string[] = [];
  if (row.ingredient_name) parts.push(row.ingredient_name);
  if (row.preparation_note) parts.push(row.preparation_note);
  const combined = parts.join(' ').trim();
  if (!combined) return [];

  const { tokenGroups } = normalizeSearchQuery(combined);
  if (tokenGroups.length === 0) return [];

  const primaryCanonicals = new Set(primaryGroups.map((g) => g.canonical));
  return tokenGroups.filter((g) => !primaryCanonicals.has(g.canonical));
}

/**
 * Score a candidate with Journal-parity primary scoring and a small
 * row-context bonus. Keep the weight hierarchy explicit so behaviour
 * is easy to explain:
 *
 *   primary token match      : 100 per group
 *   all-primary-tokens bonus : +200 when every typed group matched
 *   brand hit bonus          : +150 per matched brand-like group
 *   exact / near-exact bonus : up to +50 (then 45/30/20 partial)
 *   simplicity bonus         : up to +80 (prefer "the food" over modifier variants)
 *   row-context token match  : +40 per extra (non-primary) row group
 *   row-context head bonus   : +30 when the last row-context noun appears in canonical
 *   quality bonus            : small additive (verified, confidence)
 *   brand-missing penalty    : -100 if query has brand tokens but row has none
 *   provisional penalty      : -50 for `source_type='provisional'`
 */
function scoreCandidate(
  food: FoodObjectLite,
  primaryTokens: string[],
  primaryGroups: TokenGroup[],
  rowContextGroups: TokenGroup[],
): ScoredTrustedCandidate {
  const combinedText = `${food.canonical_name} ${food.brand_name ?? ''}`;
  const nameLower = food.canonical_name.toLowerCase();

  const primary = countTokenGroupMatches(combinedText, primaryGroups);
  const primaryMatchCount = primary.matchCount;
  const primaryBrandHits = primary.brandGroupHits;

  let score = 0;

  // Primary token matches
  score += primaryMatchCount * 100;

  // All-primary-tokens bonus
  if (primaryTokens.length > 1 && primaryMatchCount === primaryTokens.length) {
    score += 200;
  }

  // Brand hit bonus
  const hasBrandTokens = primaryGroups.some((g) => g.isBrandLike);
  if (hasBrandTokens && primaryBrandHits > 0) {
    score += primaryBrandHits * 150;
  }

  // Exact / near-exact bonus
  const normalizedPrimary = primaryTokens.join(' ');
  const nameStripped = nameLower
    .replace(
      /,\s*(raw|cooked|fresh|frozen|dried|canned|boiled|roasted|grilled|baked|steamed|fried|whole|sliced|chopped|diced|mashed|peeled|unpeeled|with skin|without skin|plain|unsweetened|sweetened|salted|unsalted|organic|ripe|unripe|mature)\b/gi,
      '',
    )
    .trim();
  if (nameLower === normalizedPrimary) {
    score += 50;
  } else if (
    nameStripped === normalizedPrimary ||
    nameStripped === primaryTokens[0]
  ) {
    score += 45;
  } else if (primaryTokens[0] && nameLower.startsWith(primaryTokens[0])) {
    score += 30;
  } else if (normalizedPrimary && nameLower.includes(normalizedPrimary)) {
    score += 20;
  }

  // Simplicity bonus
  const nameWords = nameLower.split(/[\s,]+/).filter(Boolean);
  if (nameWords.length > 0 && primaryTokens.length > 0) {
    const ratio = primaryTokens.length / nameWords.length;
    if (ratio >= 1.0) score += 80;
    else if (ratio >= 0.5) score += Math.round(60 * ratio);
  }

  // Row-context token bonus (extra groups only — primary overlaps are
  // stripped in `buildRowContextGroups`).
  let rowContextHits = 0;
  if (rowContextGroups.length > 0) {
    const { matchCount } = countTokenGroupMatches(combinedText, rowContextGroups);
    rowContextHits = matchCount;
    score += matchCount * 40;

    // Small extra nudge when the tail row-context token appears as a
    // whole word in the canonical name — this is the "head noun"
    // heuristic that helps sauce rows beat non-sauce same-brand
    // siblings without needing a lexicon of head nouns.
    const tailCanonical =
      rowContextGroups[rowContextGroups.length - 1]?.canonical ?? null;
    if (tailCanonical && tailCanonical.length >= 4) {
      const wholeWord = new RegExp(`\\b${escapeRegex(tailCanonical)}\\b`, 'i');
      if (wholeWord.test(food.canonical_name)) {
        score += 30;
      }
    }
  }

  // Quality bonuses — additive and small, same spirit as Journal.
  if (food.is_verified) score += 15;
  if (food.source_provider === 'usda' && food.nutrient_confidence === 'high') {
    score += 5;
  }
  if (food.nutrient_confidence === 'high') score += 4;
  else if (food.nutrient_confidence === 'medium') score += 2;

  // Brand-missing penalty — keep Journal parity so generic "tomato
  // basil sauce" can't outrank a correct branded hit when the user
  // explicitly searched for a brand.
  if (hasBrandTokens && primaryBrandHits === 0) {
    score -= 100;
  }

  // Provisional penalty
  if (food.source_type === 'provisional') {
    score -= 50;
  }

  return {
    food,
    score,
    tokenMatchCount: primaryMatchCount,
    brandGroupHits: primaryBrandHits,
    rowContextHits,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
