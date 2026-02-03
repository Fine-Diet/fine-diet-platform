/**
 * Search Query Normalization
 * 
 * Normalizes user search input to prevent common issues:
 * - Hyphens interpreted as negation operators
 * - Inconsistent apostrophe variants
 * - Punctuation breaking tokenization
 * 
 * Key principle: Convert all punctuation to spaces, not removal,
 * so "mcdonald's" becomes "mcdonald s" (two tokens) rather than "mcdonalds".
 */

// Punctuation to replace with space (NOT removal)
// Includes: - / \ . , : ; ( ) [ ] { } ! ? " " " ' ' ' @ # $ % ^ & * + = | < > ~ `
const PUNCTUATION_REGEX = /[-/\\.,;:!?()[\]{}""„"'''`@#$%^&*+=|<>~]+/g;

/**
 * Normalize a search query for safe, consistent matching.
 * 
 * Steps:
 * 1. Lowercase
 * 2. Normalize fancy quotes/apostrophes to standard
 * 3. Replace ALL punctuation with spaces (hyphen becomes space, not negation)
 * 4. Collapse multiple spaces
 * 5. Trim
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
  
  // 2. Normalize fancy quotes to standard (then they'll become spaces)
  normalized = normalized
    .replace(/['']/g, "'")  // Fancy apostrophes → standard
    .replace(/[""„]/g, '"'); // Fancy quotes → standard
  
  // 3. Replace ALL punctuation with spaces
  // CRITICAL: This converts "-" to " " so "mcdonalds - cheese" → "mcdonalds   cheese"
  normalized = normalized.replace(PUNCTUATION_REGEX, ' ');
  
  // 4. Collapse multiple whitespace to single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // 5. Trim
  normalized = normalized.trim();
  
  // 6. Extract tokens (split on space, filter empty)
  const tokens = normalized.split(' ').filter(t => t.length > 0);
  
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
