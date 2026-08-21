import { describe, expect, it } from '@jest/globals';
import { buildAppCopyMealSchedule } from '../buildProfilePatch';
import {
  INITIAL_SETUP_RHYTHM_OPTION_LABELS,
  INITIAL_SETUP_RHYTHM_OPTION_ORDER,
} from '../onboardingFlowTypes';
import { INITIAL_ANSWERS, type OnboardingAnswers } from '../defaultOnboardingFlow';
import type { MealSlotKey } from '@/lib/plans/types';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';

function enabledKeys(answers: Partial<OnboardingAnswers>): MealSlotKey[] {
  const schedule = buildAppCopyMealSchedule({
    ...INITIAL_ANSWERS,
    ...answers,
  } as OnboardingAnswers);
  return (Object.keys(schedule.slots) as MealSlotKey[]).filter((k) => schedule.slots[k].enabled);
}

describe('Initial Setup v2 rhythm preset → canonical meal_schedule', () => {
  it('exposes exactly the five founder presets with prototype labels', () => {
    expect([...INITIAL_SETUP_RHYTHM_OPTION_ORDER]).toEqual([
      'three_meals_daily',
      'three_meals_one_mini',
      'three_meals_two_minis',
      'two_meals_one_mini',
      'custom_rhythm',
    ]);
    expect(INITIAL_SETUP_RHYTHM_OPTION_LABELS.three_meals_daily).toBe('3 meals');
    expect(INITIAL_SETUP_RHYTHM_OPTION_LABELS.custom_rhythm).toBe("Other (I'll set it up)");
  });

  it('maps 3 meals → breakfast + lunch + dinner', () => {
    expect(enabledKeys({ rhythm_template: 'three_meals_daily' }).sort()).toEqual(
      ['breakfast', 'dinner', 'lunch'].sort(),
    );
  });

  it('maps 3 meals + 1 mini → B + L + afternoon_snack + D', () => {
    expect(enabledKeys({ rhythm_template: 'three_meals_one_mini' }).sort()).toEqual(
      ['afternoon_snack', 'breakfast', 'dinner', 'lunch'].sort(),
    );
  });

  it('maps 3 meals + 2 minis → B + morning_snack + L + afternoon_snack + D', () => {
    expect(enabledKeys({ rhythm_template: 'three_meals_two_minis' }).sort()).toEqual(
      ['afternoon_snack', 'breakfast', 'dinner', 'lunch', 'morning_snack'].sort(),
    );
  });

  it('maps 2 meals + 1 mini → lunch + afternoon_snack + dinner', () => {
    expect(enabledKeys({ rhythm_template: 'two_meals_one_mini' }).sort()).toEqual(
      ['afternoon_snack', 'dinner', 'lunch'].sort(),
    );
  });

  it("maps Other (I'll set it up) → custom_rhythm with no enabled slots", () => {
    expect(enabledKeys({ rhythm_template: 'custom_rhythm' })).toEqual([]);
  });

  it('custom_rhythm meal_schedule is not usable for Plans decisioning', () => {
    const schedule = buildAppCopyMealSchedule({
      ...INITIAL_ANSWERS,
      rhythm_template: 'custom_rhythm',
    });
    expect(isUsableSavedMealSchedule(schedule)).toBe(false);
  });
});
