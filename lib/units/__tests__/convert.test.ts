import {
  computeQuantities,
  normalizeUnit,
  getValidUnits,
  type EntryUnit,
} from '../convert';

// ============================================================================
// normalizeUnit
// ============================================================================

describe('normalizeUnit', () => {
  it('returns "serving" for undefined / null / empty', () => {
    expect(normalizeUnit(undefined)).toBe('serving');
    expect(normalizeUnit(null)).toBe('serving');
    expect(normalizeUnit('')).toBe('serving');
  });

  it('returns "g" for gram variants', () => {
    expect(normalizeUnit('g')).toBe('g');
    expect(normalizeUnit('gram')).toBe('g');
    expect(normalizeUnit('grams')).toBe('g');
    expect(normalizeUnit('G')).toBe('g');
    expect(normalizeUnit('  Grams ')).toBe('g');
  });

  it('returns "serving" for anything else', () => {
    expect(normalizeUnit('serving')).toBe('serving');
    expect(normalizeUnit('cup')).toBe('serving');
    expect(normalizeUnit('oz')).toBe('serving');
    expect(normalizeUnit('piece')).toBe('serving');
  });
});

// ============================================================================
// getValidUnits
// ============================================================================

describe('getValidUnits', () => {
  it('returns ["serving"] when no servingSizeG', () => {
    expect(getValidUnits(null)).toEqual(['serving']);
    expect(getValidUnits(undefined)).toEqual(['serving']);
    expect(getValidUnits(0)).toEqual(['serving']);
    expect(getValidUnits(-10)).toEqual(['serving']);
  });

  it('returns ["serving", "g"] when servingSizeG > 0', () => {
    expect(getValidUnits(100)).toEqual(['serving', 'g']);
    expect(getValidUnits(28.35)).toEqual(['serving', 'g']);
    expect(getValidUnits(0.5)).toEqual(['serving', 'g']);
  });
});

// ============================================================================
// computeQuantities — serving mode
// ============================================================================

describe('computeQuantities — serving mode', () => {
  it('computes quantity_g = quantity * servingSizeG', () => {
    const result = computeQuantities('serving', 2, 100);
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200);
    expect(result.unit).toBe('serving');
  });

  it('defaults quantity to 1 when undefined', () => {
    const result = computeQuantities('serving', undefined, 50);
    expect(result.servingQty).toBe(1);
    expect(result.quantityG).toBe(50);
  });

  it('defaults quantity to 1 when 0 or negative', () => {
    expect(computeQuantities('serving', 0, 100).servingQty).toBe(1);
    expect(computeQuantities('serving', -5, 100).servingQty).toBe(1);
  });

  it('returns null quantity_g when servingSizeG is missing', () => {
    const result = computeQuantities('serving', 3, null);
    expect(result.servingQty).toBe(3);
    expect(result.quantityG).toBeNull();
    expect(result.unit).toBe('serving');
  });

  it('returns null quantity_g when servingSizeG is 0', () => {
    const result = computeQuantities('serving', 2, 0);
    expect(result.quantityG).toBeNull();
  });

  it('handles fractional servings', () => {
    const result = computeQuantities('serving', 0.5, 240);
    expect(result.servingQty).toBe(0.5);
    expect(result.quantityG).toBe(120);
  });
});

// ============================================================================
// computeQuantities — gram mode
// ============================================================================

describe('computeQuantities — gram mode', () => {
  it('computes servingQty = grams / servingSizeG', () => {
    const result = computeQuantities('g', 200, 100);
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200);
    expect(result.unit).toBe('g');
  });

  it('handles fractional servings from grams', () => {
    const result = computeQuantities('g', 50, 100);
    expect(result.servingQty).toBe(0.5);
    expect(result.quantityG).toBe(50);
  });

  it('falls back to servingQty=1 when servingSizeG is missing', () => {
    const result = computeQuantities('g', 200, null);
    expect(result.servingQty).toBe(1);
    expect(result.quantityG).toBe(200);
    expect(result.unit).toBe('g');
  });

  it('handles the "gram" and "grams" variants', () => {
    expect(computeQuantities('gram', 150, 100).quantityG).toBe(150);
    expect(computeQuantities('grams', 150, 100).quantityG).toBe(150);
  });
});

// ============================================================================
// Regression: payload.quantity remains a serving multiplier
// ============================================================================

describe('regression: payload.quantity stays as serving multiplier', () => {
  it('serving mode: servingQty equals the input value (not grams)', () => {
    // If user says "2 servings" of a 100g food, servingQty = 2, not 200
    const result = computeQuantities('serving', 2, 100);
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200);
  });

  it('gram mode: servingQty is recomputed as grams/servingSizeG', () => {
    // If user says "200g" of a 100g food, servingQty = 2
    const result = computeQuantities('g', 200, 100);
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200);
  });

  it('gram mode with non-round conversion: servingQty is a fraction', () => {
    // 150g of a 100g-per-serving food = 1.5 servings
    const result = computeQuantities('g', 150, 100);
    expect(result.servingQty).toBe(1.5);
    expect(result.quantityG).toBe(150);
  });

  it('round-trip: serving → grams → serving preserves the value', () => {
    const servingSizeG = 28.35; // 1 oz
    const originalServings = 3;

    // Step 1: serving → grams
    const step1 = computeQuantities('serving', originalServings, servingSizeG);
    expect(step1.quantityG).toBeCloseTo(85.05, 1);

    // Step 2: grams → serving
    const step2 = computeQuantities('g', step1.quantityG!, servingSizeG);
    expect(step2.servingQty).toBeCloseTo(originalServings, 5);
  });

  it('nutrition math uses servingQty as multiplier (conceptual check)', () => {
    // Simulate: food has 200 cal per serving, user logs 2 servings
    const caloriesPerServing = 200;
    const result = computeQuantities('serving', 2, 100);
    const totalCalories = caloriesPerServing * result.servingQty;
    expect(totalCalories).toBe(400);

    // Same food, user logs 200g (= 2 servings of 100g each)
    const resultGrams = computeQuantities('g', 200, 100);
    const totalCaloriesGrams = caloriesPerServing * resultGrams.servingQty;
    expect(totalCaloriesGrams).toBe(400);
  });
});
