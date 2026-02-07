/**
 * Unit Tests for Food Utils
 * 
 * Tests for:
 * - CSV parsing: blank => null, numbers parsed correctly, negatives rejected
 * - Vitamin A field name is exactly `vitamin_a_ug_rae`
 * - Score readiness tier calculation
 */

import {
  parseNumber,
  parseBoolean,
  parseTags,
  validateFoodImportRow,
  calculateScoreReadiness,
  calculateScoreReadinessFromRow,
  importRowToFoodData,
  getScoreReadinessLabel,
} from '../foodUtils';
import { MICRONUTRIENT_FIELDS, ALL_NUTRIENT_FIELDS } from '../foodTypes';
import type { AdminFoodObject } from '../foodTypes';

describe('parseNumber', () => {
  it('should return null for empty string', () => {
    expect(parseNumber('')).toBeNull();
  });

  it('should return null for null input', () => {
    expect(parseNumber(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(parseNumber(undefined)).toBeNull();
  });

  it('should parse valid integer string', () => {
    expect(parseNumber('42')).toBe(42);
  });

  it('should parse valid float string', () => {
    expect(parseNumber('3.14')).toBe(3.14);
  });

  it('should parse number input directly', () => {
    expect(parseNumber(100)).toBe(100);
  });

  it('should return null for invalid string', () => {
    expect(parseNumber('abc')).toBeNull();
  });

  it('should return null for NaN', () => {
    expect(parseNumber(NaN)).toBeNull();
  });

  it('should handle whitespace in string', () => {
    expect(parseNumber('  50  ')).toBe(50);
  });
});

describe('validateFoodImportRow', () => {
  it('should require canonical_name', () => {
    const errors = validateFoodImportRow({}, 0);
    expect(errors).toContain('Row 1: canonical_name is required');
  });

  it('should reject empty canonical_name', () => {
    const errors = validateFoodImportRow({ canonical_name: '   ' }, 0);
    expect(errors).toContain('Row 1: canonical_name is required');
  });

  it('should accept valid row with only canonical_name', () => {
    const errors = validateFoodImportRow({ canonical_name: 'Test Food' }, 0);
    expect(errors).toHaveLength(0);
  });

  it('should reject negative nutrient values', () => {
    const errors = validateFoodImportRow({
      canonical_name: 'Test Food',
      calories_kcal: -10,
    }, 0);
    expect(errors.some(e => e.includes('must be a non-negative number'))).toBe(true);
  });

  it('should reject negative vitamin_a_ug_rae', () => {
    const errors = validateFoodImportRow({
      canonical_name: 'Test Food',
      vitamin_a_ug_rae: -5,
    }, 0);
    expect(errors.some(e => e.includes('vitamin_a_ug_rae'))).toBe(true);
  });

  it('should accept valid nutrient values', () => {
    const errors = validateFoodImportRow({
      canonical_name: 'Test Food',
      calories_kcal: 100,
      protein_g: 10,
      vitamin_a_ug_rae: 500,
    }, 0);
    expect(errors).toHaveLength(0);
  });

  it('should treat blank nutrient as null (not 0, not error)', () => {
    const errors = validateFoodImportRow({
      canonical_name: 'Test Food',
      calories_kcal: '',
      protein_g: null,
      vitamin_a_ug_rae: undefined,
    }, 0);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid numeric string', () => {
    const errors = validateFoodImportRow({
      canonical_name: 'Test Food',
      calories_kcal: 'not a number',
    }, 0);
    expect(errors.some(e => e.includes('must be a valid number'))).toBe(true);
  });
});

describe('calculateScoreReadiness', () => {
  it('should return LOW for 0 micronutrients', () => {
    const food: Partial<AdminFoodObject> = {
      calories: 100,
      protein_g: 10,
      fiber_g: 5,
    };
    expect(calculateScoreReadiness(food)).toBe('LOW');
  });

  it('should return LOW for 3 micronutrients', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: 100,
      magnesium_mg: 50,
      iron_mg: 2,
    };
    expect(calculateScoreReadiness(food)).toBe('LOW');
  });

  it('should return MED for 4 micronutrients', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: 100,
      magnesium_mg: 50,
      iron_mg: 2,
      calcium_mg: 100,
    };
    expect(calculateScoreReadiness(food)).toBe('MED');
  });

  it('should return MED for 7 micronutrients', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: 100,
      magnesium_mg: 50,
      iron_mg: 2,
      calcium_mg: 100,
      zinc_mg: 5,
      folate_ug: 50,
      vitamin_c_mg: 10,
    };
    expect(calculateScoreReadiness(food)).toBe('MED');
  });

  it('should return HIGH for 8 micronutrients', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: 100,
      magnesium_mg: 50,
      iron_mg: 2,
      calcium_mg: 100,
      zinc_mg: 5,
      folate_ug: 50,
      vitamin_a_ug_rae: 100,
      vitamin_c_mg: 10,
    };
    expect(calculateScoreReadiness(food)).toBe('HIGH');
  });

  it('should return HIGH for all 11 micronutrients', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: 100,
      magnesium_mg: 50,
      iron_mg: 2,
      calcium_mg: 100,
      zinc_mg: 5,
      folate_ug: 50,
      vitamin_a_ug_rae: 100,
      vitamin_c_mg: 10,
      vitamin_d_ug: 5,
      vitamin_b12_ug: 2,
      sodium_mg: 500,
    };
    expect(calculateScoreReadiness(food)).toBe('HIGH');
  });

  it('should not count null values', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: null,
      magnesium_mg: null,
      iron_mg: null,
      calcium_mg: null,
    };
    expect(calculateScoreReadiness(food)).toBe('LOW');
  });

  it('should count 0 as a valid value', () => {
    const food: Partial<AdminFoodObject> = {
      potassium_mg: 0,
      magnesium_mg: 0,
      iron_mg: 0,
      calcium_mg: 0,
    };
    expect(calculateScoreReadiness(food)).toBe('MED');
  });
});

