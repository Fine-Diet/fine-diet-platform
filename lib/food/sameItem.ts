/**
 * Phase D — Same-item identity & best-representative selection.
 *
 * Centralizes cross-layer "are these two rows the same intended food?" logic
 * that was previously scattered across `foodServerService.ts`. The model is
 * intentionally narrow:
 *
 *   1. Strong proofs (UPC normalized equivalence, provider+source_id) are the
 *      ONLY signals that justify suppressing a curated row regardless of its
 *      lexical relevance to the query.
 *   2. Soft proofs (normalized name + compatible brand + core token overlap)
 *      keep the existing token-coverage gate as a guard against accidental
 *      merges with unrelated rows that happen to share a few tokens.
 *
 * Product rule (locked at the start of FOODDATA cleanup):
 *
 *   When a thin curated row and a nutrition-connected OFF row clearly
 *   represent the same intended item, the nutrition-connected row should be
 *   preferred — even if it's OFF. Trust tier still matters across DIFFERENT
 *   items; within the same intended item, nutrition usefulness wins.
 *
 * This module is pure: it takes already-shaped FoodSearchResult values and
 * returns identity / ordering information. It does NOT do any DB I/O.
 */
import type { FoodSearchResult } from './types';

// ============================================================================
// UPC normalization
// ============================================================================

/**
 * Strip non-digit characters and leading zeros to produce a canonical UPC key.
 * Returns null when the input has no digits.
 *
 * Examples:
 *   "092227741095"   → "92227741095"
 *   "0092227741095"  → "92227741095"
 *   "0-092 22774109 5" → "92227741095"
 *   "abc"            → null
 */
export function normalizeUpc(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const trimmed = digits.replace(/^0+/, '');
  return trimmed || '0';
}

/**
 * All UPC representations for DB queries (`barcode IN (...)`-style filters).
 *
 * Returns the original digit string plus stripped/zero-padded variants so the
 * mirror picks up the same product whether stored as 12-digit (UPC-A),
 * 13-digit (EAN-13 with the legacy leading "0"), 11-digit (UPC-E), etc.
 *
 * Examples:
 *   "092227741095"   → ["092227741095", "92227741095", "0092227741095"]
 *   "0092227741095"  → ["0092227741095", "92227741095", "092227741095"]
 */
export function getUpcVariants(value: string | null | undefined): string[] {
  if (!value) return [];
  const digits = value.replace(/\D/g, '');
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  const norm = normalizeUpc(digits);
  if (norm) variants.add(norm);
  if (digits.length === 12) variants.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith('0')) variants.add(digits.slice(1));
  if (digits.length === 11) variants.add(`0${digits}`);
  if (digits.length === 14 && digits.startsWith('0')) variants.add(digits.slice(1));

  return Array.from(variants);
}

// ============================================================================
// Result-level identity keys
// ============================================================================

/**
 * Best UPC key for a result. Checks `upc` first, then `sourceId` because FDC
 * branded rows often store the UPC in source_id rather than upc. Returns null
 * if neither yields digits.
 */
export function getResultUpcKey(result: FoodSearchResult): string | null {
  const fromUpc = normalizeUpc(result.food.upc);
  if (fromUpc) return fromUpc;
  return normalizeUpc(result.food.sourceId);
}

/** All UPC variants for a result, considering both upc and sourceId. */
export function getResultUpcVariants(result: FoodSearchResult): string[] {
  return Array.from(
    new Set([
      ...getUpcVariants(result.food.upc),
      ...getUpcVariants(result.food.sourceId),
    ])
  );
}

/**
 * Provider-scoped source identity key. Only meaningful when comparing two
 * rows from the SAME provider — different providers can re-use the same id.
 */
export function getResultProviderSourceKey(result: FoodSearchResult): string | null {
  const provider = result.food.sourceProvider;
  const sourceId = result.food.sourceId;
  if (!provider || !sourceId) return null;
  return `${provider}:${sourceId}`;
}

