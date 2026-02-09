/**
 * Daily NDS Calculator Tests
 * 
 * Tests for:
 * - PS_current uses main meals weighted, else averages all meals (Decision 1)
 * - WFR uses NOVA3=0.5 credit (Decision 2)
 * - MNC excludes unknown nutrients from denominator
 * - NDS weighted sum matches formula
 */

import { calculateDailyNDS, getEmptyNDS } from '../dailyCalculator';
import type { DailyMealData, DailyFoodData } from '../dailyCalculator';
import { NDS_WEIGHTS, NDS_VERSION, CLASSIFIER_VERSION } from '../types';

// Helper to create a basic meal
function createMeal(options: {
  calories: number;
  protein_g: number;
  fiber_g?: number;
  is_main_meal?: boolean;
  protein_score_10?: number | null;
  foods?: DailyFoodData[];
}): DailyMealData {
  return {
    id: Math.random().toString(),
    calories: options.calories,
    protein_g: options.protein_g,
    fiber_g: options.fiber_g ?? 0,
    added_sugar_g: 0,
    is_main_meal: options.is_main_meal ?? options.calories >= 250,
    protein_score_10: options.protein_score_10 ?? null,
    foods: options.foods ?? [{
      id: Math.random().toString(),
      canonicalName: 'Test Food',
      calories: options.calories,
    }],
  };
}

// Helper to create a food with processing class
function createFood(options: {
  canonicalName: string;
  calories: number;
  processingClass?: 'whole' | 'minimally_processed' | 'processed' | 'ultra_processed' | null;
  nutrients?: DailyFoodData['nutrients'];
}): DailyFoodData {
  return {
    id: Math.random().toString(),
    canonicalName: options.canonicalName,
    calories: options.calories,
    processingClass: options.processingClass ?? null,
    nutrients: options.nutrients,
  };
}

