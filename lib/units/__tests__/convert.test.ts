import {
  computeQuantities,
  normalizeUnit,
  getValidUnits,
  findMeasure,
  convertBetweenUnits,
  type Measure,
} from '../convert';

// ============================================================================
// Sample measures for testing
// ============================================================================

const SAMPLE_MEASURES: Measure[] = [
  { unit: 'cup', grams: 240, label: '1 cup' },
  { unit: 'tablespoon', grams: 15, label: '1 tablespoon' },
  { unit: 'oz', grams: 28.35, label: '1 oz' },
  { unit: 'slice', grams: 30, label: '1 slice' },
  { unit: 'fl oz', grams: 29.57 },
];

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

  it('returns "serving" for serving variants', () => {
    expect(normalizeUnit('serving')).toBe('serving');
    expect(normalizeUnit('servings')).toBe('serving');
  });

  it('returns lowercase measure unit strings as-is', () => {
    expect(normalizeUnit('cup')).toBe('cup');
    expect(normalizeUnit('Cup')).toBe('cup');
    expect(normalizeUnit('TABLESPOON')).toBe('tablespoon');
    expect(normalizeUnit('oz')).toBe('oz');
    expect(normalizeUnit('fl oz')).toBe('fl oz');
    expect(normalizeUnit('  Slice  ')).toBe('slice');
  });
});

// ============================================================================
// findMeasure
// ============================================================================

describe('findMeasure', () => {
  it('returns matching measure', () => {
    expect(findMeasure('cup', SAMPLE_MEASURES)).toEqual(SAMPLE_MEASURES[0]);
    expect(findMeasure('oz', SAMPLE_MEASURES)).toEqual(SAMPLE_MEASURES[2]);
  });

  it('is case-insensitive', () => {
    expect(findMeasure('CUP', SAMPLE_MEASURES)?.unit).toBe('cup');
    expect(findMeasure('Tablespoon', SAMPLE_MEASURES)?.unit).toBe('tablespoon');
  });

  it('returns undefined for unknown unit', () => {
    expect(findMeasure('gallon', SAMPLE_MEASURES)).toBeUndefined();
  });

  it('returns undefined for null/empty measures', () => {
    expect(findMeasure('cup', null)).toBeUndefined();
    expect(findMeasure('cup', [])).toBeUndefined();
  });
});

// ============================================================================
// getValidUnits
// ============================================================================

describe('getValidUnits', () => {
  it('returns ["serving"] when no servingSizeG and no measures', () => {
    expect(getValidUnits(null)).toEqual(['serving']);
    expect(getValidUnits(undefined)).toEqual(['serving']);
    expect(getValidUnits(0)).toEqual(['serving']);
    expect(getValidUnits(-10)).toEqual(['serving']);
  });

  it('returns ["serving", "g"] when servingSizeG > 0 but no measures', () => {
    expect(getValidUnits(100)).toEqual(['serving', 'g']);
    expect(getValidUnits(28.35)).toEqual(['serving', 'g']);
  });

  it('includes measure units when measures present', () => {
    const units = getValidUnits(100, SAMPLE_MEASURES);
    expect(units).toContain('serving');
    expect(units).toContain('g');
    expect(units).toContain('cup');
    expect(units).toContain('tablespoon');
    expect(units).toContain('oz');
    expect(units).toContain('slice');
    expect(units).toContain('fl oz');
  });

  it('includes measures even without servingSizeG (but no "g")', () => {
    const units = getValidUnits(null, SAMPLE_MEASURES);
    expect(units).toContain('serving');
    expect(units).not.toContain('g');
    expect(units).toContain('cup');
    expect(units).toContain('oz');
  });

  it('does not duplicate g or serving from measures', () => {
    const withGMeasure: Measure[] = [
      { unit: 'g', grams: 1 },
      { unit: 'serving', grams: 100 },
      { unit: 'cup', grams: 240 },
    ];
    const units = getValidUnits(100, withGMeasure);
    expect(units.filter((u) => u === 'g').length).toBe(1);
    expect(units.filter((u) => u === 'serving').length).toBe(1);
    expect(units).toContain('cup');
  });
});

// ============================================================================
// computeQuantities — serving mode (unchanged from Phase 1)
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
// computeQuantities — gram mode (unchanged from Phase 1)
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
// computeQuantities — measure unit mode (Phase 2)
// ============================================================================

describe('computeQuantities — measure unit mode', () => {
  it('cup: 2 cups of food with servingSizeG=100 → 480g, 4.8 servings', () => {
    const result = computeQuantities('cup', 2, 100, SAMPLE_MEASURES);
    expect(result.quantityG).toBe(480);
    expect(result.servingQty).toBeCloseTo(4.8, 5);
    expect(result.unit).toBe('cup');
  });

  it('tablespoon: 3 tbsp → 45g', () => {
    const result = computeQuantities('tablespoon', 3, 100, SAMPLE_MEASURES);
    expect(result.quantityG).toBe(45);
    expect(result.servingQty).toBeCloseTo(0.45, 5);
    expect(result.unit).toBe('tablespoon');
  });

  it('oz: 1 oz → 28.35g', () => {
    const result = computeQuantities('oz', 1, 100, SAMPLE_MEASURES);
    expect(result.quantityG).toBeCloseTo(28.35, 2);
    expect(result.servingQty).toBeCloseTo(0.2835, 4);
    expect(result.unit).toBe('oz');
  });

  it('fl oz: 2 fl oz → ~59.14g', () => {
    const result = computeQuantities('fl oz', 2, 100, SAMPLE_MEASURES);
    expect(result.quantityG).toBeCloseTo(59.14, 1);
    expect(result.unit).toBe('fl oz');
  });

  it('falls back to servingQty=1 when measure found but no servingSizeG', () => {
    const result = computeQuantities('cup', 1, null, SAMPLE_MEASURES);
    expect(result.quantityG).toBe(240);
    expect(result.servingQty).toBe(1); // can't compute servings without servingSizeG
    expect(result.unit).toBe('cup');
  });

  it('unknown measure unit without measures array → treats as serving', () => {
    const result = computeQuantities('gallon', 2, 100, SAMPLE_MEASURES);
    // 'gallon' not in SAMPLE_MEASURES → falls through to unknown-unit path
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200); // treated as 2 servings * 100g
    expect(result.unit).toBe('gallon');
  });

  it('defaults quantity to 1 when undefined', () => {
    const result = computeQuantities('cup', undefined, 100, SAMPLE_MEASURES);
    expect(result.quantityG).toBe(240);
    expect(result.servingQty).toBeCloseTo(2.4, 5);
  });
});

