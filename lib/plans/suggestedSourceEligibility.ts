/**
 * Plans Phase 28 — Suggested source adoption eligibility.
 *
 * Pure, isomorphic classifier that decides how a single
 * `IngredientMatchEntry` should be presented in the import-draft UI.
 * Packet 28 locks the following row states:
 *
 *   - `'strong'`     one-click apply (§3a: "strong / sane matches
 *                    may support one-click apply")
 *   - `'review'`     review-first apply (§3a: "partial /
 *                    medium-confidence suggestions should be
 *                    review-first, not immediate one-click trust")
 *   - `'ineligible'` suggestion exists but is obviously wrong and is
 *                    not applyable (§3d: "salt -> salt & vinegar pork
 *                    skins", "pepper -> pepper jelly", etc.)
 *   - `'applied'`    user has explicitly committed this source
 *                    (§3c / §6c: "Trusted source applied" + Undo)
 *   - `'rejected'`   user dismissed the suggestion via "Not this
 *                    source" (§3e)
 *   - `'none'`       there is no food-object suggestion for this row
 *                    (source_kind !== 'food_object'); no controls
 *
 * No DB access; no network; safe to import on both client and
 * server. The classifier only inspects the match record itself —
 * callers apply the resulting state to their UI or API logic.
 *
 * Guardrail rule (§3d)
 * --------------------
 * "Obviously bad semantic partials" are blocked via a token-Jaccard
 * check:
 *
 *   jaccard = |ingredient_tokens ∩ source_tokens|
 *             -------------------------------------
 *             |ingredient_tokens ∪ source_tokens|
 *
 * When the matcher's confidence is not `'high'` and jaccard is below
 * the adoption floor, the row is classified as `'ineligible'` even
 * though the matcher produced a `match_status='partial'` record. The
 * floor is set at 0.4 which keeps clearly related composites
 * (e.g. "olive oil" ↔ "extra virgin olive oil", jaccard = 0.5)
 * review-eligible while rejecting obvious category drift
 * (e.g. "salt" ↔ "salt & vinegar pork skins", jaccard = 0.25).
 *
 * This module is intentionally conservative: if the floor is
 * ambiguous (no tokens to compare, empty source label), we downgrade
 * to `'review'` rather than `'strong'`, never promote.
 */

import type { IngredientMatchEntry } from './types';

export type SuggestedSourceEligibility =
  | 'strong'
  | 'review'
  | 'ineligible'
  | 'applied'
  | 'rejected'
  | 'none';

export interface SuggestedSourceVerdict {
  /** Primary row state used by the UI and API. */
  state: SuggestedSourceEligibility;
  /** Human-readable rationale for diagnostics / telemetry. */
  reason: string;
  /**
   * Jaccard similarity between ingredient tokens and source tokens
   * when computed, else null. Kept on the verdict so telemetry rows
   * can log it without recomputing.
   */
  token_jaccard: number | null;
}

/**
 * Jaccard floor below which a non-`high`-confidence match is marked
 * ineligible instead of review. Tuned against the Packet 28 QA
 * examples (salt/pepper/basil staple drift). Keep conservative —
 * raising this number blocks more legitimate partials.
 */
const JACCARD_ADOPTION_FLOOR = 0.4;

/**
 * When the ingredient is a bare single-token pantry staple, we
 * require a tighter bound because common staple tokens appear inside
 * a lot of branded composite names ("salt & vinegar pork skins"
 * contains "salt"). A 0.5 floor forces either an exact match or a
 * 2-token source, not a 4-token one.
 */
const JACCARD_STAPLE_FLOOR = 0.5;

const PANTRY_STAPLES: ReadonlySet<string> = new Set([
  'salt',
  'pepper',
  'sugar',
  'flour',
  'butter',
  'basil',
  'oregano',
  'thyme',
  'parsley',
  'cinnamon',
  'paprika',
  'honey',
  'oil',
  'water',
]);

/** Lower-case token extraction. Mirrors ingredientMatcher tokenizer rules lightly — kept independent so eligibility can be computed without loading the matcher. */
function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function computeJaccard(aTokens: string[], bTokens: string[]): number | null {
  if (aTokens.length === 0 || bTokens.length === 0) return null;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let shared = 0;
  a.forEach((t) => {
    if (b.has(t)) shared++;
  });
  const union = new Set<string>();
  a.forEach((t) => union.add(t));
  b.forEach((t) => union.add(t));
  if (union.size === 0) return null;
  return shared / union.size;
}

/**
 * Strip known brand prefixes from a food label (e.g. "Kirkland —
 * Extra Virgin Olive Oil" → "Extra Virgin Olive Oil") so the jaccard
 * check compares against the canonical product name rather than the
 * brand namespace.
 */
function normalizedSourceLabel(label: string | null): string {
  if (!label) return '';
  const m = label.match(/^.*?—\s*(.+)$/);
  return m ? m[1] : label;
}

