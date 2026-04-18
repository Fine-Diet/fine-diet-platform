/**
 * Plans — Daily NDS Projection (Phase 2)
 *
 * Assembles an array of PlannedMeal into the DailyMealData / DailyFoodData
 * shapes required by calculateDailyNDS and returns the projected daily NDS.
 *
 * This module NEVER introduces new NDS math. It only reshapes plan data
 * into the existing lib/nds daily calculator's input types.
 *
 * Contract:
 *   - Every PlannedMeal carries its meal-derived NDS shape (required by
 *     Phase 1 validators). We trust protein_score_10 + is_main_meal from
 *     the planned meal and pass them straight through.
 *   - Per-food nutrients are only available when payload items reference
 *     food_objects with resolved nutrients; in the Phase 2 stub AI path
 *     we emit items without resolved nutrients, which keeps MNC/OB in
 *     their "no data" branches and therefore projection confidence 'low'.
 */

import type { DailyMealData, DailyFoodData, DailyNDSResult } from '@/lib/nds/dailyCalculator';
import { calculateDailyNDS } from '@/lib/nds/dailyCalculator';
import type { PlannedMeal } from './types';

/**
 * Shape accepted for items inside a planned_meal payload. Loosely typed
 * because the DB column is JSONB and validators only enforce structural
 * fields, not optional-nutrient fields.
 */
interface PlannedMealItem {
  name?: string;
  food_object_id?: string | null;
  calories?: number | null;
  macros?: {
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  } | null;
  fiber_g?: number | null;
  added_sugar_g?: number | null;
  nutrients?: DailyFoodData['nutrients'];
  omega3_g?: number | null;
  omega6_g?: number | null;
  canonical_name?: string;
  brand_name?: string | null;
  category?: string | null;
  tags?: string[];
  processing_class?: DailyFoodData['processingClass'];
  processing_class_override?: DailyFoodData['processingClassOverride'];
}

interface PlannedMealPayloadTotals {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  added_sugar_g?: number;
}

interface PlannedMealPayloadShape {
  items?: PlannedMealItem[];
  totals?: PlannedMealPayloadTotals;
}

function plannedMealToDailyMealData(meal: PlannedMeal): DailyMealData {
  const payload = (meal.payload ?? {}) as PlannedMealPayloadShape;
  const items = payload.items ?? [];
  const totals = payload.totals ?? {};

  const foods: DailyFoodData[] = items.map((item, idx) => ({
    id: `${meal.id}:item:${idx}`,
    canonicalName: item.canonical_name ?? item.name ?? 'item',
    brandName: item.brand_name ?? null,
    category: item.category ?? null,
    tags: item.tags ?? undefined,
    calories: typeof item.calories === 'number' ? item.calories : 0,
    processingClass: item.processing_class ?? null,
    processingClassOverride: item.processing_class_override ?? null,
    nutrients: item.nutrients ?? undefined,
    omega3_g: item.omega3_g ?? null,
    omega6_g: item.omega6_g ?? null,
  }));

  const itemFiber = items.reduce((sum, it) => sum + (it.fiber_g ?? 0), 0);
  const itemAddedSugar = items.reduce((sum, it) => sum + (it.added_sugar_g ?? 0), 0);

  const meal_derived_data = (meal.meal_derived_data ?? {}) as {
    meal_calories?: number;
    meal_protein_g?: number;
  };

  return {
    id: meal.id,
    calories: Number(
      totals.calories ??
        meal_derived_data.meal_calories ??
        foods.reduce((s, f) => s + (f.calories || 0), 0),
    ),
    protein_g: Number(totals.protein_g ?? meal_derived_data.meal_protein_g ?? 0),
    fiber_g: Number(totals.fiber_g ?? itemFiber),
    added_sugar_g:
      totals.added_sugar_g !== undefined ? Number(totals.added_sugar_g) : itemAddedSugar,
    is_main_meal: meal.is_main_meal,
    protein_score_10: meal.protein_score_10,
    foods,
  };
}

/**
 * Project a day's planned meals to a DailyNDSResult.
 *
 * Returns an "empty" DailyNDSResult (all zeros) when meals is empty, so
 * callers can safely spread it into plan_days columns.
 */
export function projectDailyNDS(plannedMeals: PlannedMeal[]): DailyNDSResult {
  const daily = plannedMeals.map(plannedMealToDailyMealData);
  return calculateDailyNDS(daily, /* includeDebug */ true);
}

/**
 * Project a single planned meal as if it were the only meal of the day —
 * useful for estimating an incremental NDS contribution ("what does this
 * meal do to my day?") without implying a full-day evaluation.
 */
export function projectSingleMealAsDay(meal: PlannedMeal): DailyNDSResult {
  return projectDailyNDS([meal]);
}
