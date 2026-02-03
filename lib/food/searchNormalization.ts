/**
 * Search Query Normalization
 * 
 * Normalizes user search input to prevent common issues:
 * - Hyphens interpreted as negation operators
 * - Inconsistent apostrophe variants
 * - Punctuation breaking tokenization
 * 
 * Key principles:
 * - Apostrophes are REMOVED (not replaced with space) to keep "mcdonald's" → "mcdonalds"
 * - Other punctuation converted to spaces
 * - Short tokens (< 2 chars) are filtered out to prevent over-matching
 */

// Apostrophes/quotes to REMOVE (not replace with space)
// This keeps "mcdonald's" as "mcdonalds" instead of "mcdonald s"
const APOSTROPHE_REGEX = /[''`']/g;

// Punctuation to replace with space
// Includes: - / \ . , : ; ( ) [ ] { } ! ? " " " @ # $ % ^ & * + = | < > ~
const PUNCTUATION_REGEX = /[-/\\.,;:!?()[\]{}""„"@#$%^&*+=|<>~]+/g;

// Minimum token length to include in search (filters out noise like "s", "a", etc.)
const MIN_TOKEN_LENGTH = 2;

/**
 * Normalize a search query for safe, consistent matching.
 * 
 * Steps:
 * 1. Lowercase
 * 2. REMOVE apostrophes (mcdonald's → mcdonalds)
 * 3. Replace other punctuation with spaces (hyphen → space)
 * 4. Collapse multiple spaces
 * 5. Trim
 * 6. Filter tokens by minimum length
 * 
 * @returns Object with normalized string and extracted tokens
 */
export function normalizeSearchQuery(raw: string): {
  normalized: string;
  tokens: string[];
  originalRaw: string;
} {
  if (!raw) {
    return { normalized: '', tokens: [], originalRaw: raw };
  }
  
  let normalized = raw;
  
  // 1. Lowercase
  normalized = normalized.toLowerCase();
  
  // 2. REMOVE apostrophes (keeps "mcdonald's" as "mcdonalds")
  // This is critical - we don't want "s" as a separate token
  normalized = normalized.replace(APOSTROPHE_REGEX, '');
  
  // 3. Normalize fancy quotes then replace with space
  normalized = normalized.replace(/[""„"]/g, ' ');
  
  // 4. Replace other punctuation with spaces
  // CRITICAL: This converts "-" to " " so "mcdonalds - cheese" → "mcdonalds   cheese"
  normalized = normalized.replace(PUNCTUATION_REGEX, ' ');
  
  // 5. Collapse multiple whitespace to single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // 6. Trim
  normalized = normalized.trim();
  
  // 7. Extract tokens (split on space, filter by minimum length)
  // This filters out noise tokens like "s", "a", "of", etc.
  const tokens = normalized
    .split(' ')
    .filter(t => t.length >= MIN_TOKEN_LENGTH);
  
  return {
    normalized,
    tokens,
    originalRaw: raw,
  };
}

/**
 * Normalize a food name for deduplication comparison.
 * Similar to query normalization but for database values.
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
 * Build a Supabase ILIKE condition for tokenized search.
 * Creates OR conditions where EACH token must match somewhere in the text.
 * 
 * For "mcdonalds cheese":
 * - Token 1: canonical_name ILIKE '%mcdonalds%' OR brand_name ILIKE '%mcdonalds%'
 * - Token 2: canonical_name ILIKE '%cheese%' OR brand_name ILIKE '%cheese%'
 * 
 * Note: This builds individual conditions. Supabase's .or() is limited,
 * so we return an array of patterns for manual filtering.
 */
export function buildTokenPatterns(tokens: string[]): string[] {
  return tokens.map(token => `%${token}%`);
}

/**
 * Escape special characters for LIKE/ILIKE patterns.
 * Prevents SQL injection via search terms.
 */
export function escapeForLike(str: string): string {
  return str
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Check if a text contains all given tokens (case-insensitive).
 * Used for post-query filtering/scoring.
 */
export function textContainsAllTokens(text: string, tokens: string[]): boolean {
  const lower = text.toLowerCase();
  return tokens.every(token => lower.includes(token));
}

/**
 * Count how many tokens match in a given text.
 * Used for scoring - more matches = higher relevance.
 */
export function countTokenMatches(text: string, tokens: string[]): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return tokens.filter(token => lower.includes(token)).length;
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
