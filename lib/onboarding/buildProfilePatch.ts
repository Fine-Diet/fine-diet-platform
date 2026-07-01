/**
 * Onboarding — profile patch construction
 *
 * Pure mapping from `OnboardingAnswers` to the `POST /api/journal/profile`
 * payload shape. The App Copy baseline writes canonical Profile fields directly,
 * stores setup-only answers under `onboarding`, builds `meal_schedule`, and
 * marks completion via `onboarding_completed_at`.
 */

import { defaultMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  MEAL_SLOT_KEYS,
  type MealSchedule,
  type MealSlotKey,
} from '@/lib/plans/types';
import type { OnboardingAnswers } from './defaultOnboardingFlow';

const DEFAULT_ENABLED_MEAL_SLOTS: MealSlotKey[] = ['breakfast', 'lunch', 'dinner'];

function mealSlotSet(keys: MealSlotKey[]): Set<MealSlotKey> {
  return new Set<MealSlotKey>(keys);
}

export function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function toHeightCm(value: string, unit: 'cm' | 'in'): number | null {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return unit === 'cm' ? Math.round(n) : Math.round(n * 2.54);
}

export function toWeightKg(value: string, unit: 'kg' | 'lb'): number | null {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return unit === 'kg' ? Math.round(n * 10) / 10 : Math.round(n * 0.45359237 * 10) / 10;
}

function timeForFirstMeal(value: string | null): string | null {
  switch (value) {
    case 'before_7': return '06:30';
    case '7_9': return '08:00';
    case '9_11': return '10:00';
    case '11_1': return '12:00';
    default: return null;
  }
}

function timeForSecondMeal(value: string | null): string | null {
  switch (value) {
    case '11_1': return '12:30';
    case '1_3': return '14:00';
    case '3_5': return '16:00';
    default: return null;
  }
}

function timeForLastMeal(value: string | null): string | null {
  switch (value) {
    case '5_7': return '18:00';
    case '7_9': return '20:00';
    case 'after_9': return '21:30';
    default: return null;
  }
}

