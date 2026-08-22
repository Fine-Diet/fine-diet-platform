/**
 * Meal Rhythm v2B — presentation-only counts.
 *
 * Classifies occasion keys into "core meals" and "mini meals" for display
 * purposes only. These designations are never persisted or used in scoring.
 *
 * Core meals:  occasion_2 (Breakfast), occasion_4 (Lunch), occasion_7 (Dinner)
 * Mini meals:  occasion_1, occasion_3, occasion_5, occasion_6, occasion_8
 *
 * Only counts enabled occasions.
 */

import type { MealSchedule } from '@/lib/plans/types';
import { MEAL_OCCASION_KEYS } from '@/lib/plans/types';

const CORE_OCCASION_KEYS = new Set<string>([
  'occasion_2',
  'occasion_4',
  'occasion_7',
]);

const MINI_OCCASION_KEYS = new Set<string>([
  'occasion_1',
  'occasion_3',
  'occasion_5',
  'occasion_6',
  'occasion_8',
]);

export interface MealRhythmPresentationCounts {
  meals: number;
  miniMeals: number;
}

/**
 * Count enabled core and mini meals from a schedule for display purposes.
 */
export function getMealRhythmPresentationCounts(
  schedule: MealSchedule,
): MealRhythmPresentationCounts {
  let meals = 0;
  let miniMeals = 0;

  for (const key of MEAL_OCCASION_KEYS) {
    if (!schedule.slots[key].enabled) continue;
    if (CORE_OCCASION_KEYS.has(key)) meals++;
    else if (MINI_OCCASION_KEYS.has(key)) miniMeals++;
  }

  return { meals, miniMeals };
}

/**
 * Format counts as a human-readable string, e.g. "3 meals + 2 mini meals".
 * Always shows both parts so the display is stable.
 */
export function formatMealRhythmCounts(counts: MealRhythmPresentationCounts): string {
  const mealsPart = `${counts.meals} ${counts.meals === 1 ? 'meal' : 'meals'}`;
  const miniPart = `${counts.miniMeals} ${counts.miniMeals === 1 ? 'mini meal' : 'mini meals'}`;
  return `${mealsPart} + ${miniPart}`;
}
