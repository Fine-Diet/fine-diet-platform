/**
 * Onboarding — default flow content + answer schema
 *
 * Single source of truth for the Journal pre-app onboarding sequence. Both the
 * live route (`/app/onboarding`, `/journal/onboarding`) and the admin-only
 * preview (`/admin/app-settings/onboarding/preview`) render the same option
 * sets, step titles, and default answer shape from here.
 *
 * This module is pure (no React, no network, no Supabase) and safe to import
 * on both server and client. Persistence construction lives in
 * `buildProfilePatch.ts`; the visual flow lives in
 * `components/onboarding/OnboardingFlowView.tsx`.
 */

import {
  MEAL_SLOT_KEYS,
  type MealSlotKey,
} from '@/lib/plans/types';

/* ------------------------------------------------------------------ */
/*  Option sets                                                         */
/* ------------------------------------------------------------------ */

export interface Opt {
  value: string;
  label: string;
}

export const PRIMARY_GOAL_OPTS: Opt[] = [
  { value: 'feel_better', label: 'Feel better day to day' },
  { value: 'lose_weight', label: 'Lose weight / body fat' },
  { value: 'build_muscle', label: 'Build muscle / strength' },
  { value: 'improve_energy', label: 'Improve energy & focus' },
  { value: 'digestive_health', label: 'Improve digestion' },
  { value: 'longevity', label: 'Long-term health & longevity' },
];

export const PRIORITY_OPTS: Opt[] = [
  { value: 'sustainability', label: 'A sustainable, lasting change' },
  { value: 'speed', label: 'Faster, noticeable results' },
  { value: 'simplicity', label: 'Keeping it simple' },
  { value: 'guidance', label: 'Clear guidance & structure' },
];

export const SUPPORT_OPTS: Opt[] = [
  { value: 'self_guided', label: 'Self-guided — just give me the tools' },
  { value: 'light_structure', label: 'Light structure & nudges' },
  { value: 'high_touch', label: 'High-touch — guide me closely' },
];

export const INTENT_OPTS: Opt[] = [
  { value: 'journal', label: 'Track meals in the Journal' },
  { value: 'baseline', label: 'Follow the Baseline program' },
  { value: 'care', label: 'Integrative Care support' },
  { value: 'planning', label: 'Plan meals & groceries' },
];