describe('calculateScoreReadinessFromRow', () => {
  it('should work with raw row data', () => {
    const row = {
      potassium_mg: '100',
      magnesium_mg: '50',
      iron_mg: '2',
      calcium_mg: '100',
      zinc_mg: '5',
      folate_ug: '50',
      vitamin_a_ug_rae: '100',
      vitamin_c_mg: '10',
    };
    expect(calculateScoreReadinessFromRow(row)).toBe('HIGH');
  });

  it('should treat empty strings as not filled', () => {
    const row = {
      potassium_mg: '',
      magnesium_mg: '',
      iron_mg: '',
    };
    expect(calculateScoreReadinessFromRow(row)).toBe('LOW');
  });
});

describe('importRowToFoodData', () => {
  it('should map calories_kcal to calories', () => {
    const row = {
      canonical_name: 'Test',
      calories_kcal: 100,
    };
    const result = importRowToFoodData(row as any);
    expect(result.calories).toBe(100);
  });

  it('should prefer calories_kcal over calories', () => {
    const row = {
      canonical_name: 'Test',
      calories_kcal: 200,
      calories: 100,
    };
    const result = importRowToFoodData(row as any);
    expect(result.calories).toBe(200);
  });

  it('should fallback to calories if calories_kcal is blank', () => {
    const row = {
      canonical_name: 'Test',
      calories_kcal: '',
      calories: 150,
    };
    const result = importRowToFoodData(row as any);
    expect(result.calories).toBe(150);
  });

  it('should convert blank strings to null (not 0)', () => {
    const row = {
      canonical_name: 'Test',
      protein_g: '',
      vitamin_a_ug_rae: '',
    };
    const result = importRowToFoodData(row as any);
    expect(result.protein_g).toBeNull();
    expect(result.vitamin_a_ug_rae).toBeNull();
  });

  it('should include vitamin_a_ug_rae field', () => {
    const row = {
      canonical_name: 'Test',
      vitamin_a_ug_rae: 500,
    };
    const result = importRowToFoodData(row as any);
    expect(result.vitamin_a_ug_rae).toBe(500);
  });

  it('should default serving_size_g to 100', () => {
    const row = {
      canonical_name: 'Test',
    };
    const result = importRowToFoodData(row as any);
    expect(result.serving_size_g).toBe(100);
  });

  it('should default serving_unit to g', () => {
    const row = {
      canonical_name: 'Test',
    };
    const result = importRowToFoodData(row as any);
    expect(result.serving_unit).toBe('g');
  });

  it('should parse tags from comma-separated string', () => {
    const row = {
      canonical_name: 'Test',
      tags: 'healthy,protein,low-fat',
    };
    const result = importRowToFoodData(row as any);
    expect(result.tags).toEqual(['healthy', 'protein', 'low-fat']);
  });
});

describe('Vitamin A field name', () => {
  it('should have vitamin_a_ug_rae in MICRONUTRIENT_FIELDS', () => {
    expect(MICRONUTRIENT_FIELDS).toContain('vitamin_a_ug_rae');
  });

  it('should have vitamin_a_ug_rae in ALL_NUTRIENT_FIELDS', () => {
    expect(ALL_NUTRIENT_FIELDS).toContain('vitamin_a_ug_rae');
  });

  it('should NOT have vitamin_a_iu or vitamin_a_ug in fields', () => {
    expect(MICRONUTRIENT_FIELDS).not.toContain('vitamin_a_iu');
    expect(MICRONUTRIENT_FIELDS).not.toContain('vitamin_a_ug');
    expect(ALL_NUTRIENT_FIELDS).not.toContain('vitamin_a_iu');
    expect(ALL_NUTRIENT_FIELDS).not.toContain('vitamin_a_ug');
  });
});

describe('getScoreReadinessLabel', () => {
  it('should return correct label for HIGH', () => {
    expect(getScoreReadinessLabel('HIGH')).toBe('High (8+ micronutrients)');
  });

  it('should return correct label for MED', () => {
    expect(getScoreReadinessLabel('MED')).toBe('Medium (4-7 micronutrients)');
  });

  it('should return correct label for LOW', () => {
    expect(getScoreReadinessLabel('LOW')).toBe('Low (0-3 micronutrients)');
  });
});
