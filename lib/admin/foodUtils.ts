/**
 * Admin Food Management Utilities
 * 
 * Helper functions for food CRUD, bulk import, and merge operations.
 */

import crypto from 'crypto';
import type { ScoreReadinessTier, AdminFoodObject, BulkImportRow } from './foodTypes';
import { MICRONUTRIENT_FIELDS, ALL_NUTRIENT_FIELDS } from './foodTypes';

/**
 * Normalize a UPC code to digits only.
 * Returns null if input is empty or invalid.
 */
export function normalizeUpc(upc: string | null | undefined): string | null {
  if (!upc) return null;
  const digits = upc.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

/**
 * Generate a slug from text (lowercase, hyphen-separated).
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a short hash for uniqueness.
 */
export function shortHash(text: string, length = 6): string {
  return crypto.createHash('sha256').update(text).digest('hex').substring(0, length);
}

/**
 * Generate a stable source_id for Fine Diet internal foods.
 * 
 * Format:
 * - If UPC present: "fd_upc_<upc>"
 * - Otherwise: "fd_slug_<slug>_<hash>" where hash is from canonical+brand
 */
export function generateFineDietSourceId(
  canonicalName: string,
  brandName?: string | null,
  upc?: string | null
): string {
  const normalizedUpc = normalizeUpc(upc);
  
  if (normalizedUpc) {
    return `fd_upc_${normalizedUpc}`;
  }

  const combined = [canonicalName, brandName].filter(Boolean).join('|');
  const slug = slugify(canonicalName);
  const hash = shortHash(combined);
  
  // Limit slug length to keep source_id reasonable
  const truncatedSlug = slug.substring(0, 50);
  
  return `fd_slug_${truncatedSlug}_${hash}`;
}

/**
 * Parse a boolean from various input formats.
 */
export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

/**
 * Parse a number from string or number input.
 * Returns null if invalid or empty.
 */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.trim());
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Parse tags from comma-separated string or array.
 */
export function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String)
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Validate a food import row.
 * Returns array of error messages (empty if valid).
 * 
 * Validation rules:
 * - canonical_name is required
 * - All numeric nutrient values must be >= 0
 * - Blanks in CSV => null (not 0)
 * - serving_size_g must be > 0 if provided
 */
export function validateFoodImportRow(row: Record<string, unknown>, rowIndex: number): string[] {
  const errors: string[] = [];

  // Required: canonical_name
  if (!row.canonical_name || typeof row.canonical_name !== 'string' || !row.canonical_name.trim()) {
    errors.push(`Row ${rowIndex + 1}: canonical_name is required`);
  }

  // Optional but validate if present: serving_size_g
  if (row.serving_size_g !== undefined && row.serving_size_g !== null && row.serving_size_g !== '') {
    const size = parseNumber(row.serving_size_g);
    if (size === null || size <= 0) {
      errors.push(`Row ${rowIndex + 1}: serving_size_g must be a positive number`);
    }
  }

  // Validate all nutrient fields: must be >= 0 if present
  // This includes both old fields and new NDS fields
  const allNutrientFields = [
    // Old field names
    'calories',
    // New field name (calories_kcal maps to calories)
    'calories_kcal',
    // All other nutrients
    ...ALL_NUTRIENT_FIELDS.filter(f => f !== 'calories'),
  ];
  
  for (const field of allNutrientFields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
      const val = parseNumber(row[field]);
      if (val === null) {
        errors.push(`Row ${rowIndex + 1}: ${field} must be a valid number`);
      } else if (val < 0) {
        errors.push(`Row ${rowIndex + 1}: ${field} must be a non-negative number (got ${val})`);
      }
    }
  }

  // Optional but validate if present: UPC (should be at least 8 digits when normalized)
  if (row.upc !== undefined && row.upc !== null && row.upc !== '') {
    const upc = normalizeUpc(String(row.upc));
    if (!upc) {
      errors.push(`Row ${rowIndex + 1}: upc must be at least 8 digits`);
    }
  }

  return errors;
}

/**
 * Generate warnings for a food import row.
 * Returns array of warning messages.
 */
export function generateFoodImportWarnings(row: Record<string, unknown>, rowIndex: number): string[] {
  const warnings: string[] = [];

  // Check for calories (either field name)
  const hasCalories = (row.calories !== undefined && row.calories !== null && row.calories !== '') ||
                      (row.calories_kcal !== undefined && row.calories_kcal !== null && row.calories_kcal !== '');
  
  if (!hasCalories) {
    warnings.push(`Row ${rowIndex + 1}: No calories provided (will be null)`);
  }

  // Warn if no category
  if (!row.category || (typeof row.category === 'string' && !row.category.trim())) {
    warnings.push(`Row ${rowIndex + 1}: No category provided`);
  }

  // Calculate and warn about score readiness
  const readiness = calculateScoreReadinessFromRow(row);
  if (readiness === 'LOW') {
    warnings.push(`Row ${rowIndex + 1}: Low micronutrient completeness (Score Readiness: LOW)`);
  }

  return warnings;
}

