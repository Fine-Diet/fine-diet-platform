/**
 * Onboarding — default flow content + answer schema
 *
 * App Copy is now the baseline for live onboarding. The flow is an app setup
 * wizard whose required baseline is Profile satisfaction: collect enough
 * Profile + rhythm data to pre-fill Home, Log, Plans, and Programs defaults.
 * Persistence construction lives in `buildProfilePatch.ts`; the visual flow
 * lives in `components/onboarding/OnboardingFlowView.tsx`.
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
  { value: 'eating_rhythm', label: 'Build a better eating rhythm' },
  { value: 'nutrient_density', label: 'Improve nutrient density' },
  { value: 'protein_intake', label: 'Increase protein intake' },
  { value: 'digestion', label: 'Support digestion' },
  { value: 'added_sugar', label: 'Reduce added sugar' },
  { value: 'meal_planning', label: 'Plan meals more consistently' },
  { value: 'patterns', label: 'Understand patterns in my food, mood, and energy' },
  { value: 'body_composition', label: 'Support body composition' },
  { value: 'maintain_routine', label: 'Maintain my current routine' },
  { value: 'not_sure', label: "I'm not sure yet" },
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

export const INTENT_OPTS: Opt[] = PRIMARY_GOAL_OPTS;

export const SEX_OPTS: Opt[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say / Skip' },
];

export const GOAL_STATE_OPTS: Opt[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain weight' },
  { value: 'recomp', label: 'Recomposition (lose fat, gain muscle)' },
];

export const EATING_RHYTHM_OPTS: Opt[] = [
  { value: 'three_meals_daily', label: '3 meals daily' },
  { value: 'three_meals_one_mini', label: '3 meals + 1 mini' },
  { value: 'three_meals_two_minis', label: '3 meals + 2 minis' },
  { value: 'two_meals_one_mini', label: '2 meals + 1 mini' },
  { value: 'two_meals_two_minis', label: '2 meals + 2 minis' },
  { value: 'four_smaller_meals', label: '4 smaller meals' },
  { value: 'five_smaller_meals', label: '5 smaller meals' },
  { value: 'early_eating_window', label: 'Early eating window' },
  { value: 'later_eating_window', label: 'Later eating window' },
  { value: 'custom_rhythm', label: 'Custom rhythm' },
];

export const FIRST_MEAL_WINDOW_OPTS: Opt[] = [
  { value: 'before_7', label: 'Before 7 AM' },
  { value: '7_9', label: '7–9 AM' },
  { value: '9_11', label: '9–11 AM' },
  { value: '11_1', label: '11 AM–1 PM' },
  { value: 'varies', label: 'It varies' },
];

export const SECOND_MEAL_WINDOW_OPTS: Opt[] = [
  { value: '11_1', label: '11 AM–1 PM' },
  { value: '1_3', label: '1–3 PM' },
  { value: '3_5', label: '3–5 PM' },
  { value: 'skip_or_varies', label: 'I skip or vary this meal' },
];

export const LAST_MEAL_WINDOW_OPTS: Opt[] = [
  { value: '5_7', label: '5–7 PM' },
  { value: '7_9', label: '7–9 PM' },
  { value: 'after_9', label: 'After 9 PM' },
  { value: 'varies', label: 'It varies' },
];

export const LAST_BITE_WINDOW_OPTS: Opt[] = [
  { value: 'no', label: 'No' },
  { value: 'before_7', label: 'Yes, before 7 PM' },
  { value: 'before_8', label: 'Yes, before 8 PM' },
  { value: 'before_9', label: 'Yes, before 9 PM' },
  { value: 'custom', label: 'Custom' },
];

export const DINING_OUT_OPTS: Opt[] = [
  { value: 'never', label: 'Almost never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'weekly', label: '1–2 times weekly' },
  { value: 'multiple_per_week', label: 'A few times weekly' },
  { value: 'daily', label: 'Most days' },
];

export const FOOD_RESTRICTION_OPTS: Opt[] = [
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'dairy_free', label: 'Dairy-free' },
  { value: 'egg_free', label: 'Egg-free' },
  { value: 'nut_free', label: 'Nut-free' },
  { value: 'soy_free', label: 'Soy-free' },
  { value: 'low_added_sugar', label: 'Low added sugar' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'no_beef', label: 'No beef' },
  { value: 'no_pork', label: 'No pork' },
  { value: 'no_seafood', label: 'No seafood' },
  { value: 'no_restrictions', label: 'No restrictions' },
  { value: 'other', label: 'Other' },
];

export const GROCERY_CADENCE_OPTS: Opt[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'two_three_weekly', label: '2–3x weekly' },
  { value: 'every_other_week', label: 'Every other week' },
  { value: 'monthly', label: 'Monthly' },
];

/* App Copy setup-wizard items (items 5, 13, 14, 19, 20, 21, 22, 23). */
export const ACTIVITY_LEVEL_OPTS: Opt[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'lightly_active', label: 'Lightly active' },
  { value: 'moderately_active', label: 'Moderately active' },
  { value: 'very_active', label: 'Very active' },
  { value: 'athlete', label: 'Athlete / highly active' },
];

