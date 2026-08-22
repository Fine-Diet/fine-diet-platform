/**
 * Tests for lib/plans/mealRhythm/presentationCounts.ts
 */

import {
  getMealRhythmPresentationCounts,
  formatMealRhythmCounts,
} from '../presentationCounts';
import type { MealSchedule } from '@/lib/plans/types';
import { MEAL_OCCASION_KEYS, MEAL_OCCASION_DEFAULT_TIMES } from '@/lib/plans/types';

function buildSchedule(enabled: string[]): MealSchedule {
  const enabledSet = new Set(enabled);
  const slots = Object.fromEntries(
    MEAL_OCCASION_KEYS.map((key) => [
      key,
      {
        enabled: enabledSet.has(key),
        target_time: MEAL_OCCASION_DEFAULT_TIMES[key],
        label: null,
      },
    ]),
  ) as MealSchedule['slots'];
  return { version: 2, slots, updated_at: new Date().toISOString() };
}

describe('getMealRhythmPresentationCounts', () => {
  it('counts 0 meals and 0 mini meals when nothing is enabled', () => {
    const schedule = buildSchedule([]);
    expect(getMealRhythmPresentationCounts(schedule)).toEqual({ meals: 0, miniMeals: 0 });
  });

  it('correctly classifies core occasions as meals', () => {
    const schedule = buildSchedule(['occasion_2', 'occasion_4', 'occasion_7']);
    expect(getMealRhythmPresentationCounts(schedule)).toEqual({ meals: 3, miniMeals: 0 });
  });

  it('correctly classifies mini occasions', () => {
    const schedule = buildSchedule(['occasion_1', 'occasion_3', 'occasion_5', 'occasion_6', 'occasion_8']);
    expect(getMealRhythmPresentationCounts(schedule)).toEqual({ meals: 0, miniMeals: 5 });
  });

  it('handles mixed enabled occasions', () => {
    const schedule = buildSchedule(['occasion_2', 'occasion_4', 'occasion_7', 'occasion_3']);
    expect(getMealRhythmPresentationCounts(schedule)).toEqual({ meals: 3, miniMeals: 1 });
  });

  it('only counts enabled occasions', () => {
    const schedule = buildSchedule(['occasion_2']);
    expect(getMealRhythmPresentationCounts(schedule)).toEqual({ meals: 1, miniMeals: 0 });
  });
});

describe('formatMealRhythmCounts', () => {
  it('formats plural meals and mini meals', () => {
    expect(formatMealRhythmCounts({ meals: 3, miniMeals: 2 })).toBe('3 meals + 2 mini meals');
  });

  it('formats singular meal', () => {
    expect(formatMealRhythmCounts({ meals: 1, miniMeals: 0 })).toBe('1 meal + 0 mini meals');
  });

  it('formats singular mini meal', () => {
    expect(formatMealRhythmCounts({ meals: 2, miniMeals: 1 })).toBe('2 meals + 1 mini meal');
  });

  it('formats zeros', () => {
    expect(formatMealRhythmCounts({ meals: 0, miniMeals: 0 })).toBe('0 meals + 0 mini meals');
  });
});