// ============================================================================
// convertBetweenUnits
// ============================================================================

describe('convertBetweenUnits', () => {
  it('same unit returns same value', () => {
    expect(convertBetweenUnits(5, 'cup', 'cup', 100, SAMPLE_MEASURES)).toBe(5);
  });

  it('cup → g', () => {
    const result = convertBetweenUnits(2, 'cup', 'g', 100, SAMPLE_MEASURES);
    expect(result).toBe(480);
  });

  it('g → cup', () => {
    const result = convertBetweenUnits(480, 'g', 'cup', 100, SAMPLE_MEASURES);
    expect(result).toBe(2);
  });

  it('cup → serving', () => {
    // 2 cups = 480g, 1 serving = 100g → 4.8 servings
    const result = convertBetweenUnits(2, 'cup', 'serving', 100, SAMPLE_MEASURES);
    expect(result).toBeCloseTo(4.8, 5);
  });

  it('serving → cup', () => {
    // 4.8 servings = 480g, 1 cup = 240g → 2 cups
    const result = convertBetweenUnits(4.8, 'serving', 'cup', 100, SAMPLE_MEASURES);
    expect(result).toBeCloseTo(2, 5);
  });

  it('oz → tablespoon', () => {
    // 1 oz = 28.35g, 1 tablespoon = 15g → 28.35/15 = 1.89
    const result = convertBetweenUnits(1, 'oz', 'tablespoon', 100, SAMPLE_MEASURES);
    expect(result).toBeCloseTo(28.35 / 15, 4);
  });

  it('returns null when conversion is impossible (no servingSizeG, target=serving)', () => {
    // Without servingSizeG, can't convert grams to serving
    const result = convertBetweenUnits(100, 'g', 'serving', null, SAMPLE_MEASURES);
    expect(result).toBeNull();
  });

  it('returns null for unknown target measure', () => {
    const result = convertBetweenUnits(1, 'cup', 'gallon', 100, SAMPLE_MEASURES);
    // gallon not in measures, so can't convert
    expect(result).toBeNull();
  });
});

// ============================================================================
// Regression: payload.quantity remains a serving multiplier
// ============================================================================

describe('regression: payload.quantity stays as serving multiplier', () => {
  it('serving mode: servingQty equals the input value (not grams)', () => {
    const result = computeQuantities('serving', 2, 100);
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200);
  });

  it('gram mode: servingQty is recomputed as grams/servingSizeG', () => {
    const result = computeQuantities('g', 200, 100);
    expect(result.servingQty).toBe(2);
    expect(result.quantityG).toBe(200);
  });

  it('gram mode with non-round conversion: servingQty is a fraction', () => {
    const result = computeQuantities('g', 150, 100);
    expect(result.servingQty).toBe(1.5);
    expect(result.quantityG).toBe(150);
  });

  it('measure mode: servingQty is grams/servingSizeG (not the measure value)', () => {
    // 2 cups = 480g, servingSizeG = 100g → servingQty = 4.8
    const result = computeQuantities('cup', 2, 100, SAMPLE_MEASURES);
    expect(result.servingQty).toBeCloseTo(4.8, 5);
    expect(result.quantityG).toBe(480);
  });

  it('round-trip: serving → grams → serving preserves the value', () => {
    const servingSizeG = 28.35;
    const originalServings = 3;

    const step1 = computeQuantities('serving', originalServings, servingSizeG);
    expect(step1.quantityG).toBeCloseTo(85.05, 1);

    const step2 = computeQuantities('g', step1.quantityG!, servingSizeG);
    expect(step2.servingQty).toBeCloseTo(originalServings, 5);
  });

  it('round-trip: cup → grams → cup preserves the value', () => {
    const cupValue = 2;
    const step1 = computeQuantities('cup', cupValue, 100, SAMPLE_MEASURES);
    expect(step1.quantityG).toBe(480);

    // Now convert 480g back to cups
    const cupsBack = convertBetweenUnits(step1.quantityG!, 'g', 'cup', 100, SAMPLE_MEASURES);
    expect(cupsBack).toBeCloseTo(cupValue, 5);
  });

  it('nutrition math uses servingQty as multiplier (conceptual check)', () => {
    const caloriesPerServing = 200;
    const result = computeQuantities('serving', 2, 100);
    const totalCalories = caloriesPerServing * result.servingQty;
    expect(totalCalories).toBe(400);

    const resultGrams = computeQuantities('g', 200, 100);
    const totalCaloriesGrams = caloriesPerServing * resultGrams.servingQty;
    expect(totalCaloriesGrams).toBe(400);

    // Via measure: 2 cups (480g) of 100g-per-serving food = 4.8 servings
    const resultCup = computeQuantities('cup', 2, 100, SAMPLE_MEASURES);
    const totalCaloriesCup = caloriesPerServing * resultCup.servingQty;
    expect(totalCaloriesCup).toBeCloseTo(960, 1);
  });
});