export const NUTRITION_TARGET_OPTS: Opt[] = [
  { value: 'estimate_for_me', label: 'Yes, estimate for me' },
  { value: 'review_edit', label: 'Yes, but let me review/edit' },
  { value: 'log_first', label: 'Not yet — I want to log first' },
];

export const LOG_EMPHASIS_OPTS: Opt[] = [
  { value: 'nutrient_density', label: 'Nutrient density' },
  { value: 'protein_sufficiency', label: 'Protein sufficiency' },
  { value: 'plant_variety', label: 'Plant variety' },
  { value: 'fiber_intake', label: 'Fiber intake' },
  { value: 'added_sugar', label: 'Added sugar' },
  { value: 'omega_balance', label: 'Omega balance' },
  { value: 'micronutrient_coverage', label: 'Micronutrient coverage' },
];

export const PANTRY_FOUNDATION_OPTS: Opt[] = [
  { value: 'choose_staples', label: 'Yes, choose from common staples' },
  { value: 'add_own', label: "Yes, I'll add my own" },
  { value: 'skip', label: 'Skip for now' },
];

export const FAVORITE_MEAL_OPTS: Opt[] = [
  { value: 'add_now', label: 'Yes, I want to add one now' },
  { value: 'not_yet', label: 'Not yet' },
  { value: 'import_later', label: "I'll import recipes later" },
];

export const LOGGING_PROMPT_OPTS: Opt[] = [
  { value: 'hydration', label: 'Hydration' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'mood', label: 'Mood' },
  { value: 'digestion', label: 'Digestion' },
  { value: 'bowel_movements', label: 'Bowel movements' },
  { value: 'movement', label: 'Movement' },
  { value: 'cycle_notes', label: 'Cycle notes' },
  { value: 'supplements', label: 'Supplements' },
  { value: 'none', label: 'None for now' },
];

export const PROGRAM_STARTING_POINT_OPTS: Opt[] = [
  { value: 'start_baseline', label: 'Yes, start the 21-Day Baseline' },
  { value: 'show_later', label: 'Show me programs later' },
  { value: 'journal_only', label: 'I just want to use the journal' },
];

export const REVIEW_ACKNOWLEDGEMENT_OPTS: Opt[] = [
  { value: 'looks_good', label: 'Looks good — go to Home' },
  { value: 'edit_settings', label: 'Edit settings' },
];

