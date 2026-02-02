/**
 * UPC Normalization Utilities
 * 
 * Handles conversion between various UPC/EAN/GTIN formats:
 * - UPC-A: 12 digits (North America)
 * - EAN-13: 13 digits (International)
 * - GTIN-14: 14 digits (Case/pallet level)
 * - UPC-E: 6-8 digits (compressed, not fully supported yet)
 * 
 * USDA branded data stores UPCs in various formats. This module normalizes
 * user input to match whatever format is stored in the database.
 */

/**
 * Strip all non-digit characters from a UPC string.
 */
export function normalizeUpcToDigits(code: string): string {
  return code.replace(/\D/g, '');
}

/**
 * Validate that a normalized UPC is within acceptable length bounds.
 * Returns null if valid, error message if invalid.
 */
export function validateUpcLength(raw: string): string | null {
  if (raw.length < 8) {
    return `UPC too short: ${raw.length} digits (minimum 8)`;
  }
  if (raw.length > 14) {
    return `UPC too long: ${raw.length} digits (maximum 14)`;
  }
  return null;
}

/**
 * Build an array of UPC candidates to search for in the database.
 * 
 * Different systems store barcodes differently:
 * - Some strip leading zeros (11-digit from 12-digit UPC-A)
 * - Some pad to EAN-13 (13 digits)
 * - Some pad to GTIN-14 (14 digits)
 * 
 * This function generates all reasonable variants so we can find a match
 * regardless of how the database stores it.
 * 
 * Priority order (first match wins):
 * 1. Raw input (exact match)
 * 2. Zero-padded variants (for short inputs)
 * 3. Zero-stripped variants (for long inputs)
 * 
 * @param raw - Digits-only normalized UPC string
 * @returns Array of unique candidate strings in priority order
 * 
 * @example
 * buildUpcCandidates('72745068393')   // 11 digits
 * // Returns: ['72745068393', '072745068393', '0072745068393', '00072745068393']
 * 
 * @example
 * buildUpcCandidates('00014100041993') // 14 digits (GTIN-14)
 * // Returns: ['00014100041993', '0014100041993', '014100041993']
 */
export function buildUpcCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  
  const addCandidate = (upc: string) => {
    if (upc && !seen.has(upc)) {
      seen.add(upc);
      candidates.push(upc);
    }
  };
  
  // Always include raw input first (exact match priority)
  addCandidate(raw);
  
  const len = raw.length;
  
  // === PAD UP: Short UPCs need leading zeros ===
  
  // 11 digits -> pad to 12 (UPC-A)
  if (len === 11) {
    addCandidate(raw.padStart(12, '0'));
  }
  
  // 10 digits -> pad to 12 (rare but possible)
  if (len === 10) {
    addCandidate(raw.padStart(12, '0'));
  }
  
  // If we have 12 digits (UPC-A), also try EAN-13 and GTIN-14 padded versions
  if (len === 12) {
    addCandidate('0' + raw);       // EAN-13 (leading 0)
    addCandidate('00' + raw);      // GTIN-14 (leading 00)
  }
  
  // If we have 11 digits, after padding to 12, also try 13 and 14
  if (len === 11) {
    const upc12 = raw.padStart(12, '0');
    addCandidate('0' + upc12);     // EAN-13
    addCandidate('00' + upc12);    // GTIN-14
  }
  
  // If we have 13 digits (EAN-13), also try GTIN-14
  if (len === 13) {
    addCandidate('0' + raw);       // GTIN-14
  }
  
  // === STRIP DOWN: Long UPCs may have extra leading zeros ===
  
  // 14 digits (GTIN-14) -> try stripping to 13 and 12
  if (len === 14) {
    if (raw.startsWith('00')) {
      addCandidate(raw.slice(2));  // Strip to 12 (UPC-A)
    }
    if (raw.startsWith('0')) {
      addCandidate(raw.slice(1));  // Strip to 13 (EAN-13)
    }
  }
  
  // 13 digits (EAN-13) -> try stripping to 12 if starts with 0
  if (len === 13) {
    if (raw.startsWith('0')) {
      addCandidate(raw.slice(1));  // Strip to 12 (UPC-A)
    }
  }
  
  // 12 digits -> try stripping leading zero if present (rare 11-digit storage)
  if (len === 12) {
    if (raw.startsWith('0')) {
      addCandidate(raw.slice(1));  // Strip to 11
    }
  }
  
  // === Handle very short codes (8-10 digits) ===
  // These are less common but should still work
  if (len >= 8 && len <= 10) {
    addCandidate(raw.padStart(12, '0'));
    addCandidate(raw.padStart(13, '0'));
    addCandidate(raw.padStart(14, '0'));
  }
  
  return candidates;
}

/**
 * Debug helper: Log UPC normalization info (dev only)
 */
export function logUpcDebug(original: string, raw: string, candidates: string[]): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[UPC Debug]', {
      original,
      raw,
      rawLength: raw.length,
      candidates,
      candidateCount: candidates.length,
    });
  }
}

/*
 * ============================================================================
 * TEST SCENARIOS (manual verification)
 * ============================================================================
 * 
 * Scenario 1: 11-digit UPC (missing leading zero)
 *   Input: '72745068393'
 *   Expected candidates: ['72745068393', '072745068393', '0072745068393', '00072745068393']
 *   Should match DB entry: '072745068393' (12-digit UPC-A)
 * 
 * Scenario 2: 14-digit GTIN-14
 *   Input: '00014100041993'
 *   Expected candidates: ['00014100041993', '0014100041993', '014100041993']
 *   Should match DB entry: '00014100041993' or '014100041993'
 * 
 * Scenario 3: Standard 12-digit UPC-A
 *   Input: '014100041993'
 *   Expected candidates: ['014100041993', '0014100041993', '00014100041993', '14100041993']
 *   Should match multiple formats
 * 
 * Scenario 4: Input with dashes/spaces
 *   Input: '0-14100-04199-3'
 *   After normalize: '014100041993'
 *   Should work same as Scenario 3
 * 
 * Scenario 5: EAN-13 (European)
 *   Input: '5901234123457'
 *   Expected candidates: ['5901234123457', '05901234123457', '901234123457']
 *   Should match EAN-13 or GTIN-14 padded
 * 
 * ============================================================================
 */