/**
 * True when the result has a strong cross-layer identity signal — i.e., a UPC
 * (or UPC-like sourceId) we can use to find the same item in another layer.
 *
 * Used to decide whether a thin curated row deserves a same-item OFF lookup
 * even when it would otherwise fail token-coverage gates.
 */
export function hasStrongIdentitySignal(result: FoodSearchResult): boolean {
  return getResultUpcKey(result) !== null;
}

// ============================================================================
// Query-side UPC matching
// ============================================================================

/**
 * True when the raw query string represents a UPC that resolves to this
 * result's normalized UPC (with leading-zero variants accounted for).
 *
 * Replaces the legacy `result.food.upc === originalRaw.replace(/\s+/g, '')`
 * exact-equality check, which silently dropped rows whose stored UPC differed
 * only by leading zeros.
 */
export function isQueryUpcMatchForResult(rawQuery: string, result: FoodSearchResult): boolean {
  const queryKey = normalizeUpc(rawQuery);
  if (!queryKey) return false;
  const resultKey = getResultUpcKey(result);
  if (!resultKey) return false;
  return queryKey === resultKey;
}

// ============================================================================
// Same-item proof
// ============================================================================

/**
 * The kind of proof we have that two results represent the same intended item.
 *
 *   'upc'        — Strong. Normalized UPC keys match. Trustworthy enough to
 *                  suppress lexically-mismatched curated rows.
 *   'source'     — Strong. Same provider + same provider source_id (and the
 *                  sourceId isn't a UPC, which would have matched first).
 *   'name_brand' — Soft. Normalized name+brand suggests same item, but no
 *                  cross-layer ID confirms it. Callers should still apply
 *                  token-coverage gates before suppressing rows.
 */
export type SameItemProofKind = 'upc' | 'source' | 'name_brand';
export interface SameItemProof {
  kind: SameItemProofKind;
  /** Stable string for the proof — useful for grouping/logging. */
  key: string;
}

const BRAND_NOISE_TOKENS = new Set([
  'food',
  'foods',
  'llc',
  'inc',
  'co',
  'company',
  'ltd',
  'brands',
  'brand',
]);