/* Legacy option sets retained for older pages/configs and admin editors. */
export const EATING_WINDOW_OPTS: Opt[] = [
  { value: 'none', label: 'No set window — I eat across the day' },
  { value: '12h', label: '12-hour window' },
  { value: '10h', label: '10-hour window' },
  { value: '8h', label: '8-hour window (16:8)' },
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

export const MEAL_SLOT_OPTION_KEYS = MEAL_SLOT_KEYS;

/* ------------------------------------------------------------------ */
/*  Answer state                                                        */
/* ------------------------------------------------------------------ */

export interface OnboardingAnswers {
  // Profile baseline
  date_of_birth: string;
  height_value: string;
  height_unit: 'cm' | 'in';
  weight_value: string;
  weight_unit: 'kg' | 'lb';
  sex: string | null;
  primary_goal: string | null;
  // Eating rhythm
  rhythm_template: string | null;
  first_meal_window: string | null;
  second_meal_window: string | null;
  last_meal_window: string | null;
  last_bite_window: string | null;
  dining_out_frequency: string | null;
  // Preferences / planning
  food_restrictions: string[];
  disliked_foods: string;
  grocery_cadence: string | null;
  household_size: string;

  // App Copy setup-wizard enrichment items (optional by default).
  activity_level: string | null;
  nutrition_target_preference: string | null;
  log_emphasis_metrics: string[];
  pantry_foundation: string | null;
  favorite_meal_preference: string | null;
  logging_prompts: string[];
  program_starting_point: string | null;
  review_acknowledgement: string | null;

  // Legacy / optional fields retained for compatibility with older rows and personas
  priority: string | null;
  support_level: string | null;
  intents: string[];
  body_fat_percent: string;
  goal_state: string | null;
  meal_slots: MealSlotKey[];
  eating_window: string | null;
  skipped_meals: MealSlotKey[];
  dietary_style: string | null;
  allergies: string[];
  preferred_proteins: string[];
  cooking_confidence: string | null;
  kitchen_access: string | null;
  shopping_mode_preference: string | null;
  cooking_days: string[];
  prep_days: string[];
  leftovers_tolerance: string | null;
  budget_sensitivity: string | null;
}

export const INITIAL_ANSWERS: OnboardingAnswers = {
  date_of_birth: '',
  height_value: '',
  height_unit: 'cm',
  weight_value: '',
  weight_unit: 'kg',
  sex: null,
  primary_goal: null,
  rhythm_template: null,
  first_meal_window: null,
  second_meal_window: null,
  last_meal_window: null,
  last_bite_window: null,
  dining_out_frequency: null,
  food_restrictions: [],
  disliked_foods: '',
  grocery_cadence: null,
  household_size: '',
  activity_level: null,
  nutrition_target_preference: null,
  log_emphasis_metrics: [],
  pantry_foundation: null,
  favorite_meal_preference: null,
  logging_prompts: [],
  program_starting_point: null,
  review_acknowledgement: null,
  priority: null,
  support_level: null,
  intents: [],
  body_fat_percent: '',
  goal_state: null,
  meal_slots: ['breakfast', 'lunch', 'dinner'],
  eating_window: null,
  skipped_meals: [],
  dietary_style: null,
  allergies: [],
  preferred_proteins: [],
  cooking_confidence: null,
  kitchen_access: null,
  shopping_mode_preference: null,
  cooking_days: [],
  prep_days: [],
  leftovers_tolerance: null,
  budget_sensitivity: null,
};

export const STEP_TITLES = [
  'Welcome',
  'Basic profile',
  'Nutrition intention',
  'Eating rhythm',
  'Food preferences',
  'Planning basics',
  'Review setup',
] as const;

export const TOTAL_STEPS = STEP_TITLES.length;

/* ------------------------------------------------------------------ */
/*  Preview personas                                                    */
/* ------------------------------------------------------------------ */

export type OnboardingPersona = 'blank' | 'busy-parent' | 'fitness' | 'gut-health';

export const ONBOARDING_PERSONAS: readonly OnboardingPersona[] = [
  'blank',
  'busy-parent',
  'fitness',
  'gut-health',
];

const BUSY_PARENT_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'meal_planning',
  intents: ['meal_planning', 'eating_rhythm'],
  sex: 'female',
  height_value: '165',
  weight_value: '68',
  rhythm_template: 'three_meals_one_mini',
  first_meal_window: '7_9',
  second_meal_window: '11_1',
  last_meal_window: '7_9',
  last_bite_window: 'before_9',
  dining_out_frequency: 'weekly',
  food_restrictions: ['low_added_sugar'],
  grocery_cadence: 'weekly',
  household_size: '4',
};

const FITNESS_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'protein_intake',
  intents: ['protein_intake', 'body_composition'],
  sex: 'male',
  height_value: '180',
  weight_value: '82',
  rhythm_template: 'three_meals_two_minis',
  first_meal_window: '7_9',
  second_meal_window: '11_1',
  last_meal_window: '7_9',
  last_bite_window: 'no',
  dining_out_frequency: 'rarely',
  food_restrictions: [],
  grocery_cadence: 'two_three_weekly',
  household_size: '1',
};

const GUT_HEALTH_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  primary_goal: 'digestion',
  intents: ['digestion', 'nutrient_density'],
  sex: 'female',
  height_value: '168',
  weight_value: '64',
  rhythm_template: 'three_meals_daily',
  first_meal_window: '7_9',
  second_meal_window: '11_1',
  last_meal_window: '5_7',
  last_bite_window: 'before_8',
  dining_out_frequency: 'rarely',
  food_restrictions: ['dairy_free', 'gluten_free'],
  grocery_cadence: 'weekly',
  household_size: '2',
};

const PERSONA_ANSWERS: Record<OnboardingPersona, OnboardingAnswers> = {
  blank: INITIAL_ANSWERS,
  'busy-parent': BUSY_PARENT_ANSWERS,
  fitness: FITNESS_ANSWERS,
  'gut-health': GUT_HEALTH_ANSWERS,
};

export function getPersonaAnswers(persona: string | null | undefined): OnboardingAnswers {
  if (persona && (ONBOARDING_PERSONAS as readonly string[]).includes(persona)) {
    return PERSONA_ANSWERS[persona as OnboardingPersona];
  }
  return PERSONA_ANSWERS.blank;
}

export function isOnboardingPersona(value: string | null | undefined): value is OnboardingPersona {
  return Boolean(value && (ONBOARDING_PERSONAS as readonly string[]).includes(value));
}