// ============================================================================
// Score Readiness Calculation
// ============================================================================

/**
 * Calculate score readiness tier based on micronutrient completeness.
 * 
 * Tiers:
 * - LOW: 0-3 micronutrients filled
 * - MED: 4-7 micronutrients filled
 * - HIGH: 8+ micronutrients filled
 */
export function calculateScoreReadiness(food: Partial<AdminFoodObject>): ScoreReadinessTier {
  let filledCount = 0;
  
  for (const field of MICRONUTRIENT_FIELDS) {
    const value = food[field as keyof AdminFoodObject];
    if (value !== null && value !== undefined) {
      filledCount++;
    }
  }
  
  if (filledCount >= 8) return 'HIGH';
  if (filledCount >= 4) return 'MED';
  return 'LOW';
}

/**
 * Calculate score readiness from a raw import row (handles both field name formats).
 */
export function calculateScoreReadinessFromRow(row: Record<string, unknown>): ScoreReadinessTier {
  let filledCount = 0;
  
  const micronutrientFields = [
    'potassium_mg',
    'magnesium_mg',
    'iron_mg',
    'calcium_mg',
    'zinc_mg',
    'folate_ug',
    'vitamin_a_ug_rae',
    'vitamin_c_mg',
    'vitamin_d_ug',
    'vitamin_b12_ug',
    'sodium_mg',
  ];
  
  for (const field of micronutrientFields) {
    const value = row[field];
    if (value !== null && value !== undefined && value !== '') {
      filledCount++;
    }
  }
  
  if (filledCount >= 8) return 'HIGH';
  if (filledCount >= 4) return 'MED';
  return 'LOW';
}

/**
 * Get a human-readable label for score readiness tier.
 */
export function getScoreReadinessLabel(tier: ScoreReadinessTier): string {
  switch (tier) {
    case 'HIGH': return 'High (8+ micronutrients)';
    case 'MED': return 'Medium (4-7 micronutrients)';
    case 'LOW': return 'Low (0-3 micronutrients)';
  }
}

/**
 * Get CSS classes for score readiness badge.
 */
export function getScoreReadinessClasses(tier: ScoreReadinessTier): string {
  switch (tier) {
    case 'HIGH': return 'bg-green-100 text-green-800';
    case 'MED': return 'bg-yellow-100 text-yellow-800';
    case 'LOW': return 'bg-red-100 text-red-800';
  }
}

// ============================================================================
// Import Row to Food Data Conversion
// ============================================================================

/**
 * Convert a BulkImportRow to the data structure expected by the API.
 * Handles field name mapping (e.g., calories_kcal -> calories).
 * Blanks are preserved as null, NOT coerced to 0.
 */
export function importRowToFoodData(row: BulkImportRow): Record<string, unknown> {
  // Handle calories field name (prefer calories_kcal, fallback to calories)
  const calories = parseNumber(row.calories_kcal) ?? parseNumber(row.calories);
  
  return {
    // Identity
    canonical_name: String(row.canonical_name).trim(),
    brand_name: row.brand_name?.trim() || null,
    upc: row.upc ? normalizeUpc(String(row.upc)) : null,
    
    // Macros
    calories,
    protein_g: parseNumber(row.protein_g),
    fiber_g: parseNumber(row.fiber_g),
    carbs_g: parseNumber(row.carbs_g),
    fat_g: parseNumber(row.fat_g),
    
    // Minerals
    potassium_mg: parseNumber(row.potassium_mg),
    magnesium_mg: parseNumber(row.magnesium_mg),
    iron_mg: parseNumber(row.iron_mg),
    calcium_mg: parseNumber(row.calcium_mg),
    zinc_mg: parseNumber(row.zinc_mg),
    
    // Vitamins
    folate_ug: parseNumber(row.folate_ug),
    vitamin_a_ug_rae: parseNumber(row.vitamin_a_ug_rae),
    vitamin_c_mg: parseNumber(row.vitamin_c_mg),
    vitamin_d_ug: parseNumber(row.vitamin_d_ug),
    vitamin_b12_ug: parseNumber(row.vitamin_b12_ug),
    
    // Penalty
    sodium_mg: parseNumber(row.sodium_mg),
    
    // Legacy (for backwards compatibility)
    sugar_g: parseNumber(row.sugar_g),
    
    // Serving/basis
    serving_size_g: parseNumber(row.serving_size_g) ?? 100,
    serving_unit: row.serving_unit?.trim() || 'g',
    serving_description: row.serving_description?.trim() || null,
    household_serving_text: row.household_serving_text?.trim() || null,
    
    // Metadata
    category: row.category?.trim() || null,
    tags: parseTags(row.tags),
    image_url: row.image_url?.trim() || null,
    is_verified: parseBoolean(row.is_verified),
  };
}