export const SEX_OPTS: Opt[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

export const GOAL_STATE_OPTS: Opt[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain weight' },
  { value: 'recomp', label: 'Recomposition (lose fat, gain muscle)' },
];

export const EATING_WINDOW_OPTS: Opt[] = [
  { value: 'none', label: 'No set window — I eat across the day' },
  { value: '12h', label: '12-hour window' },
  { value: '10h', label: '10-hour window' },
  { value: '8h', label: '8-hour window (16:8)' },
];

export const DINING_OUT_OPTS: Opt[] = [
  { value: 'never', label: 'Almost never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'weekly', label: 'About weekly' },
  { value: 'multiple_per_week', label: 'A few times a week' },
  { value: 'daily', label: 'Most days' },
];

export const DIETARY_STYLE_OPTS: Opt[] = [
  { value: 'omnivore', label: 'Omnivore — I eat most things' },
  { value: 'flexitarian', label: 'Flexitarian / mostly plants' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'keto', label: 'Keto / low-carb' },
];

export const ALLERGY_OPTS: Opt[] = [
  { value: 'dairy', label: 'Dairy' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'tree_nuts', label: 'Tree nuts' },
  { value: 'soy', label: 'Soy' },
  { value: 'wheat', label: 'Wheat / gluten' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'sesame', label: 'Sesame' },
];

export const PROTEIN_OPTS: Opt[] = [
  { value: 'chicken', label: 'Chicken' },
  { value: 'beef', label: 'Beef' },
  { value: 'pork', label: 'Pork' },
  { value: 'fish', label: 'Fish & seafood' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'tofu', label: 'Tofu / tempeh' },
  { value: 'legumes', label: 'Beans & legumes' },
  { value: 'dairy', label: 'Dairy / Greek yogurt' },
  { value: 'protein_powder', label: 'Protein powder' },
];

export const COOKING_CONFIDENCE_OPTS: Opt[] = [
  { value: 'beginner', label: 'Beginner — keep it very simple' },
  { value: 'comfortable', label: 'Comfortable with basics' },
  { value: 'confident', label: 'Confident cook' },
  { value: 'chef', label: 'Love to cook / advanced' },
];

export const KITCHEN_OPTS: Opt[] = [
  { value: 'full', label: 'Full kitchen' },
  { value: 'basic', label: 'Basic setup' },
  { value: 'minimal', label: 'Minimal (microwave/dorm)' },
  { value: 'none', label: 'No real kitchen right now' },
];

export const SHOPPING_OPTS: Opt[] = [
  { value: 'in_store', label: 'Shop in-store' },
  { value: 'instacart', label: 'Delivery (Instacart, etc.)' },
  { value: 'mixed', label: 'A mix of both' },
];

export const LEFTOVERS_OPTS: Opt[] = [
  { value: 'love', label: 'Love leftovers — cook once, eat twice' },
  { value: 'ok', label: 'Leftovers are fine' },
  { value: 'avoid', label: 'Prefer fresh each time' },
];

export const BUDGET_OPTS: Opt[] = [
  { value: 'tight', label: 'Tight — budget matters a lot' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'flexible', label: 'Flexible' },
];

export const WEEKDAY_OPTS: Opt[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

/** Slot keys re-exported so the view/preview can map option rows without
 *  reaching into the plans types module directly. */
export const MEAL_SLOT_OPTION_KEYS = MEAL_SLOT_KEYS;

/* ------------------------------------------------------------------ */
/*  Answer state                                                        */
/* ------------------------------------------------------------------ */

export interface OnboardingAnswers {
  // Intent
  primary_goal: string | null;
  priority: string | null;
  support_level: string | null;
  intents: string[];
  // Body baseline
  date_of_birth: string;
  sex: string | null;
  height_value: string;
  height_unit: 'cm' | 'in';
  weight_value: string;
  weight_unit: 'kg' | 'lb';
  body_fat_percent: string;
  goal_state: string | null;
  // Eating pattern
  meal_slots: MealSlotKey[];
  eating_window: string | null;
  skipped_meals: MealSlotKey[];
  dining_out_frequency: string | null;
  // Preferences / constraints
  dietary_style: string | null;
  allergies: string[];
  disliked_foods: string;
  preferred_proteins: string[];
  cooking_confidence: string | null;
  kitchen_access: string | null;
  // Planning / grocery
  household_size: string;
  shopping_mode_preference: string | null;
  cooking_days: string[];
  prep_days: string[];
  leftovers_tolerance: string | null;
  budget_sensitivity: string | null;
}

export const INITIAL_ANSWERS: OnboardingAnswers = {
  primary_goal: null,
  priority: null,
  support_level: null,
  intents: [],
  date_of_birth: '',
  sex: null,
  height_value: '',
  height_unit: 'cm',
  weight_value: '',
  weight_unit: 'kg',
  body_fat_percent: '',
  goal_state: null,
  meal_slots: ['breakfast', 'lunch', 'dinner'],
  eating_window: null,
  skipped_meals: [],
  dining_out_frequency: null,
  dietary_style: null,
  allergies: [],
  disliked_foods: '',
  preferred_proteins: [],
  cooking_confidence: null,
  kitchen_access: null,
  household_size: '',
  shopping_mode_preference: null,
  cooking_days: [],
  prep_days: [],
  leftovers_tolerance: null,
  budget_sensitivity: null,
};

export const STEP_TITLES = [
  'What brings you here?',
  'A few baseline details',
  'How you eat',
  'Preferences & constraints',
  'Planning & groceries',
] as const;

export const TOTAL_STEPS = STEP_TITLES.length;

/* ------------------------------------------------------------------ */
/*  Preview personas                                                    */
/* ------------------------------------------------------------------ */

/**
 * Persona presets for the admin preview. These are non-persistent seed
 * answers that let an editor see the flow pre-filled with a realistic
 * shape. They never touch `people.metadata` — the preview route does not
 * call `/api/journal/profile`.
 */
export type OnboardingPersona = 'blank' | 'busy-parent' | 'fitness' | 'gut-health';

export const ONBOARDING_PERSONAS: readonly OnboardingPersona[] = [
  'blank',
  'busy-parent',
  'fitness',
  'gut-health',
];

const BUSY_PARENT_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'feel_better',
  priority: 'simplicity',
  support_level: 'light_structure',
  intents: ['journal', 'planning'],
  sex: 'female',
  height_value: '165',
  height_unit: 'cm',
  weight_value: '68',
  weight_unit: 'kg',
  goal_state: 'lose',
  meal_slots: ['breakfast', 'lunch', 'dinner'],
  dining_out_frequency: 'weekly',
  dietary_style: 'flexitarian',
  preferred_proteins: ['chicken', 'eggs', 'legumes'],
  cooking_confidence: 'comfortable',
  kitchen_access: 'full',
  household_size: '4',
  shopping_mode_preference: 'mixed',
  cooking_days: ['mon', 'wed', 'sun'],
  prep_days: ['sun'],
  leftovers_tolerance: 'love',
  budget_sensitivity: 'moderate',
};

const FITNESS_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'build_muscle',
  priority: 'speed',
  support_level: 'self_guided',
  intents: ['journal', 'baseline'],
  sex: 'male',
  height_value: '180',
  height_unit: 'cm',
  weight_value: '82',
  weight_unit: 'kg',
  body_fat_percent: '15',
  goal_state: 'gain',
  meal_slots: ['breakfast', 'lunch', 'dinner'],
  dining_out_frequency: 'rarely',
  dietary_style: 'omnivore',
  preferred_proteins: ['chicken', 'beef', 'eggs', 'dairy', 'protein_powder'],
  cooking_confidence: 'confident',
  kitchen_access: 'full',
  household_size: '1',
  shopping_mode_preference: 'in_store',
  cooking_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  prep_days: ['sun'],
  leftovers_tolerance: 'ok',
  budget_sensitivity: 'flexible',
};

const GUT_HEALTH_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'digestive_health',
  priority: 'sustainability',
  support_level: 'light_structure',
  intents: ['baseline', 'journal'],
  sex: 'female',
  height_value: '168',
  height_unit: 'cm',
  weight_value: '64',
  weight_unit: 'kg',
  goal_state: 'maintain',
  meal_slots: ['breakfast', 'lunch', 'dinner'],
  eating_window: '12h',
  dining_out_frequency: 'rarely',
  dietary_style: 'mediterranean',
  allergies: ['dairy', 'wheat'],
  preferred_proteins: ['fish', 'legumes', 'tofu'],
  cooking_confidence: 'comfortable',
  kitchen_access: 'full',
  household_size: '2',
  shopping_mode_preference: 'in_store',
  cooking_days: ['mon', 'wed', 'fri', 'sun'],
  prep_days: ['wed', 'sun'],
  leftovers_tolerance: 'ok',
  budget_sensitivity: 'moderate',
};

const PERSONA_ANSWERS: Record<OnboardingPersona, OnboardingAnswers> = {
  blank: INITIAL_ANSWERS,
  'busy-parent': BUSY_PARENT_ANSWERS,
  fitness: FITNESS_ANSWERS,
  'gut-health': GUT_HEALTH_ANSWERS,
};

/** Returns the seed answers for a preview persona, falling back to `blank`. */
export function getPersonaAnswers(persona: string | null | undefined): OnboardingAnswers {
  if (persona && (ONBOARDING_PERSONAS as readonly string[]).includes(persona)) {
    return PERSONA_ANSWERS[persona as OnboardingPersona];
  }
  return PERSONA_ANSWERS.blank;
}

/** True when `value` is a recognized persona key. */
export function isOnboardingPersona(value: string | null | undefined): value is OnboardingPersona {
  return Boolean(value && (ONBOARDING_PERSONAS as readonly string[]).includes(value));
}
