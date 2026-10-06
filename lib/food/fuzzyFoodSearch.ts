/**
 * Bounded typo fallback for food search.
 *
 * Normal grouped / brand-gated / prefix retrieval always runs first.
 * Fuzzy retrieval is allowed only when that set is absent or has no strong
 * lexical match and fewer than three lexical hits. Digit-only queries and
 * tokens shorter than 5 characters are never expanded.
 *
 * Acceptance uses a local Dice coefficient on the capped candidate list.
 * That check is not a catalog scan. Postgres `pg_trgm` does the retrieval
 * via `search_food_objects_fuzzy_v1`.
 */

import {
  countTokenGroupMatches,
  matchesBrandGroup,
  type TokenGroup,
} from './searchNormalization';

export const FUZZY_MIN_TOKEN_LENGTH = 5;
export const FUZZY_CANDIDATE_CAP = 12;
export const FUZZY_SQL_MIN_SIMILARITY = 0.3;
export const FUZZY_ACCEPT_SIMILARITY = 0.42;
/** Stays below one lexical token-match point (100). */
export const FUZZY_ONLY_SCORE_CAP = 89;
export const FUZZY_RPC_NAME = 'search_food_objects_fuzzy_v1';

export interface FuzzyFoodNameRow {
  canonical_name: string;
  brand_name: string | null;
}

export interface FuzzyFallbackDecision {
  run: boolean;
  reason:
    | 'query_too_short_or_ambiguous'
    | 'barcode_query'
    | 'strong_normal_match'
    | 'normal_results_sufficient'
    | 'normal_results_absent'
    | 'normal_results_insufficient';
}

export function isDigitOnlyQuery(normalized: string): boolean {
  const compact = normalized.replace(/[\s-]/g, '');
  return compact.length > 0 && /^\d+$/.test(compact);
}

export function isFuzzyQueryEligible(normalized: string, tokens: string[]): boolean {
  if (!normalized || tokens.length === 0) return false;
  if (isDigitOnlyQuery(normalized)) return false;
  const longest = tokens.reduce((max, token) => Math.max(max, token.length), 0);
  if (longest < FUZZY_MIN_TOKEN_LENGTH) return false;
  const compact = normalized.replace(/\s+/g, '');
  return compact.length >= FUZZY_MIN_TOKEN_LENGTH;
}

export function diceCoefficient(leftRaw: string, rightRaw: string): number {
  const left = leftRaw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const right = rightRaw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const counts = (value: string): Record<string, number> => {
    const map: Record<string, number> = {};
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      map[gram] = (map[gram] ?? 0) + 1;
    }
    return map;
  };

  const leftGrams = counts(left);
  const rightGrams = counts(right);
  let overlap = 0;
  for (const gram of Object.keys(leftGrams)) {
    overlap += Math.min(leftGrams[gram], rightGrams[gram] ?? 0);
  }
  return (2 * overlap) / ((left.length - 1) + (right.length - 1));
}

function lexicalHitCount(rows: FuzzyFoodNameRow[], tokenGroups: TokenGroup[]): number {
  return rows.filter((row) => {
    const text = `${row.canonical_name} ${row.brand_name ?? ''}`;
    return countTokenGroupMatches(text, tokenGroups).matchCount > 0;
  }).length;
}

export function hasStrongNormalMatch(
  rows: FuzzyFoodNameRow[],
  normalized: string,
  tokens: string[],
  tokenGroups: TokenGroup[],
): boolean {
  const query = normalized.toLowerCase();
  return rows.some((row) => {
    const name = row.canonical_name.toLowerCase().trim();
    const brand = (row.brand_name ?? '').toLowerCase().trim();
    const text = `${name} ${brand}`;
    const hits = countTokenGroupMatches(text, tokenGroups).matchCount;
    if (hits <= 0) return false;
    if (name === query || brand === query) return true;
    if (tokens.length === 1 && (name.startsWith(tokens[0]) || brand.startsWith(tokens[0]))) {
      return true;
    }
    return false;
  });
}

export function shouldRunFuzzyFallback(args: {
  normalized: string;
  tokens: string[];
  tokenGroups: TokenGroup[];
  rows: FuzzyFoodNameRow[];
}): FuzzyFallbackDecision {
  if (isDigitOnlyQuery(args.normalized)) {
    return { run: false, reason: 'barcode_query' };
  }
  if (!isFuzzyQueryEligible(args.normalized, args.tokens)) {
    return { run: false, reason: 'query_too_short_or_ambiguous' };
  }
  if (hasStrongNormalMatch(args.rows, args.normalized, args.tokens, args.tokenGroups)) {
    return { run: false, reason: 'strong_normal_match' };
  }
  const hits = lexicalHitCount(args.rows, args.tokenGroups);
  if (hits >= 3) return { run: false, reason: 'normal_results_sufficient' };
  if (args.rows.length === 0 || hits === 0) {
    return { run: true, reason: 'normal_results_absent' };
  }
  return { run: true, reason: 'normal_results_insufficient' };
}

function similarityProbes(canonicalName: string, brandName: string | null): string[] {
  const combined = `${canonicalName} ${brandName ?? ''}`;
  const words = combined.split(/[^a-z0-9]+/i).filter((word) => word.length >= 3);
  return [canonicalName, brandName ?? '', ...words];
}

export function bestFuzzySimilarity(args: {
  query: string;
  tokens: string[];
  canonicalName: string;
  brandName: string | null;
  rpcSimilarity: number;
}): number {
  const probes = similarityProbes(args.canonicalName, args.brandName);
  const comparisons = [
    args.rpcSimilarity,
    ...probes.map((probe) => diceCoefficient(args.query, probe)),
    ...args.tokens.flatMap((token) => probes.map((probe) => diceCoefficient(token, probe))),
  ];
  return comparisons.reduce((max, value) => Math.max(max, value), 0);
}

/**
 * Brand-like tokens must each resemble the candidate name or brand.
 * A common-food typo that the cold heuristic marks as brand-like still
 * passes when the food name itself is the close match. A mixed query
 * such as "chobani bannana" still requires the brand token to match.
 */
export function acceptFuzzyCandidate(args: {
  query: string;
  tokens: string[];
  tokenGroups: TokenGroup[];
  canonicalName: string;
  brandName: string | null;
  rpcSimilarity: number;
}): boolean {
  const best = bestFuzzySimilarity(args);
  if (best < FUZZY_ACCEPT_SIMILARITY) return false;

  const brandGroups = args.tokenGroups.filter((group) => group.isBrandLike);
  if (brandGroups.length === 0) return true;

  const probes = similarityProbes(args.canonicalName, args.brandName);
  return brandGroups.every((group) => {
    if (matchesBrandGroup(args.canonicalName, args.brandName, group.dbVariants)) return true;
    return probes.some((probe) => diceCoefficient(group.canonical, probe) >= FUZZY_ACCEPT_SIMILARITY);
  });
}

export function fuzzyOnlyScore(similarity: number): number {
  const scaled = Math.round(Math.max(0, Math.min(1, similarity)) * 80);
  return Math.min(FUZZY_ONLY_SCORE_CAP, Math.max(1, scaled));
}
