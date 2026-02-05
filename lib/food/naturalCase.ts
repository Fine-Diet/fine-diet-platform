/**
 * Natural Case Utilities
 * 
 * Fixes apostrophe/contraction casing in title-cased strings.
 * Used by both ingestion (normalizeName) and display (formatFoodName).
 */

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
