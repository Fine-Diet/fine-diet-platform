/**
 * Results Pack Validation and Hashing
 * 
 * Validates results pack JSON structure and generates content hashes
 * for change detection and caching.
 */

import crypto from 'crypto';

export type PackValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  normalized?: any;
};

/**
 * Deterministic stringify for consistent hashing
 */
function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Generate SHA256 hash of normalized pack JSON
 */
export function hashPackJson(normalizedJson: any): string {
  const s = JSON.stringify(normalizedJson);
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Validate results pack JSON structure
 * 
 * Checks for required v2 structure (flow.page1-3) and provides
 * warnings for missing optional fields.
 */
export function validateResultsPack(packJson: any): PackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!packJson || typeof packJson !== 'object') {
    errors.push('Pack JSON must be an object.');
    return { ok: false, errors, warnings };
  }

  // Minimal required structure for v2: flow.page1-3
  const flow = packJson?.flow;
  if (!flow) {
    errors.push('Missing flow.');
  } else {
    for (const p of ['page1', 'page2', 'page3']) {
      if (!flow[p]) {
        errors.push(`Missing flow.${p}.`);
      }
    }
  }

  // Optional: check headline/body presence for common areas
  // Keep it lightweight so you don't block early content iteration
  if (flow?.page1) {
    const headline = flow.page1.headline ?? flow.page1.title;
    if (!headline) {
      warnings.push('flow.page1 headline/title is missing.');
    }
  }

  // Normalization: return as-is for now
  // If you already normalize packs elsewhere, call that instead
  const normalized = packJson;

  return { ok: errors.length === 0, errors, warnings, normalized };
}

