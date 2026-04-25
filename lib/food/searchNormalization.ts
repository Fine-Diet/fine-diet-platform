/**
 * Search Query Normalization
 * 
 * Normalizes user search input to prevent common issues:
 * - Hyphens interpreted as negation operators
 * - Inconsistent apostrophe variants
 * - Punctuation breaking tokenization
 * 
 * Key principles:
 * - Apostrophes are REMOVED for canonical tokens (mcdonald's → mcdonalds)
 * - DB filter variants do NOT include apostrophes (PostgREST escaping issues)
 * - We keep apostrophe variants for in-memory matching after DB retrieval
 * - Short tokens (< 2 chars) are filtered out to prevent over-matching
 */

// Apostrophes/quotes to REMOVE (not replace with space)
const APOSTROPHE_REGEX = /[''`']/g;

// Punctuation to replace with space
const PUNCTUATION_REGEX = /[-/\\.,;:!?()[\]{}""„"@#$%^&*+=|<>~]+/g;

// Minimum token length to include in search
const MIN_TOKEN_LENGTH = 2;

// Common words that are NOT brand-like (for brand detection)
// These are generic food/packaging/descriptor words
const COMMON_WORDS = new Set([
  // Beverages
  'root', 'beer', 'soda', 'cola', 'juice', 'water', 'tea', 'coffee',
  'rootbeer', 'softdrink', 'drink', 'beverage', 'lemonade', 'punch',
  // Packaging
  'bottle', 'can', 'pack', 'box', 'bag', 'container', 'pouch', 'carton',
  // Foods
  'cheese', 'burger', 'chicken', 'beef', 'pork', 'fish', 'salad',
  'bread', 'rice', 'pasta', 'pizza', 'sandwich', 'wrap', 'taco',
  'fries', 'chips', 'cookie', 'cake', 'pie', 'ice', 'cream',
  'milk', 'yogurt', 'butter', 'eggs', 'bacon', 'ham', 'turkey',
  'apple', 'orange', 'banana', 'grape', 'berry', 'lemon', 'lime',
  'breakfast', 'sausage', 'sausages', 'link', 'links', 'patty', 'patties',
  // Descriptors
  'diet', 'zero', 'light', 'lite', 'free', 'low', 'fat', 'sugar',
  'double', 'triple', 'big', 'small', 'medium', 'large', 'extra',
  'hot', 'cold', 'iced', 'frozen', 'fresh', 'crispy', 'grilled',
  'original', 'classic', 'regular', 'special', 'deluxe', 'premium',
  'mini', 'minis', 'time',
  // Units/measurements
  'ounce', 'liter', 'gallon', 'pint', 'quart', 'serving', 'portion',
]);

/**
 * A token group represents one logical search term with multiple ILIKE variants.
 * 
 * IMPORTANT: dbVariants do NOT contain apostrophes (PostgREST escaping issues)
 * displayVariants may contain apostrophes (for in-memory matching after DB fetch)
 */
export interface TokenGroup {
  canonical: string;        // The normalized token (e.g., "barqs")
  dbVariants: string[];     // Variants safe for DB ILIKE (NO apostrophes)
  displayVariants: string[]; // All variants including apostrophes (for scoring)
  isBrandLike: boolean;     // True if this looks like a brand name
}

/**
 * Result of normalizing a search query with token groups.
 */
export interface NormalizedSearchQuery {
  normalized: string;       // Full normalized string
  tokens: string[];         // Canonical tokens for scoring
  tokenGroups: TokenGroup[]; // Token groups with variants for DB matching
  originalRaw: string;      // Original input
}

/**
 * Detect if a token had an apostrophe in the original raw query.
 * Returns map of normalizedForm -> original forms with apostrophes.
 */
function findApostropheTokens(rawLower: string): Map<string, string[]> {
  const apostrophePattern = /([a-z]+)[''`']s?\b/gi;
  const matches = new Map<string, string[]>();
  
  let match;
  while ((match = apostrophePattern.exec(rawLower)) !== null) {
    const fullMatch = match[0].toLowerCase();
    const base = match[1].toLowerCase();
    const normalizedForm = fullMatch.replace(/[''`']/g, '');
    
    if (!matches.has(normalizedForm)) {
      matches.set(normalizedForm, []);
    }
    const variants = matches.get(normalizedForm)!;
    if (!variants.includes(fullMatch)) variants.push(fullMatch);
    const withStandardApostrophe = base + "'s";
    if (!variants.includes(withStandardApostrophe)) variants.push(withStandardApostrophe);
  }
  
  return matches;
}

/**
 * Generate DB-safe variants (no apostrophes) and display variants (with apostrophes).
 */
function generateTokenVariants(
  token: string,
  apostropheMap: Map<string, string[]>,
  isBrandLike: boolean
): { dbVariants: string[]; displayVariants: string[] } {
  const dbVariants: string[] = [token];
  const displayVariants: string[] = [token];
  
  // Check if this token had an apostrophe form in the original query
  const apostropheFormsFromQuery = apostropheMap.get(token);
  if (apostropheFormsFromQuery) {
    for (const v of apostropheFormsFromQuery) {
      // Display variant: keep apostrophe
      if (!displayVariants.includes(v)) displayVariants.push(v);
      // DB variant: remove apostrophe
      const dbSafe = v.replace(/[''`']/g, '');
      if (!dbVariants.includes(dbSafe)) dbVariants.push(dbSafe);
    }
  }
  
  // For brand-like tokens ending in 's', add the stem
  if (isBrandLike && token.length >= 4 && token.endsWith('s')) {
    const stem = token.slice(0, -1);
    if (stem.length >= 3) {
      if (!dbVariants.includes(stem)) dbVariants.push(stem);
      if (!displayVariants.includes(stem)) displayVariants.push(stem);
      // Display: stem + apostrophe + s
      const stemWithApostrophe = stem + "'s";
      if (!displayVariants.includes(stemWithApostrophe)) displayVariants.push(stemWithApostrophe);
    }
  }
  
  // For brand-like tokens NOT ending in 's', also try adding 's
  if (isBrandLike && token.length >= 3 && !token.endsWith('s')) {
    const withS = token + 's';
    if (!dbVariants.includes(withS)) dbVariants.push(withS);
    if (!displayVariants.includes(withS)) displayVariants.push(withS);
    // Display: with apostrophe s
    const withApostropheS = token + "'s";
    if (!displayVariants.includes(withApostropheS)) displayVariants.push(withApostropheS);
  }
  
  return { dbVariants, displayVariants };
}

/**
 * Check if a token looks like a brand name.
 *
 * Phase E — accepts an optional `brandTokenSet` produced by the brand-evidence
 * cache (`lib/food/brandEvidenceCache.ts`). When provided and the token is in
 * the set, the token is brand-like regardless of length/COMMON_WORDS. The
 * cache is the authoritative *positive* signal: it can promote tokens that
 * the cold-path heuristic would have demoted (e.g. a real 3-character brand).
 *
 * When the cache is null or doesn't contain the token, we fall back to the
 * existing length+COMMON_WORDS heuristic so cold-cache behavior is unchanged.
 */
function isBrandLikeToken(token: string, brandTokenSet?: Set<string> | null): boolean {
  if (brandTokenSet && brandTokenSet.has(token)) return true;
  if (token.length < 4) return false;
  if (COMMON_WORDS.has(token)) return false;
  return true;
}

/**
 * Optional inputs to `normalizeSearchQuery`. Phase E adds `brandTokenSet`
 * so the server can pass the brand-evidence cache view to the normalizer.
 */
export interface NormalizeSearchQueryOptions {
  /**
   * Set of normalized tokens that are known brands (from
   * `lib/food/brandEvidenceCache.getCachedBrandTokens`). When omitted or
   * null, only the cold-path heuristic determines brand-likeness.
   */
  brandTokenSet?: Set<string> | null;
}

/**
 * Normalize a search query for safe, consistent matching.
 *
 * Returns both:
 * - Canonical tokens for scoring (apostrophes removed)
 * - Token groups with DB-safe variants and display variants
 */
export function normalizeSearchQuery(
  raw: string,
  options: NormalizeSearchQueryOptions = {}
): NormalizedSearchQuery {
  if (!raw) {
    return { normalized: '', tokens: [], tokenGroups: [], originalRaw: raw };
  }
  
  const rawLower = raw.toLowerCase();
  
  // Find apostrophe patterns BEFORE removing them
  const apostropheMap = findApostropheTokens(rawLower);
  
  let normalized = rawLower;
  
  // Remove apostrophes for canonical form
  normalized = normalized.replace(APOSTROPHE_REGEX, '');
  
  // Normalize fancy quotes then replace with space
  normalized = normalized.replace(/[""„"]/g, ' ');
  
  // Replace other punctuation with spaces
  normalized = normalized.replace(PUNCTUATION_REGEX, ' ');
  
  // Collapse whitespace and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Extract canonical tokens
  const tokens = normalized
    .split(' ')
    .filter(t => t.length >= MIN_TOKEN_LENGTH);
  
  const brandTokenSet = options.brandTokenSet ?? null;

  // Build token groups with variants
  const tokenGroups: TokenGroup[] = tokens.map(token => {
    const isBrandLike = isBrandLikeToken(token, brandTokenSet);
    const { dbVariants, displayVariants } = generateTokenVariants(token, apostropheMap, isBrandLike);
    
    return {
      canonical: token,
      dbVariants,
      displayVariants,
      isBrandLike,
    };
  });
  
  return {
    normalized,
    tokens,
    tokenGroups,
    originalRaw: raw,
  };
}

/**
 * Normalize a food name for deduplication comparison.
 */
export function normalizeForDedupe(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""„]/g, '"')
    .replace(PUNCTUATION_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape special characters for LIKE/ILIKE patterns.
 * NOTE: This does NOT need to handle apostrophes since we strip them from dbVariants.
 */
export function escapeForLike(str: string): string {
  return str
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check whether a variant matches at the start of a word/token.
 * This avoids false positives like `tim` matching inside `vitamin`,
 * while still allowing prefix matches like `chob` -> `chobani`.
 */
function hasWordPrefixMatch(
  textLower: string,
  variantLower: string,
  allowPrefix: boolean
): boolean {
  if (!variantLower) return false;
  const escaped = escapeForRegex(variantLower);
  const pattern = allowPrefix
    ? new RegExp(`(^|[^a-z0-9])${escaped}`, 'i')
    : new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return pattern.test(textLower);
}

/**
 * Count token group matches with variant awareness.
 * Uses displayVariants for in-memory matching (includes apostrophe forms).
 */
export function countTokenGroupMatches(
  text: string,
  tokenGroups: TokenGroup[]
): { 
  matchCount: number; 
  brandGroupHits: number;
  matchedVariants: string[];
} {
  if (!text) return { matchCount: 0, brandGroupHits: 0, matchedVariants: [] };
  
  const lower = text.toLowerCase();
  let matchCount = 0;
  let brandGroupHits = 0;
  const matchedVariants: string[] = [];
  
  for (const group of tokenGroups) {
    let groupMatched = false;
    const allowPrefix = group.isBrandLike || group.canonical.length >= 4;
    // Check displayVariants (includes apostrophe forms for accurate matching)
    for (const variant of group.displayVariants) {
      if (hasWordPrefixMatch(lower, variant.toLowerCase(), allowPrefix)) {
        groupMatched = true;
        matchedVariants.push(variant);
        break;
      }
    }
    
    if (groupMatched) {
      matchCount++;
      if (group.isBrandLike) {
        brandGroupHits++;
      }
    }
  }
  
  return { matchCount, brandGroupHits, matchedVariants };
}

/**
 * Build PostgREST filter string for AND-grouped token search.
 * 
 * CRITICAL: Uses dbVariants (NO apostrophes) to avoid PostgREST parsing issues.
 * 
 * For tokens ["barqs", "rootbeer", "bottle"] with dbVariants:
 * - Group 1 (barqs): ["barqs", "barq"] (NO "barq's")
 * - Group 2 (rootbeer): ["rootbeer"]
 * - Group 3 (bottle): ["bottle"]
 * 
 * Result: AND of OR groups
 */
export function buildAndGroupedFilter(tokenGroups: TokenGroup[]): string {
  if (tokenGroups.length === 0) return '';
  
  // Build OR conditions for each group using DB-SAFE variants only
  const groupConditions = tokenGroups.map(group => {
    const variantConditions = group.dbVariants.flatMap(variant => {
      const escaped = escapeForLike(variant);
      const conditions: string[] = [
        `canonical_name.ilike.%${escaped}%`,
        `brand_name.ilike.%${escaped}%`,
      ];
      // Plans Phase 15: consult food_objects.aliases (TEXT[]) via
      // array-contains when the variant is safe to inline into a
      // PostgREST `{...}` literal. This closes the loop on Packet 15
      // alias enrichment: resolutions that append the request's
      // normalized_input as an alias will now match here, not just
      // in the Packet 6 ingredient matcher. Variants with braces or
      // commas would break the literal syntax; skip alias on those.
      const aliasVariant = variant.toLowerCase();
      if (aliasVariant.length > 0 && !/[,{}]/.test(aliasVariant)) {
        conditions.push(`aliases.cs.{${aliasVariant}}`);
      }
      return conditions;
    });
    return `or(${variantConditions.join(',')})`;
  });
  
  // If only one group, just return that OR condition
  if (groupConditions.length === 1) {
    return groupConditions[0];
  }
  
  // Wrap all groups in and(...)
  return `and(${groupConditions.join(',')})`;
}

/**
 * Build a brand-gated OR fallback filter.
 * 
 * If we have brand-like groups, the fallback MUST still include brand variants
 * to prevent generic tokens from dominating.
 * 
 * Returns: { filter: string, requiresBrandHit: boolean }
 */
export function buildBrandGatedFallbackFilter(tokenGroups: TokenGroup[]): {
  filter: string;
  requiresBrandHit: boolean;
  brandGroupVariants: string[];
} {
  const allConditions: string[] = [];
  const brandGroupVariants: string[] = [];
  let hasBrandGroups = false;
  
  for (const group of tokenGroups) {
    if (group.isBrandLike) {
      hasBrandGroups = true;
      brandGroupVariants.push(...group.dbVariants);
    }
    
    for (const variant of group.dbVariants) {
      const escaped = escapeForLike(variant);
      allConditions.push(`canonical_name.ilike.%${escaped}%`);
      allConditions.push(`brand_name.ilike.%${escaped}%`);
    }
  }
  
  return {
    filter: allConditions.join(','),
    requiresBrandHit: hasBrandGroups,
    brandGroupVariants,
  };
}

/**
 * Build a simple OR filter for fallback (matches ANY variant of ANY group).
 * Uses DB-safe variants only.
 */
export function buildOrFallbackFilter(tokenGroups: TokenGroup[]): string {
  const allConditions: string[] = [];
  
  for (const group of tokenGroups) {
    for (const variant of group.dbVariants) {
      const escaped = escapeForLike(variant);
      allConditions.push(`canonical_name.ilike.%${escaped}%`);
      allConditions.push(`brand_name.ilike.%${escaped}%`);
    }
  }
  
  return allConditions.join(',');
}

/**
 * Check if a food item matches any brand-like token group.
 * Used for brand-gated fallback filtering.
 */
export function matchesBrandGroup(
  canonicalName: string,
  brandName: string | null,
  brandGroupVariants: string[]
): boolean {
  if (brandGroupVariants.length === 0) return true; // No brand requirement
  
  const combinedLower = `${canonicalName} ${brandName || ''}`.toLowerCase();
  
  for (const variant of brandGroupVariants) {
    if (hasWordPrefixMatch(combinedLower, variant.toLowerCase(), true)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Debug logging for search normalization (dev only).
 */
export function logSearchDebug(
  stage: string,
  data: Record<string, unknown>
): void {
  if (process.env.NODE_ENV !== 'production' && process.env.SEARCH_DEBUG === 'true') {
    console.log(`[Search Debug] ${stage}:`, JSON.stringify(data, null, 2));
  }
}

/**
 * Force debug logging regardless of env (for explicit debug=true requests).
 */
export function logSearchDebugForced(
  stage: string,
  data: Record<string, unknown>
): void {
  console.log(`[Search Debug] ${stage}:`, JSON.stringify(data, null, 2));
}
