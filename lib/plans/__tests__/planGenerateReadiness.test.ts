import { derivePlanGenerateReadiness } from '../planGenerateReadiness';
import type { PlanInputSnapshot } from '../types';

function snapshot(partial: Partial<PlanInputSnapshot['body']>): PlanInputSnapshot {
  return {
    body: {
      age_years: null,
      sex: null,
      height_cm: null,
      weight_kg: null,
      weight_as_of: null,
      body_fat_percent: null,
      ...partial,
    },
    preferences: {
      dining_out_frequency: null,
      shopping_mode_preference: null,
      household_size: null,
      eating_window: null,
      eating_window_start: null,
      eating_window_end: null,
      dietary_style: null,
      allergies: null,
    },
    targets: {
      daily_calorie_goal: null,
      macro_goals: null,
      nds_score_100_target: null,
      subscore_floors_10: null,
    },
    program_guidance: null,
  };
}

describe('derivePlanGenerateReadiness', () => {
  test('requires profile snapshot', () => {
    expect(derivePlanGenerateReadiness(null)).toEqual({
      canGenerate: false,
      missingReasons: ['Profile data is still loading.'],
    });
  });

  test('passes when DOB, height, and weight are present and 18+', () => {
    expect(
      derivePlanGenerateReadiness(
        snapshot({ age_years: 30, height_cm: 180, weight_kg: 75 }),
      ),
    ).toEqual({
      canGenerate: true,
      missingReasons: [],
    });
  });

  test('reports missing profile fields', () => {
    expect(derivePlanGenerateReadiness(snapshot({ age_years: 30 }))).toEqual({
      canGenerate: false,
      missingReasons: ['Set your height', 'Set your weight'],
    });
  });
});
