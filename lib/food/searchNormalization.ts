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
 * - But we also generate VARIANTS with apostrophes for DB matching
 * - This allows "barq's" to match both "Barq's" and "Barqs" in the database
 * - Short tokens (< 2 chars) are filtered out to prevent over-matching
 */

// Apostrophes/quotes to REMOVE (not replace with space)
const APOSTROPHE_REGEX = /[''`']/g;

// Punctuation to replace with space
const PUNCTUATION_REGEX = /[-/\\.,;:!?()[\]{}""„"@#$%^&*+=|<>~]+/g;

// Minimum token length to include in search
const MIN_TOKEN_LENGTH = 2;

// Common words that are NOT brand-like (for brand detection)
const COMMON_WORDS = new Set([
  'root', 'beer', 'soda', 'cola', 'juice', 'water', 'tea', 'coffee',
  'cheese', 'burger', 'chicken', 'beef', 'pork', 'fish', 'salad',
  'bread', 'rice', 'pasta', 'pizza', 'sandwich', 'wrap', 'taco',
  'fries', 'chips', 'cookie', 'cake', 'pie', 'ice', 'cream',
  'milk', 'yogurt', 'butter', 'eggs', 'bacon', 'ham', 'turkey',
  'apple', 'orange', 'banana', 'grape', 'berry', 'lemon', 'lime',
  'diet', 'zero', 'light', 'lite', 'free', 'low', 'fat', 'sugar',
  'double', 'triple', 'big', 'small', 'medium', 'large', 'extra',
  'hot', 'cold', 'iced', 'frozen', 'fresh', 'crispy', 'grilled',
  'original', 'classic', 'regular', 'special', 'deluxe', 'premium',
]);

/**
 * A token group represents one logical search term with multiple ILIKE variants.
 * For "barq's" we generate variants: ["barq's", "barqs", "barq"]
 * All variants are ORed together, but groups are ANDed.
 */
export interface TokenGroup {
  canonical: string;        // The normalized token (e.g., "barqs")
  variants: string[];       // All ILIKE variants to try (e.g., ["barq's", "barqs", "barq"])
  isBrandLike: boolean;     // True if this looks like a brand name (not a common food word)
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
 * Returns the position and the "base" form before the apostrophe.
 */
function findApostropheTokens(rawLower: string): Map<string, string[]> {
  // Find patterns like "barq's" or "mcdonald's" in the raw input
  const apostrophePattern = /([a-z]+)[''`']s?\b/gi;
  const matches = new Map<string, string[]>();
  
  let match;
  while ((match = apostrophePattern.exec(rawLower)) !== null) {
    const fullMatch = match[0].toLowerCase();
    const base = match[1].toLowerCase();
    // The normalized form would be base + 's' (without apostrophe)
    const normalizedForm = fullMatch.replace(/[''`']/g, '');
    
    if (!matches.has(normalizedForm)) {
      matches.set(normalizedForm, []);
    }
    // Store variants: the original with apostrophe, and the base without 's
    const variants = matches.get(normalizedForm)!;
    if (!variants.includes(fullMatch)) variants.push(fullMatch);
    // Also add forms with different apostrophe styles
    const withStandardApostrophe = base + "'s";
    if (!variants.includes(withStandardApostrophe)) variants.push(withStandardApostrophe);
  }
  
  return matches;
}

/**
 * Generate search variants for a token.
 * For brand-like tokens, include apostrophe variants and stems.
 */
function generateTokenVariants(
  token: string,
  apostropheMap: Map<string, string[]>,
  isBrandLike: boolean
): string[] {
  const variants: string[] = [token];
  
  // Check if this token had an apostrophe form in the original query
  const apostropheVariants = apostropheMap.get(token);
  if (apostropheVariants) {
    for (const v of apostropheVariants) {
      if (!variants.includes(v)) variants.push(v);
    }
  }
  
  // For brand-like tokens ending in 's', add the stem (e.g., "barqs" -> "barq")
  // This helps match "Barq's" vs "Barq" variations
  if (isBrandLike && token.length >= 4 && token.endsWith('s')) {
    const stem = token.slice(0, -1);
    if (stem.length >= 3 && !variants.includes(stem)) {
      variants.push(stem);
    }
    // Also add stem + apostrophe + s
    const stemWithApostrophe = stem + "'s";
    if (!variants.includes(stemWithApostrophe)) {
      variants.push(stemWithApostrophe);
    }
  }
  
  // For brand-like tokens NOT ending in 's', also try adding 's and 's
  if (isBrandLike && token.length >= 3 && !token.endsWith('s')) {
    const withS = token + 's';
    const withApostropheS = token + "'s";
    if (!variants.includes(withS)) variants.push(withS);
    if (!variants.includes(withApostropheS)) variants.push(withApostropheS);
  }
  
  return variants;
}

/**
 * Check if a token looks like a brand name (not a common food word).
 */
function isBrandLikeToken(token: string): boolean {
  // Too short to be a distinctive brand
  if (token.length < 4) return false;
  
  // Common food words are not brand-like
  if (COMMON_WORDS.has(token)) return false;
  
  // If it's not in our common words list and is long enough, treat as brand-like
  return true;
}

/**
 * Normalize a search query for safe, consistent matching.
 * 
 * Returns both:
 * - Canonical tokens for scoring (apostrophes removed)
 * - Token groups with variants for DB matching (includes apostrophe forms)
 */
export function normalizeSearchQuery(raw: string): NormalizedSearchQuery {
  if (!raw) {
    return { normalized: '', tokens: [], tokenGroups: [], originalRaw: raw };
  }
  
  const rawLower = raw.toLowerCase();
  
  // Find apostrophe patterns in the original query BEFORE removing them
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
  
  // Build token groups with variants
  const tokenGroups: TokenGroup[] = tokens.map(token => {
    const isBrandLike = isBrandLikeToken(token);
    const variants = generateTokenVariants(token, apostropheMap, isBrandLike);
    
    return {
      canonical: token,
      variants,
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
 */
export function escapeForLike(str: string): string {
  return str
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Count how many canonical tokens match in a given text.
 * Also checks variant forms for apostrophe-safe matching.
 */
export function countTokenMatches(text: string, tokens: string[]): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return tokens.filter(token => lower.includes(token)).length;
}

/**
 * Count token group matches with variant awareness.
 * Returns both the count and details about which variants matched.
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
    // Check if ANY variant matches
    let groupMatched = false;
    for (const variant of group.variants) {
      if (lower.includes(variant)) {
        groupMatched = true;
        matchedVariants.push(variant);
        break; // One match per group is enough
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
 * For tokens ["barqs", "root", "beer"] with variants:
 * - Group 1 (barqs): barq's, barqs, barq
 * - Group 2 (root): root
 * - Group 3 (beer): beer
 * 
 * Result: All rows must match at least one variant from EACH group.
 * 
 * PostgREST nested AND/OR syntax:
 * and=(or(name.ilike.%barq's%,name.ilike.%barqs%,brand.ilike.%barq's%,...),or(name.ilike.%root%,...),...)
 */
export function buildAndGroupedFilter(tokenGroups: TokenGroup[]): string {
  if (tokenGroups.length === 0) return '';
  
  // Build OR conditions for each group
  const groupConditions = tokenGroups.map(group => {
    const variantConditions = group.variants.flatMap(variant => {
      const escaped = escapeForLike(variant);
      return [
        `canonical_name.ilike.%${escaped}%`,
        `brand_name.ilike.%${escaped}%`,
      ];
    });
    // Wrap in or(...)
    return `or(${variantConditions.join(',')})`;
  });
  
  // If only one group, just return that OR condition (no wrapping and)
  if (groupConditions.length === 1) {
    return groupConditions[0];
  }
  
  // Wrap all groups in and(...)
  return `and(${groupConditions.join(',')})`;
}

/**
 * Build a simple OR filter for fallback (matches ANY variant of ANY group).
 */
export function buildOrFallbackFilter(tokenGroups: TokenGroup[]): string {
  const allConditions: string[] = [];
  
  for (const group of tokenGroups) {
    for (const variant of group.variants) {
      const escaped = escapeForLike(variant);
      allConditions.push(`canonical_name.ilike.%${escaped}%`);
      allConditions.push(`brand_name.ilike.%${escaped}%`);
    }
  }
  
  return allConditions.join(',');
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
