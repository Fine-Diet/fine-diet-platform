/**
 * Unit conversion utilities for journal entries.
 *
 * Phase 1: serving ↔ grams only.
 * All conversions require a valid servingSizeG (grams per 1 serving).
 *
 * payload.quantity ALWAYS remains the serving multiplier for nutrition math.
 * quantity_g is a derived canonical weight stored alongside it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The unit modes we support in Phase 1 */
export type EntryUnit = 'serving' | 'g';

/** Result of computing quantity_g + the serving multiplier */
export interface ConversionResult {
  /** Serving multiplier (drives nutrition math, stored in payload.quantity) */
  servingQty: number;
  /** Canonical grams (stored in journal_entries.quantity_g column) */
  quantityG: number | null;
  /** Display unit */
  unit: EntryUnit;
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/**
 * Given the user's input unit + value, compute the canonical grams and serving
 * multiplier.
 *
 * @param inputUnit   - 'serving' or 'g'
 * @param inputValue  - The numeric value the user entered (servings or grams)
 * @param servingSizeG - Grams per 1 serving (from food object). Must be > 0.
 * @returns ConversionResult with both servingQty and quantityG
 */
export function computeQuantities(
  inputUnit: string | undefined,
  inputValue: number | undefined,
  servingSizeG: number | null | undefined,
): ConversionResult {
  const unit = normalizeUnit(inputUnit);
  const value = typeof inputValue === 'number' && inputValue > 0 ? inputValue : 1;
  const ssg = typeof servingSizeG === 'number' && servingSizeG > 0 ? servingSizeG : null;

  if (unit === 'g') {
    // User entered grams
    if (ssg) {
      return {
        servingQty: value / ssg,
        quantityG: value,
        unit: 'g',
      };
    }
    // No serving size → can't compute serving multiplier; store grams but
    // fall back to 1 serving so existing nutrition math doesn't break.
    return {
      servingQty: 1,
      quantityG: value,
      unit: 'g',
    };
  }

  // Unit is 'serving' (default)
  if (ssg) {
    return {
      servingQty: value,
      quantityG: value * ssg,
      unit: 'serving',
    };
  }

  // No serving size → can't compute grams
  return {
    servingQty: value,
    quantityG: null,
    unit: 'serving',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a user-supplied unit string to our supported enum. */
export function normalizeUnit(unit: string | undefined | null): EntryUnit {
  if (!unit) return 'serving';
  const lower = unit.trim().toLowerCase();
  if (lower === 'g' || lower === 'gram' || lower === 'grams') return 'g';
  return 'serving';
}

/**
 * Determine which unit options are valid for a food item.
 * Returns ['serving'] if no conversion data, ['serving', 'g'] if servingSizeG > 0.
 */
export function getValidUnits(servingSizeG: number | null | undefined): EntryUnit[] {
  if (typeof servingSizeG === 'number' && servingSizeG > 0) {
    return ['serving', 'g'];
  }
  return ['serving'];
}
