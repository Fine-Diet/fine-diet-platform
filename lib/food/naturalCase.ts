/**
 * Natural Case Utilities
 * 
 * Fixes apostrophe/contraction casing in title-cased strings.
 * Used by both ingestion (normalizeName) and display (formatFoodName).
 */

/**
 * Sanitize USDA brand-owner identifiers from display names.
 * 
 * Some USDA items have canonicalName values that end with a parenthetical
 * company string including a long numeric identifier, e.g.
 *   "Barq's Root Beer Bottle, 24 fl oz (The Coca-Cola Company-0049000000016)"
 * 
 * This function strips the trailing "-<digits>" (8+ digits) from the FINAL
 * parenthetical group only, keeping the company name:
 *   → "Barq's Root Beer Bottle, 24 fl oz (The Coca-Cola Company)"
 * 
 * Rules:
 * - Only affects the LAST parenthetical group at end of string
 * - Only removes suffix if it's "-" followed by 8+ digits
 * - Does NOT affect short codes like "(Brand-2)" or "(Foo-1234567)"
 * - Trims any resulting trailing whitespace
 * 
 * @param name - The food name to sanitize
 * @returns Sanitized name for display
 */
export function sanitizeDisplayName(name: string): string {
  if (!name) return name;
  
  // Match final parenthetical group at end of string
  // Capture: everything before, content inside parens, any trailing space
  const match = name.match(/^(.*)\(([^)]+)\)\s*$/);
  if (!match) return name;
  
  const [, beforeParen, parenContent] = match;
  
  // Check if paren content ends with -<8+ digits>
  const cleanedContent = parenContent.replace(/-\d{8,}$/, '');
  
  // If nothing changed, return original
  if (cleanedContent === parenContent) return name;
  
  // If content is now empty or just whitespace after stripping, remove parens entirely
  const trimmedContent = cleanedContent.trim();
  if (!trimmedContent) {
    return beforeParen.trim();
  }
  
  // Reconstruct with cleaned content
  return `${beforeParen}(${trimmedContent})`.trim();
}

/**
 * Fix apostrophe/contraction casing in a title-cased string.
 * 
 * Converts possessive 'S and common contractions to lowercase
 * while preserving Irish-style name prefixes like O'Reilly.
 * 
 * After standard title-casing (capitalize each word boundary), apostrophe
 * suffixes get incorrectly capitalized:
 *   - WENDY'S → Wendy'S (should be Wendy's)
 *   - WE'RE → We'Re (should be We're)
 * 
 * This function fixes those patterns while NOT affecting:
 *   - O'Reilly (stays O'Reilly - the R starts a name segment, not a contraction)
 *   - D'Angelo (stays D'Angelo)
 * 
 * @param text - Title-cased text to fix
 * @returns Text with corrected apostrophe casing
 */
export function fixApostropheCasing(text: string): string {
  if (!text) return text;
  
  // Fix possessive/contraction patterns
  // These patterns match the output of title-casing where each word-start is capitalized
  // 
  // After title-case: WENDY'S → Wendy'S, WE'RE → We'Re, I'LL → I'Ll
  // Irish names like O'REILLY → O'Reilly are already correct (Reilly doesn't match patterns)
  
  return text
    // Possessive 'S → 's (e.g., Wendy'S → Wendy's, McDonald'S → McDonald's)
    .replace(/'S\b/g, "'s")
    // Contractions
    .replace(/'T\b/g, "'t")     // can't, won't, don't
    .replace(/'Re\b/g, "'re")   // we're, you're, they're
    .replace(/'Ve\b/g, "'ve")   // I've, we've, they've
    .replace(/'Ll\b/g, "'ll")   // I'll, we'll, they'll
    .replace(/'D\b/g, "'d")     // I'd, we'd, they'd
    .replace(/'M\b/g, "'m");    // I'm
}

/**
 * Format a stored food name string for display.
 * 
 * Use this for stored strings (like entry.payload.name, historyItem.name, meal item names)
 * that may have been saved before sanitization was added. This applies the same pipeline
 * as formatFoodName() but for plain strings:
 * 
 * 1. Sanitize USDA brand-owner identifiers (removes "-0049000000016" etc.)
 * 2. Fix apostrophe casing (Barq'S → Barq's, Mcdonald'S → Mcdonald's)
 * 
 * @param name - The stored food name string to format
 * @returns Formatted name for display
 */
export function formatFoodNameString(name: string): string {
  if (!name) return name;
  return fixApostropheCasing(sanitizeDisplayName(name));
}
