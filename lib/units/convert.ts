/**
 * Unit conversion utilities for journal entries.
 *
 * Phase 1: serving ↔ grams
 * Phase 2: grams ↔ USDA household measures (cup, tablespoon, oz, etc.)
 *
 * payload.quantity ALWAYS remains the serving multiplier for nutrition math.
 * quantity_g is a derived canonical weight stored alongside it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single household portion measure (from food_objects.measures). */
export interface Measure {
  /** Canonical lowercase unit string (e.g. "cup", "tablespoon", "oz") */
  unit: string;
  /** Grams per 1 of this unit */
  grams: number;
  /** Optional human-readable label */
  label?: string;
}

/**
 * The built-in unit modes. Measure units (from USDA data) are represented
 * as arbitrary lowercase strings and are NOT part of this literal union —
 * they're validated at runtime against the measures array.
 */
export type EntryUnit = 'serving' | 'g' | string;

/** Result of computing quantity_g + the serving multiplier */
export interface ConversionResult {
  /** Serving multiplier (drives nutrition math, stored in payload.quantity) */
  servingQty: number;
  /** Canonical grams (stored in journal_entries.quantity_g column) */
  quantityG: number | null;
  /** Display unit */
  unit: string;
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/**
 * Given the user's input unit + value, compute the canonical grams and serving
 * multiplier.
 *
 * Supported unit modes:
 *   'serving' — value is a serving multiplier; grams = value * servingSizeG
 *   'g'       — value is grams; servingQty = grams / servingSizeG
 *   <measure> — value is in that measure unit; grams resolved via measures[]
 *
 * @param inputUnit    - 'serving', 'g', or a measure unit string (e.g. 'cup')
 * @param inputValue   - The numeric value the user entered
 * @param servingSizeG - Grams per 1 serving (from food object). Must be > 0.
 * @param measures     - Optional USDA household measures for this food.
 * @returns ConversionResult with both servingQty and quantityG
 */
export function computeQuantities(
  inputUnit: string | undefined,
  inputValue: number | undefined,
  servingSizeG: number | null | undefined,
  measures?: Measure[] | null,
): ConversionResult {
  const unit = normalizeUnit(inputUnit);
  const value = typeof inputValue === 'number' && inputValue > 0 ? inputValue : 1;
  const ssg = typeof servingSizeG === 'number' && servingSizeG > 0 ? servingSizeG : null;

  // ----- Grams mode -----
  if (unit === 'g') {
    if (ssg) {
      return { servingQty: value / ssg, quantityG: value, unit: 'g' };
    }
    return { servingQty: 1, quantityG: value, unit: 'g' };
  }

  // ----- Serving mode -----
  if (unit === 'serving') {
    if (ssg) {
      return { servingQty: value, quantityG: value * ssg, unit: 'serving' };
    }
    return { servingQty: value, quantityG: null, unit: 'serving' };
  }

  // ----- Measure unit mode (e.g. 'cup', 'tablespoon', 'oz') -----
  const measure = findMeasure(unit, measures);
  if (measure) {
    const grams = value * measure.grams;
    const servingQty = ssg ? grams / ssg : 1;
    return { servingQty, quantityG: grams, unit };
  }

  // Unknown unit — treat as serving (fallback)
  if (ssg) {
    return { servingQty: value, quantityG: value * ssg, unit };
  }
  return { servingQty: value, quantityG: null, unit };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a user-supplied unit string to a canonical form. */
export function normalizeUnit(unit: string | undefined | null): string {
  if (!unit) return 'serving';
  const lower = unit.trim().toLowerCase();
  if (lower === 'g' || lower === 'gram' || lower === 'grams') return 'g';
  if (lower === '' || lower === 'serving' || lower === 'servings') return 'serving';
  // Return as-is for measure units (already lowercase/trimmed)
  return lower;
}

/**
 * Find a measure entry by unit string. Case-insensitive match.
 * Returns undefined if not found or measures is empty.
 */
export function findMeasure(
  unit: string,
  measures?: Measure[] | null,
): Measure | undefined {
  if (!measures || measures.length === 0) return undefined;
  const lower = unit.trim().toLowerCase();
  return measures.find((m) => m.unit.toLowerCase() === lower);
}

/**
 * Determine which unit options are valid for a food item.
 *
 * Always includes 'serving'.
 * Includes 'g' if servingSizeG > 0 (enables serving ↔ gram conversion).
 * Includes each measure unit that has a valid grams value.
 */
export function getValidUnits(
  servingSizeG: number | null | undefined,
  measures?: Measure[] | null,
): string[] {
  const units: string[] = ['serving'];

  if (typeof servingSizeG === 'number' && servingSizeG > 0) {
    units.push('g');
  }

  if (measures && measures.length > 0) {
    for (const m of measures) {
      if (m.unit && m.grams > 0) {
        const normalized = m.unit.trim().toLowerCase();
        // Avoid duplicating 'g' or 'serving'
        if (normalized !== 'g' && normalized !== 'serving' && !units.includes(normalized)) {
          units.push(normalized);
        }
      }
    }
  }

  return units;
}

/**
 * Convert a quantity from one unit to another.
 * Returns the equivalent value in the target unit, or null if conversion is impossible.
 */
export function convertBetweenUnits(
  value: number,
  fromUnit: string,
  toUnit: string,
  servingSizeG: number | null | undefined,
  measures?: Measure[] | null,
): number | null {
  if (fromUnit === toUnit) return value;

  // Step 1: Convert fromUnit → grams
  const result = computeQuantities(fromUnit, value, servingSizeG, measures);
  const grams = result.quantityG;
  if (grams === null || grams <= 0) return null;

  // Step 2: Convert grams → toUnit
  const toNorm = normalizeUnit(toUnit);

  if (toNorm === 'g') return grams;

  if (toNorm === 'serving') {
    const ssg = typeof servingSizeG === 'number' && servingSizeG > 0 ? servingSizeG : null;
    if (ssg) return grams / ssg;
    return null;
  }

  // Measure unit
  const measure = findMeasure(toNorm, measures);
  if (measure && measure.grams > 0) {
    return grams / measure.grams;
  }

  return null;
}