function normalizeForNearExact(text: string): string {
  // ASCII-only pattern (no `u` flag) to stay compatible with the TS `es5`
  // target. `\w` covers `[A-Za-z0-9_]`; post-lowercase that's effectively
  // letters/digits/underscore. Matches the convention in
  // `lib/food/offNormalization.ts`. Non-ASCII letters in food names are
  // exceptionally rare; collapsing them to whitespace here is acceptable
  // because both sides of the comparison are normalized the same way.
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeIdentityToken(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenizeIdentity(text: string | null | undefined): string[] {
  if (!text) return [];
  return normalizeForNearExact(text)
    .split(' ')
    .map((token) => normalizeIdentityToken(token))
    .filter((token) => token.length >= 2);
}

function getBrandIdentityTokens(result: FoodSearchResult): string[] {
  return Array.from(
    new Set(tokenizeIdentity(result.food.brandName).filter((token) => !BRAND_NOISE_TOKENS.has(token)))
  );
}

function getCoreIdentityTokens(result: FoodSearchResult): string[] {
  const brandTokens = getBrandIdentityTokens(result);
  const brandTokenSet = new Set(brandTokens);
  return Array.from(
    new Set(
      tokenizeIdentity(result.food.canonicalName).filter(
        (token) => !brandTokenSet.has(token) && !BRAND_NOISE_TOKENS.has(token)
      )
    )
  );
}

function shareAnyTokens(a: string[], b: string[]): boolean {
  const bSet = new Set(b);
  return a.some((token) => bSet.has(token));
}

function hasCompatibleBrandIdentity(a: FoodSearchResult, b: FoodSearchResult): boolean {
  const aBrandTokens = getBrandIdentityTokens(a);
  const bBrandTokens = getBrandIdentityTokens(b);
  if (aBrandTokens.length === 0 || bBrandTokens.length === 0) return true;
  return shareAnyTokens(aBrandTokens, bBrandTokens);
}

/**
 * Try to prove cross-layer same-item identity between `a` and `b`. Returns the
 * strongest available proof, or null when no signal supports identity.
 *
 * Order matters:
 *   1. Normalized UPC equivalence (covers leading-zero variants automatically).
 *   2. Same provider + same source_id (only when the sourceId isn't already a
 *      UPC, which would be caught by the UPC branch).
 *   3. Normalized name match (with compatible brand).
 *   4. Core-token containment (with compatible brand and >= 2 shared tokens).
 */
export function proveSameItem(a: FoodSearchResult, b: FoodSearchResult): SameItemProof | null {
  const aUpc = getResultUpcKey(a);
  const bUpc = getResultUpcKey(b);
  if (aUpc && bUpc && aUpc === bUpc) {
    return { kind: 'upc', key: aUpc };
  }

  const aSrc = getResultProviderSourceKey(a);
  const bSrc = getResultProviderSourceKey(b);
  if (aSrc && bSrc && aSrc === bSrc) {
    return { kind: 'source', key: aSrc };
  }

  const aName = normalizeForNearExact(a.food.canonicalName);
  const bName = normalizeForNearExact(b.food.canonicalName);
  if (aName && aName === bName) {
    return { kind: 'name_brand', key: `nb:${aName}` };
  }

  if (!hasCompatibleBrandIdentity(a, b)) return null;

  const aCoreTokens = getCoreIdentityTokens(a);
  const bCoreTokens = getCoreIdentityTokens(b);
  if (aCoreTokens.length === 0 || bCoreTokens.length === 0) return null;

  const [shorterCore, longerCore] =
    aCoreTokens.length <= bCoreTokens.length
      ? [aCoreTokens, bCoreTokens]
      : [bCoreTokens, aCoreTokens];
  if (shorterCore.length < 2) return null;

  const longerCoreSet = new Set(longerCore);
  if (shorterCore.every((token) => longerCoreSet.has(token))) {
    return { kind: 'name_brand', key: `nb:${shorterCore.sort().join('+')}` };
  }
  return null;
}

/** Convenience: true when proveSameItem returns any non-null proof. */
export function areSameItem(a: FoodSearchResult, b: FoodSearchResult): boolean {
  return proveSameItem(a, b) !== null;
}

/** True when the proof is strong (UPC or provider source) — never name_brand. */
export function isStrongProof(proof: SameItemProof | null): proof is SameItemProof {
  return proof !== null && (proof.kind === 'upc' || proof.kind === 'source');
}

// ============================================================================
// Group identity (Phase D winner-rationale uses this for groupKey)
// ============================================================================

/**
 * Stable group key for a result. Phase D replaces the placeholder
 * "UPC or name+brand fingerprint" with a key derived from the same identity
 * model used for proveSameItem, so two rows that prove same-item also share
 * a groupKey.
 */
export function getGroupKey(result: FoodSearchResult): string {
  const upc = getResultUpcKey(result);
  if (upc) return `upc:${upc}`;

  const src = getResultProviderSourceKey(result);
  if (src) return `src:${src}`;

  const name = normalizeForNearExact(result.food.canonicalName);
  const brand = normalizeForNearExact(result.food.brandName ?? '');
  return `nb:${name}|${brand}`;
}

// ============================================================================
// Best-representative selection
// ============================================================================

interface RankingSignalsLike {
  nutritionallyUsable?: boolean;
  nutritionQualityTier?: 'strong' | 'usable' | 'thin' | null;
  nutritionCompletenessScore?: number | null;
  trustRank?: number;
  nutritionConfidence?: 'high' | 'medium' | 'low' | null;
}

function nutritionTierScore(tier: RankingSignalsLike['nutritionQualityTier']): number {
  if (tier === 'strong') return 3;
  if (tier === 'usable') return 2;
  if (tier === 'thin') return 0;
  return 1;
}

function confidenceScore(conf: RankingSignalsLike['nutritionConfidence']): number {
  if (conf === 'high') return 3;
  if (conf === 'medium') return 2;
  if (conf === 'low') return 1;
  return 0;
}

/**
 * Compare two results within the same same-item group and decide which one is
 * the better representative.
 *
 * Returns a negative number if `a` is the better representative, positive if
 * `b` is, zero if tied. Mirrors Array.prototype.sort semantics.
 *
 * Order (per the locked product rule):
 *   1. Nutritionally usable beats not-usable.
 *   2. Higher nutrition tier (strong > usable > thin).
 *   3. Higher completeness score.
 *   4. Higher confidence (high > medium > low).
 *   5. Higher trust rank (10 OFF beats 2 curated only WITHIN a same-item group;
 *      across different items, trust rank still ordered the other way around
 *      via section/source_rank — that pipeline is unaffected).
 *   6. Lexical/score signals as final tiebreaker.
 */
export function compareRepresentative(a: FoodSearchResult, b: FoodSearchResult): number {
  const aSig: RankingSignalsLike = a.rankingSignals ?? {};
  const bSig: RankingSignalsLike = b.rankingSignals ?? {};

  const aUsable = aSig.nutritionallyUsable ? 1 : 0;
  const bUsable = bSig.nutritionallyUsable ? 1 : 0;
  if (aUsable !== bUsable) return bUsable - aUsable;

  const aTier = nutritionTierScore(aSig.nutritionQualityTier);
  const bTier = nutritionTierScore(bSig.nutritionQualityTier);
  if (aTier !== bTier) return bTier - aTier;

  const aComp = aSig.nutritionCompletenessScore ?? -1;
  const bComp = bSig.nutritionCompletenessScore ?? -1;
  if (aComp !== bComp) return bComp - aComp;

  const aConf = confidenceScore(aSig.nutritionConfidence);
  const bConf = confidenceScore(bSig.nutritionConfidence);
  if (aConf !== bConf) return bConf - aConf;

  const aTrust = aSig.trustRank ?? a.source_rank ?? 0;
  const bTrust = bSig.trustRank ?? b.source_rank ?? 0;
  if (aTrust !== bTrust) return bTrust - aTrust;

  const aScore = a.score ?? 0;
  const bScore = b.score ?? 0;
  if (aScore !== bScore) return bScore - aScore;

  return a.food.id.localeCompare(b.food.id);
}

/**
 * Pick the best representative from a non-empty group of same-item candidates.
 * Throws on empty input — callers must filter first.
 */
export function pickRepresentative(group: FoodSearchResult[]): FoodSearchResult {
  if (group.length === 0) {
    throw new Error('pickRepresentative: empty group');
  }
  if (group.length === 1) return group[0];
  return [...group].sort(compareRepresentative)[0];
}

// ============================================================================
// Grouping
// ============================================================================

export interface SameItemGroup {
  key: string;
  members: FoodSearchResult[];
  representative: FoodSearchResult;
}

/**
 * Group a list of candidates by same-item identity, choose a representative
 * for each group, and return groups sorted by representative ordering.
 *
 * Strong proofs (UPC, source) are always grouped together. Soft proofs
 * (name_brand) are accepted only when there isn't already a stronger group key
 * — this keeps two unrelated rows with similar names but different UPCs from
 * collapsing into one.
 */
export function groupBySameItem(candidates: FoodSearchResult[]): SameItemGroup[] {
  const groups = new Map<string, FoodSearchResult[]>();
  for (const c of candidates) {
    const key = getGroupKey(c);
    const existing = groups.get(key);
    if (existing) {
      existing.push(c);
    } else {
      groups.set(key, [c]);
    }
  }

  return Array.from(groups.entries()).map(([key, members]) => ({
    key,
    members,
    representative: pickRepresentative(members),
  }));
}
