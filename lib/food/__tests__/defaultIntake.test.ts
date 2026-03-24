import type { FoodObject } from '../types';
import {
  resolveDefaultIntakeProfile,
  getDefaultIntakeQuantityAndUnit,
  V1_ML_PER_TSP,
  V1_ML_PER_TBSP,
  V1_ML_PER_CUP,
} from '../defaultIntake';

function baseFood(overrides: Partial<FoodObject> = {}): FoodObject {
  return {
    id: 'test-id',
    canonicalName: 'Test Food',
    brandName: null,
    aliases: [],
    sourceType: 'common',
    sourceProvider: null,
    sourceId: null,
    sourceDataset: null,
    upc: null,
    servingSizeG: 100,
    servingUnit: 'g',
    servingDescription: null,
    householdServingText: null,
    measures: null,
    calories: 100,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    nutrientsExtended: {},
    nutrientProvenance: 'usda',
    nutrientConfidence: 'high',
    personId: null,
    isVerified: false,
    imageUrl: null,
    category: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('V1 liquid constants (locked)', () => {
  it('exports consumer-friendly ml constants', () => {
    expect(V1_ML_PER_TSP).toBe(5);
    expect(V1_ML_PER_TBSP).toBe(15);
    expect(V1_ML_PER_CUP).toBe(240);
  });
});

describe('resolveDefaultIntakeProfile', () => {
  it('USDA branded almonds: gram-native → 28 g, strategy weight (§1.6)', () => {
    const food = baseFood({
      sourceDataset: 'branded',
      servingSizeG: 28,
      servingUnit: 'g',
      measures: null,
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.defaultQuantity).toBe(28);
    expect(p.defaultUnit).toBe('g');
    expect(p.strategy).toBe('weight');
  });

  it('OFF weak metadata → per_100g_fallback 100 × g', () => {
    const food = baseFood({
      sourceProvider: 'off',
      servingSizeG: 100,
      servingUnit: 'g',
    });
    const p = resolveDefaultIntakeProfile(food, {
      offNormalization: {
        serving_size_text: null,
        serving_size_g: null,
        nutrition_basis: 'per_100g',
        serving_confidence: 'low',
        completeness_score: 2,
        normalization_status: 'raw',
      },
    });
    expect(p.strategy).toBe('per_100g_fallback');
    expect(p.defaultQuantity).toBe(100);
    expect(p.defaultUnit).toBe('g');
  });

  it('OFF without ctx → conservative 100 × g', () => {
    const food = baseFood({ sourceProvider: 'off' });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.strategy).toBe('per_100g_fallback');
    expect(p.defaultQuantity).toBe(100);
    expect(p.defaultUnit).toBe('g');
  });

  it('OFF strong parsed serving → weight in g', () => {
    const food = baseFood({ sourceProvider: 'off', servingSizeG: 100, servingUnit: 'g' });
    const p = resolveDefaultIntakeProfile(food, {
      offNormalization: {
        serving_size_text: '150g',
        serving_size_g: 150,
        nutrition_basis: 'per_100g',
        serving_confidence: 'high',
        completeness_score: 4,
        normalization_status: 'parsed',
      },
    });
    expect(p.strategy).toBe('weight');
    expect(p.defaultQuantity).toBe(150);
    expect(p.defaultUnit).toBe('g');
  });

  it('peanut butter: tablespoon measure wins over gram serving', () => {
    const food = baseFood({
      sourceDataset: 'branded',
      servingSizeG: 32,
      servingUnit: 'g',
      measures: [{ unit: 'tablespoon', grams: 16, label: '1 tbsp' }],
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.strategy).toBe('household_measure');
    expect(p.defaultUnit).toBe('tablespoon');
    expect(p.defaultQuantity).toBe(1);
  });

  it('olive oil: 1 tbsp when measure present', () => {
    const food = baseFood({
      canonicalName: 'Olive oil',
      servingSizeG: 14,
      servingUnit: 'g',
      measures: [{ unit: 'tablespoon', grams: 14 }],
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.strategy).toBe('household_measure');
    expect(p.defaultUnit).toBe('tablespoon');
  });

  it('milk: volume path → 1 cup when cup measure + liquid hint', () => {
    const food = baseFood({
      canonicalName: 'Whole milk',
      servingSizeG: 240,
      servingUnit: 'g',
      householdServingText: '1 cup (240 ml)',
      measures: [{ unit: 'cup', grams: 240 }],
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.strategy).toBe('volume');
    expect(p.defaultUnit).toBe('cup');
    expect(p.defaultQuantity).toBe(1);
  });

  it('bread: 1 slice', () => {
    const food = baseFood({
      servingSizeG: 30,
      servingUnit: 'g',
      measures: [{ unit: 'slice', grams: 30 }],
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.strategy).toBe('count_item');
    expect(p.defaultUnit).toBe('slice');
  });

  it('protein bar: 1 bar', () => {
    const food = baseFood({
      servingSizeG: 60,
      servingUnit: 'g',
      measures: [{ unit: 'bar', grams: 60 }],
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.strategy).toBe('count_item');
    expect(p.defaultUnit).toBe('bar');
  });

  it('user custom food: exact gram serving', () => {
    const food = baseFood({
      personId: 'user-1',
      servingSizeG: 50,
      servingUnit: 'g',
    });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.unitConfidence).toBe('exact');
    expect(p.defaultQuantity).toBe(50);
    expect(p.defaultUnit).toBe('g');
  });
});

describe('qtyOverride invariant (multiplier of default profile)', () => {
  it('doubles grams for weight strategy', () => {
    const food = baseFood({ sourceDataset: 'branded', servingSizeG: 28, servingUnit: 'g' });
    const p = resolveDefaultIntakeProfile(food, {});
    const mult = 2;
    expect(p.defaultQuantity * mult).toBe(56);
    expect(p.defaultUnit).toBe('g');
  });

  it('doubles per_100g_fallback quantity', () => {
    const food = baseFood({ sourceProvider: 'off' });
    const p = resolveDefaultIntakeProfile(food, {});
    expect(p.defaultQuantity * 2).toBe(200);
    expect(p.defaultUnit).toBe('g');
  });

  it('getDefaultIntakeQuantityAndUnit delegates to profile', () => {
    const food = baseFood({ sourceDataset: 'branded', servingSizeG: 28, servingUnit: 'g' });
    const q = getDefaultIntakeQuantityAndUnit(food);
    const p = resolveDefaultIntakeProfile(food, {});
    expect(q.quantity).toBe(p.defaultQuantity);
    expect(q.unit).toBe(p.defaultUnit);
  });
});