function enabledSlotsForRhythm(rhythm: string | null): Set<MealSlotKey> {
  switch (rhythm) {
    case 'three_meals_one_mini':
      return mealSlotSet(['breakfast', 'lunch', 'afternoon_snack', 'dinner']);
    case 'three_meals_two_minis':
      return mealSlotSet(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner']);
    case 'two_meals_one_mini':
      return mealSlotSet(['lunch', 'afternoon_snack', 'dinner']);
    case 'two_meals_two_minis':
      return mealSlotSet(['morning_snack', 'lunch', 'afternoon_snack', 'dinner']);
    case 'four_smaller_meals':
      return mealSlotSet(['breakfast', 'lunch', 'afternoon_snack', 'dinner']);
    case 'five_smaller_meals':
      return mealSlotSet(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner']);
    case 'early_eating_window':
    case 'later_eating_window':
    case 'custom_rhythm':
    case 'three_meals_daily':
    default:
      return mealSlotSet(DEFAULT_ENABLED_MEAL_SLOTS);
  }
}

/** Legacy helper retained for tests/callers: build schedule from selected slot keys. */
export function buildMealSchedule(selected: MealSlotKey[]): MealSchedule {
  const schedule = defaultMealSchedule();
  const enabledSet = mealSlotSet(selected.length > 0 ? selected : DEFAULT_ENABLED_MEAL_SLOTS);
  for (const key of MEAL_SLOT_KEYS) {
    schedule.slots[key] = { ...schedule.slots[key], enabled: enabledSet.has(key) };
  }
  schedule.updated_at = new Date().toISOString();
  return schedule;
}

/** Build an App Copy rhythm schedule from the baseline setup answers. */
export function buildAppCopyMealSchedule(a: OnboardingAnswers): MealSchedule {
  const schedule = defaultMealSchedule();
  const enabledSet = enabledSlotsForRhythm(a.rhythm_template);
  for (const key of MEAL_SLOT_KEYS) {
    schedule.slots[key] = { ...schedule.slots[key], enabled: enabledSet.has(key) };
  }

  const first = timeForFirstMeal(a.first_meal_window);
  const second = timeForSecondMeal(a.second_meal_window);
  const last = timeForLastMeal(a.last_meal_window);

  if (first) schedule.slots.breakfast.target_time = first;
  if (second) schedule.slots.lunch.target_time = second;
  if (last) schedule.slots.dinner.target_time = last;

  // If the user says they skip/vary the second meal, keep lunch enabled only
  // when the rhythm itself clearly includes three meals.
  if (a.second_meal_window === 'skip_or_varies' && a.rhythm_template?.startsWith('two_meals')) {
    schedule.slots.lunch.enabled = false;
  }

  schedule.updated_at = new Date().toISOString();
  return schedule;
}

function dietaryStyleFromRestrictions(restrictions: string[]): string | null {
  if (restrictions.includes('vegan')) return 'vegan';
  if (restrictions.includes('vegetarian')) return 'vegetarian';
  if (restrictions.includes('pescatarian')) return 'pescatarian';
  return null;
}

function allergiesFromRestrictions(restrictions: string[]): string[] {
  const out = new Set<string>();
  if (restrictions.includes('dairy_free')) out.add('dairy');
  if (restrictions.includes('egg_free')) out.add('eggs');
  if (restrictions.includes('nut_free')) out.add('tree_nuts');
  if (restrictions.includes('soy_free')) out.add('soy');
  if (restrictions.includes('gluten_free')) out.add('wheat');
  return Array.from(out);
}

/** Map onboarding answers to a profile-API patch (canonical fields + blob). */
export function buildProfilePatch(a: OnboardingAnswers): Record<string, unknown> {
  const heightCm = toHeightCm(a.height_value, a.height_unit);
  const weightKg = toWeightKg(a.weight_value, a.weight_unit);
  const mappedDietaryStyle = dietaryStyleFromRestrictions(a.food_restrictions) ?? a.dietary_style;
  const mappedAllergies = Array.from(new Set<string>([
    ...a.allergies,
    ...allergiesFromRestrictions(a.food_restrictions),
  ]));

  const onboardingBlob = {
    version: 1 as const,
    completed_at: new Date().toISOString(),
    source: 'app_copy_profile_baseline' as const,
    intent: {
      primary_goal: a.primary_goal,
      priority: a.priority,
      support_level: a.support_level,
      intents: a.intents.length > 0 ? a.intents : a.primary_goal ? [a.primary_goal] : [],
    },
    body: {
      body_fat_percent: toNumberOrNull(a.body_fat_percent),
      goal_state: a.goal_state,
    },
    eating: {
      rhythm_template: a.rhythm_template,
      first_meal_window: a.first_meal_window,
      second_meal_window: a.second_meal_window,
      last_meal_window: a.last_meal_window,
      last_bite_window: a.last_bite_window,
      meal_slots: a.meal_slots,
      eating_window: a.eating_window,
      skipped_meals: a.skipped_meals,
      dining_out_frequency: a.dining_out_frequency,
    },
    preferences: {
      dietary_style: mappedDietaryStyle,
      allergies: mappedAllergies,
      food_restrictions: a.food_restrictions,
      disliked_foods: a.disliked_foods.trim() || null,
      preferred_proteins: a.preferred_proteins,
      cooking_confidence: a.cooking_confidence,
      kitchen_access: a.kitchen_access,
    },
    planning: {
      household_size: toNumberOrNull(a.household_size),
      shopping_mode_preference: a.shopping_mode_preference,
      grocery_cadence: a.grocery_cadence,
      cooking_days: a.cooking_days,
      prep_days: a.prep_days,
      leftovers_tolerance: a.leftovers_tolerance,
      budget_sensitivity: a.budget_sensitivity,
    },
  };

  const patch: Record<string, unknown> = {
    onboarding: onboardingBlob,
    meal_schedule: buildAppCopyMealSchedule(a),
    onboarding_completed_at: new Date().toISOString(),
  };

  if (a.primary_goal) patch.primary_goal = a.primary_goal;
  if (a.date_of_birth) patch.date_of_birth = a.date_of_birth;
  if (a.sex) patch.sex = a.sex;
  if (heightCm !== null) {
    patch.height_cm = heightCm;
    patch.height_display_unit = a.height_unit;
  }
  if (weightKg !== null) {
    patch.weight_kg = weightKg;
    patch.weight_display_unit = a.weight_unit;
    patch.weight_as_of = new Date().toISOString().slice(0, 10);
  }
  // Preserve existing eating_window compatibility. App Copy's last-bite window
  // is stored under onboarding.eating.last_bite_window until app readers are
  // updated to understand it as a canonical eating_window value.
  if (a.eating_window && a.eating_window !== 'none') patch.eating_window = a.eating_window;
  if (a.dining_out_frequency) patch.dining_out_frequency = a.dining_out_frequency;
  if (mappedDietaryStyle) patch.dietary_style = mappedDietaryStyle;
  if (mappedAllergies.length > 0) patch.allergies = mappedAllergies;
  if (a.shopping_mode_preference) patch.shopping_mode_preference = a.shopping_mode_preference;
  const household = toNumberOrNull(a.household_size);
  if (household !== null) patch.household_size = household;

  return patch;
}
