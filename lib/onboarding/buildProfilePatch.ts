/**
 * Onboarding — profile patch construction
 *
 * Pure mapping from `OnboardingAnswers` to the `POST /api/journal/profile`
 * payload shape. Extracted from the live route so the admin preview can
 * import the answers type without pulling in any persistence behavior, and
 * so the mapping is unit-testable in isolation.
 *
 * Behavior is identical to the original inline implementation:
 *   - Canonical metadata fields the rest of the app already reads are set
 *     directly (date_of_birth, sex, height_cm, weight_kg, primary_goal,
 *     dietary_style, allergies, eating_window, dining_out_frequency,
 *     shopping_mode_preference, household_size, meal_schedule).
 *   - Everything else lives under a single `onboarding` metadata blob.
 *   - Completion is tracked via `onboarding_completed_at`.
 *   - Age is never stored (only date_of_birth). No medical diagnoses.
 *   - Optional fields never block completion (callers decide skip semantics).
 */

import { defaultMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  MEAL_SLOT_KEYS,
  type MealSchedule,
  type MealSlotKey,
} from '@/lib/plans/types';
import type { OnboardingAnswers } from './defaultOnboardingFlow';

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

export function buildMealSchedule(selected: MealSlotKey[]): MealSchedule {
  const schedule = defaultMealSchedule();
  const enabledSet = new Set(selected.length > 0 ? selected : ['breakfast', 'lunch', 'dinner']);
  for (const key of MEAL_SLOT_KEYS) {
    schedule.slots[key] = { ...schedule.slots[key], enabled: enabledSet.has(key) };
  }
  schedule.updated_at = new Date().toISOString();
  return schedule;
}

/** Map onboarding answers to a profile-API patch (canonical fields + blob). */
export function buildProfilePatch(a: OnboardingAnswers): Record<string, unknown> {
  const heightCm = toHeightCm(a.height_value, a.height_unit);
  const weightKg = toWeightKg(a.weight_value, a.weight_unit);

  const onboardingBlob = {
    version: 1 as const,
    completed_at: new Date().toISOString(),
    intent: {
      primary_goal: a.primary_goal,
      priority: a.priority,
      support_level: a.support_level,
      intents: a.intents,
    },
    body: {
      body_fat_percent: toNumberOrNull(a.body_fat_percent),
      goal_state: a.goal_state,
    },
    eating: {
      meal_slots: a.meal_slots,
      eating_window: a.eating_window,
      skipped_meals: a.skipped_meals,
      dining_out_frequency: a.dining_out_frequency,
    },
    preferences: {
      dietary_style: a.dietary_style,
      allergies: a.allergies,
      disliked_foods: a.disliked_foods.trim() || null,
      preferred_proteins: a.preferred_proteins,
      cooking_confidence: a.cooking_confidence,
      kitchen_access: a.kitchen_access,
    },
    planning: {
      household_size: toNumberOrNull(a.household_size),
      shopping_mode_preference: a.shopping_mode_preference,
      cooking_days: a.cooking_days,
      prep_days: a.prep_days,
      leftovers_tolerance: a.leftovers_tolerance,
      budget_sensitivity: a.budget_sensitivity,
    },
  };

  const patch: Record<string, unknown> = {
    onboarding: onboardingBlob,
    meal_schedule: buildMealSchedule(a.meal_slots),
    onboarding_completed_at: new Date().toISOString(),
  };

  // Canonical fields the rest of the app already reads — only set when present.
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
  if (a.eating_window && a.eating_window !== 'none') patch.eating_window = a.eating_window;
  if (a.dining_out_frequency) patch.dining_out_frequency = a.dining_out_frequency;
  if (a.dietary_style) patch.dietary_style = a.dietary_style;
  if (a.allergies.length > 0) patch.allergies = a.allergies;
  if (a.shopping_mode_preference) patch.shopping_mode_preference = a.shopping_mode_preference;
  const household = toNumberOrNull(a.household_size);
  if (household !== null) patch.household_size = household;

  return patch;
}
