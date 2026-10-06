/**
 * Bounded typo fallback for food search.
 *
 * Normal grouped / brand-gated / prefix retrieval always runs first.
 * Fuzzy retrieval is allowed only when that set is absent or has no strong
 * lexical match and fewer than three lexical hits. Digit-only queries and
 * tokens shorter than 5 characters are never expanded.
 *
 * Acceptance re-scores the capped Postgres candidate list locally. Dice is
 * useful for broad trigram overlap, while normalized Damerau-Levenshtein
 * handles substitutions, insertions/deletions, and adjacent transpositions
 * such as "amyul" -> "amylu". This is never a catalog scan: Postgres
 * `pg_trgm` still performs candidate retrieval through
 * `search_food_objects_fuzzy_v1`.
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

function compactFuzzyText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
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
  const left = compactFuzzyText(leftRaw);
  const right = compactFuzzyText(rightRaw);
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

/**
 * Optimal-string-alignment Damerau-Levenshtein similarity.
 *
 * Adjacent transpositions count as one edit, which matters for real search
 * mistakes such as "amyul" -> "amylu". The result is normalized to [0, 1].
 */
export function damerauLevenshteinSimilarity(leftRaw: string, rightRaw: string): number {
  const left = compactFuzzyText(leftRaw);
  const right = compactFuzzyText(rightRaw);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const rows = left.length + 1;
  const cols = right.length + 1;
  const distance: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) distance[i][0] = i;
  for (let j = 0; j < cols; j += 1) distance[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      let best = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + substitutionCost,
      );

      if (
        i > 1
        && j > 1
        && left[i - 1] === right[j - 2]
        && left[i - 2] === right[j - 1]
      ) {
        best = Math.min(best, distance[i - 2][j - 2] + 1);
      }
      distance[i][j] = best;
    }
  }

  const maxLength = Math.max(left.length, right.length);
  return Math.max(0, 1 - distance[left.length][right.length] / maxLength);
}

function typoSimilarity(left: string, right: string): number {
  return Math.max(
    diceCoefficient(left, right),
    damerauLevenshteinSimilarity(left, right),
  );
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
    ...probes.map((probe) => typoSimilarity(args.query, probe)),
    ...args.tokens.flatMap((token) => probes.map((probe) => typoSimilarity(token, probe))),
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
    return probes.some((probe) => typoSimilarity(group.canonical, probe) >= FUZZY_ACCEPT_SIMILARITY);
  });
}

export function fuzzyOnlyScore(similarity: number): number {
  const scaled = Math.round(Math.max(0, Math.min(1, similarity)) * 80);
  return Math.min(FUZZY_ONLY_SCORE_CAP, Math.max(1, scaled));
}