/**
 * Classify a single `IngredientMatchEntry` into a Packet 28 row
 * state. Pure function; no side effects.
 */
export function classifyMatchEntry(
  entry: IngredientMatchEntry | null | undefined,
): SuggestedSourceVerdict {
  if (!entry) {
    return { state: 'none', reason: 'no match entry', token_jaccard: null };
  }

  // User choice always wins over matcher state.
  if (entry.user_choice === 'applied') {
    return {
      state: 'applied',
      reason: 'user explicitly applied this source',
      token_jaccard: null,
    };
  }
  if (entry.user_choice === 'rejected') {
    return {
      state: 'rejected',
      reason: 'user dismissed the suggestion via Not this source',
      token_jaccard: null,
    };
  }

  // Only food-object matches can be adopted. Heuristic / default
  // entries have no curated source to attach to the row.
  if (entry.source_kind !== 'food_object') {
    return {
      state: 'none',
      reason: `source_kind='${entry.source_kind}' — no food-object suggestion`,
      token_jaccard: null,
    };
  }
  if (!entry.source_id) {
    return {
      state: 'none',
      reason: 'food_object source without source_id',
      token_jaccard: null,
    };
  }

  const ingredientTokens = tokenize(
    entry.normalized_name ?? entry.raw_text ?? '',
  );
  const sourceTokens = tokenize(normalizedSourceLabel(entry.source_label));
  const jaccard = computeJaccard(ingredientTokens, sourceTokens);

  // Packet 28 §3d flagship case — bare pantry staple against a
  // composite where the staple is the *qualifier* (first token)
  // rather than the head noun (last token). "Pepper jelly" and
  // "basil butter" are ineligible ("pepper" qualifies "jelly");
  // "black pepper" and "kosher salt" stay legitimate ("pepper" is
  // the head). When the staple is the head noun, the general
  // jaccard floor decides; when it's a qualifier, we hard-block.
  if (
    ingredientTokens.length === 1 &&
    PANTRY_STAPLES.has(ingredientTokens[0]) &&
    sourceTokens.length >= 2
  ) {
    const staple = ingredientTokens[0];
    const headToken = sourceTokens[sourceTokens.length - 1];
    const firstToken = sourceTokens[0];
    const stapleIsHead = headToken === staple;
    const stapleIsQualifier = firstToken === staple && !stapleIsHead;
    if (stapleIsQualifier) {
      return {
        state: 'ineligible',
        reason: `pantry-staple "${staple}" is a qualifier, not the head noun, of "${entry.source_label ?? ''}"`,
        token_jaccard: jaccard,
      };
    }
    // Explicit floor for staple-vs-multi-token sources where the
    // staple appears mid-phrase but the category drifted (e.g.
    // "salt & vinegar pork skins" → jaccard ≈ 0.25).
    if (sourceTokens.length >= 3 && (jaccard ?? 0) < JACCARD_STAPLE_FLOOR) {
      return {
        state: 'ineligible',
        reason: `pantry-staple "${staple}" against multi-token source (${sourceTokens.length} tokens, jaccard=${(jaccard ?? 0).toFixed(2)})`,
        token_jaccard: jaccard,
      };
    }
  }

  // Non-high confidence below the general jaccard floor is blocked.
  // This catches cases where tokens overlap nominally but the source
  // drifted into a different product category.
  if (
    entry.confidence !== 'high' &&
    jaccard !== null &&
    jaccard < JACCARD_ADOPTION_FLOOR
  ) {
    return {
      state: 'ineligible',
      reason: `jaccard=${jaccard.toFixed(2)} below floor ${JACCARD_ADOPTION_FLOOR} and confidence='${entry.confidence}'`,
      token_jaccard: jaccard,
    };
  }

  // Matched + high confidence → one-click apply.
  if (entry.match_status === 'matched' && entry.confidence === 'high') {
    return {
      state: 'strong',
      reason: 'matched + high confidence',
      token_jaccard: jaccard,
    };
  }

  // Everything else with a food_object source is review-first.
  return {
    state: 'review',
    reason: `match_status='${entry.match_status}', confidence='${entry.confidence}'`,
    token_jaccard: jaccard,
  };
}

/**
 * Vectorised variant: classify an entire `ingredient_match_json`
 * array. Returns verdicts in the same order as the input; entries
 * with missing indices fall back to `'none'`.
 */
export function classifyMatches(
  entries: IngredientMatchEntry[] | null | undefined,
): SuggestedSourceVerdict[] {
  if (!entries) return [];
  return entries.map((e) => classifyMatchEntry(e));
}

/**
 * Convenience — is this row a candidate for the `apply` action?
 * True for both `strong` and `review`. Callers who want to gate
 * specifically on strong-only should inspect the verdict directly.
 */
export function isAdoptable(verdict: SuggestedSourceVerdict): boolean {
  return verdict.state === 'strong' || verdict.state === 'review';
}