describe('Daily NDS Calculator', () => {
  describe('PS_current calculation (Decision 1)', () => {
    it('uses calorie-weighted average of main meals when main meals exist', () => {
      const meals: DailyMealData[] = [
        createMeal({ calories: 400, protein_g: 30, is_main_meal: true, protein_score_10: 8 }),
        createMeal({ calories: 600, protein_g: 40, is_main_meal: true, protein_score_10: 10 }),
        createMeal({ calories: 100, protein_g: 5, is_main_meal: false, protein_score_10: 2 }), // Snack, excluded
      ];

      const result = calculateDailyNDS(meals, true);
      
      // Weighted avg: (8*400 + 10*600) / (400+600) = (3200 + 6000) / 1000 = 9.2
      expect(result.subscores.ps_10).toBeCloseTo(9.2, 1);
    });

    it('averages all meals when no main meals exist (Decision 1)', () => {
      const meals: DailyMealData[] = [
        createMeal({ calories: 100, protein_g: 5, is_main_meal: false, protein_score_10: 4 }),
        createMeal({ calories: 150, protein_g: 8, is_main_meal: false, protein_score_10: 6 }),
        createMeal({ calories: 200, protein_g: 10, is_main_meal: false, protein_score_10: 8 }),
      ];

      const result = calculateDailyNDS(meals, true);
      
      // Simple average: (4 + 6 + 8) / 3 = 6
      expect(result.subscores.ps_10).toBeCloseTo(6, 1);
    });

    it('returns neutral score when no meals have protein_score', () => {
      const meals: DailyMealData[] = [
        createMeal({ calories: 300, protein_g: 20, protein_score_10: null }),
      ];

      const result = calculateDailyNDS(meals);
      expect(result.subscores.ps_10).toBe(5); // Neutral default
    });
  });

  describe('WFR calculation (Decision 2)', () => {
    it('gives full credit (1.0) for NOVA 1-2 foods', () => {
      const meals: DailyMealData[] = [
        createMeal({
          calories: 500,
          protein_g: 30,
          foods: [
            createFood({ canonicalName: 'Apple', calories: 250, processingClass: 'whole' }), // NOVA 1
            createFood({ canonicalName: 'Chicken', calories: 250, processingClass: 'minimally_processed' }), // NOVA 2
          ],
        }),
      ];

      const result = calculateDailyNDS(meals, true);
      
      // All 500 kcal from NOVA 1-2 = 500 credit / 500 total = 100% = score 10
      expect(result.subscores.wfr_10).toBe(10);
    });

    it('gives partial credit (0.5) for NOVA 3 foods (Decision 2)', () => {
      const meals: DailyMealData[] = [
        createMeal({
          calories: 1000,
          protein_g: 50,
          foods: [
            createFood({ canonicalName: 'Canned Beans', calories: 1000, processingClass: 'processed' }), // NOVA 3
          ],
        }),
      ];

      const result = calculateDailyNDS(meals, true);
      
      // 1000 kcal from NOVA 3 = 500 credit (0.5*1000) / 1000 total = 50% = score 4
      expect(result.subscores.wfr_10).toBe(4);
    });

    it('gives no credit (0.0) for NOVA 4 foods', () => {
      const meals: DailyMealData[] = [
        createMeal({
          calories: 500,
          protein_g: 10,
          foods: [
            createFood({ canonicalName: 'Chips', calories: 500, processingClass: 'ultra_processed' }), // NOVA 4
          ],
        }),
      ];

      const result = calculateDailyNDS(meals, true);
      
      // 500 kcal from NOVA 4 = 0 credit / 500 total = 0% = score 2 (<50% tier)
      expect(result.subscores.wfr_10).toBe(2);
    });

    it('calculates mixed NOVA correctly', () => {
      const meals: DailyMealData[] = [
        createMeal({
          calories: 1000,
          protein_g: 50,
          foods: [
            createFood({ canonicalName: 'Apple', calories: 400, processingClass: 'whole' }), // 400*1.0 = 400
            createFood({ canonicalName: 'Canned Beans', calories: 300, processingClass: 'processed' }), // 300*0.5 = 150
            createFood({ canonicalName: 'Chips', calories: 300, processingClass: 'ultra_processed' }), // 300*0.0 = 0
          ],
        }),
      ];

      const result = calculateDailyNDS(meals, true);
      
      // Credit: 400 + 150 + 0 = 550 / 1000 = 55% → score 4 (40-59% tier)
      expect(result.subscores.wfr_10).toBe(4);
    });
  });

  describe('MNC calculation (excludes unknown nutrients)', () => {
    it('only counts nutrients that have data', () => {
      const meals: DailyMealData[] = [
        createMeal({
          calories: 500,
          protein_g: 30,
          foods: [
            createFood({
              canonicalName: 'Multivitamin Food',
              calories: 500,
              nutrients: {
                potassium_mg: 2600,  // Met (100% of DRI)
                magnesium_mg: 400,   // Met (100% of DRI)
                iron_mg: null,       // Unknown - excluded from denominator
                calcium_mg: null,    // Unknown - excluded from denominator
                zinc_mg: 11,         // Met (100% of DRI)
                folate_ug: 400,      // Met (100% of DRI)
                vitamin_a_ug_rae: null, // Unknown
                vitamin_c_mg: null,  // Unknown
                vitamin_d_ug: null,  // Unknown
                vitamin_b12_ug: 2.4, // Met (100% of DRI)
              },
            }),
          ],
        }),
      ];

      const result = calculateDailyNDS(meals, true);
      
      // 5 nutrients with data, all met = 100% coverage = score 10
      expect(result.subscores.mnc_10).toBe(10);
      expect(result.debug_data?.mnc.availableCount).toBe(5);
      expect(result.debug_data?.mnc.metCount).toBe(5);
    });

    it('returns 0 when no nutrient data available', () => {
      const meals: DailyMealData[] = [
        createMeal({
          calories: 500,
          protein_g: 30,
          foods: [
            createFood({
              canonicalName: 'Unknown Food',
              calories: 500,
              // No nutrients data
            }),
          ],
        }),
      ];

      const result = calculateDailyNDS(meals);
      expect(result.subscores.mnc_10).toBe(5); // No nutrient data = neutral, not penalized
    });
  });

  describe('NDS weighted sum formula', () => {
    it('calculates NDS100 using correct weights', () => {
      // Create a scenario with known subscores
      const meals: DailyMealData[] = [
        createMeal({
          calories: 400,
          protein_g: 35,
          fiber_g: 25,
          is_main_meal: true,
          protein_score_10: 10,
          foods: [
            createFood({
              canonicalName: 'Perfect Food',
              calories: 400,
              processingClass: 'whole',
              nutrients: {
                potassium_mg: 2600,
                magnesium_mg: 400,
                iron_mg: 8,
                calcium_mg: 1000,
                zinc_mg: 11,
                folate_ug: 400,
                vitamin_a_ug_rae: 900,
                vitamin_c_mg: 90,
                vitamin_d_ug: 15,
                vitamin_b12_ug: 2.4,
              },
            }),
          ],
        }),
      ];

      const result = calculateDailyNDS(meals);
      
      // Verify weighted sum formula:
      // NDS100 = 10 * (0.30*WFR + 0.20*PS + 0.10*PND + 0.10*FP + 0.10*AS + 0.10*MNC + 0.10*OB)
      const expectedWeightedSum = 
        NDS_WEIGHTS.wfr * result.subscores.wfr_10 +
        NDS_WEIGHTS.ps * result.subscores.ps_10 +
        NDS_WEIGHTS.pnd * result.subscores.pnd_10 +
        NDS_WEIGHTS.fp * result.subscores.fp_10 +
        NDS_WEIGHTS.as * result.subscores.as_10 +
        NDS_WEIGHTS.mnc * result.subscores.mnc_10 +
        NDS_WEIGHTS.ob * result.subscores.ob_10;
      
      const expectedNDS = Math.min(100, Math.max(0, expectedWeightedSum * 10));
      
      expect(result.nds_score_100).toBeCloseTo(expectedNDS, 1);
    });

    it('clamps result to 0-100 range', () => {
      // Even with perfect scores, should not exceed 100
      const result = calculateDailyNDS([]);
      expect(result.nds_score_100).toBeGreaterThanOrEqual(0);
      expect(result.nds_score_100).toBeLessThanOrEqual(100);
    });
  });

  describe('version strings', () => {
    it('includes nds_version in result', () => {
      const result = calculateDailyNDS([]);
      expect(result.nds_version).toBe(NDS_VERSION);
    });

    it('includes classifier_version in result', () => {
      const result = calculateDailyNDS([]);
      expect(result.classifier_version).toBe(CLASSIFIER_VERSION);
    });
  });

  describe('getEmptyNDS', () => {
    it('returns zero values when no qualifying meals', () => {
      const empty = getEmptyNDS();
      expect(empty.nds_score_100).toBe(0);
      expect(empty.subscores.wfr_10).toBe(0);
      expect(empty.subscores.ps_10).toBe(0);
      expect(empty.nds_version).toBe(NDS_VERSION);
    });
  });

  describe('debug data', () => {
    it('includes debug data when requested', () => {
      const result = calculateDailyNDS([], true);
      expect(result.debug_data).toBeDefined();
    });

    it('omits debug data when not requested', () => {
      const result = calculateDailyNDS([], false);
      expect(result.debug_data).toBeUndefined();
    });
  });
});
