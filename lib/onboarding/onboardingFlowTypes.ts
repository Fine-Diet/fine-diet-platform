/**
 * Onboarding authoring — durable types + code-owned safety allowlists.
 *
 * SAFETY BOUNDARY:
 * - The set of known questions, profile targets, onboarding blob paths, and
 *   allowed option values are code-owned here.
 * - Admin config can override presentation only: page sequencing, titles/helper
 *   text, prompts/hints, option labels/order, required/visible toggles.
 * - Admin config can never introduce new question ids, option values, profile
 *   targets, or onboarding blob paths.
 * - `buildProfilePatch` remains the single writer of `people.metadata`.
 */

import { z } from 'zod';
import {
  ALLERGY_OPTS,
  BUDGET_OPTS,
  COOKING_CONFIDENCE_OPTS,
  DIETARY_STYLE_OPTS,
  DINING_OUT_OPTS,
  EATING_RHYTHM_OPTS,
  EATING_WINDOW_OPTS,
  FIRST_MEAL_WINDOW_OPTS,
  FOOD_RESTRICTION_OPTS,
  GOAL_STATE_OPTS,
  GROCERY_CADENCE_OPTS,
  INTENT_OPTS,
  KITCHEN_OPTS,
  LAST_BITE_WINDOW_OPTS,
  LAST_MEAL_WINDOW_OPTS,
  LEFTOVERS_OPTS,
  MEAL_SLOT_OPTION_KEYS,
  PRIMARY_GOAL_OPTS,
  PRIORITY_OPTS,
  PROTEIN_OPTS,
  SECOND_MEAL_WINDOW_OPTS,
  SEX_OPTS,
  SHOPPING_OPTS,
  SUPPORT_OPTS,
  WEEKDAY_OPTS,
} from './defaultOnboardingFlow';

/* ------------------------------------------------------------------ */
/*  Status + flow key                                                   */
/* ------------------------------------------------------------------ */

export const ONBOARDING_FLOW_STATUSES = ['draft', 'published', 'archived'] as const;
export type OnboardingFlowStatus = (typeof ONBOARDING_FLOW_STATUSES)[number];

export const DEFAULT_ONBOARDING_FLOW_KEY = 'default';

/* ------------------------------------------------------------------ */
/*  Known question catalog (CODE-OWNED)                                */
/* ------------------------------------------------------------------ */

export const ONBOARDING_QUESTION_TYPES = [
  'single-select',
  'multi-select',
  'text',
  'number',
  'date',
  'height',
  'weight',
] as const;

export type OnboardingQuestionType = (typeof ONBOARDING_QUESTION_TYPES)[number];

export interface KnownQuestionDef {
  id: string;
  step: number;
  type: OnboardingQuestionType;
  profileTarget?: string;
  onboardingBlobPath?: string;
  allowedOptionValues?: readonly string[];
}

function values(opts: readonly { value: string }[]): readonly string[] {
  return opts.map((o) => o.value);
}

/**
 * App Copy Profile-satisfaction baseline. These are the required live default
 * onboarding pages, in order. Other known questions remain in the catalog only
 * for backward compatibility with older configs and editor drafts.
 */
export const APP_COPY_BASELINE_QUESTION_IDS = [
  'date_of_birth',
  'height',
  'weight',
  'sex',
  'primary_goal',
  'rhythm_template',
  'first_meal_window',
  'second_meal_window',
  'last_meal_window',
  'last_bite_window',
  'dining_out_frequency',
  'food_restrictions',
  'disliked_foods',
  'grocery_cadence',
  'household_size',
] as const;

export const KNOWN_QUESTIONS: readonly KnownQuestionDef[] = [
  // App Copy baseline — profile + rhythm setup
  { id: 'date_of_birth', step: 0, type: 'date', profileTarget: 'date_of_birth' },
  { id: 'height', step: 0, type: 'height', profileTarget: 'height_cm' },
  { id: 'weight', step: 0, type: 'weight', profileTarget: 'weight_kg' },
  { id: 'sex', step: 0, type: 'single-select', profileTarget: 'sex', allowedOptionValues: values(SEX_OPTS) },
  { id: 'primary_goal', step: 1, type: 'single-select', profileTarget: 'primary_goal', onboardingBlobPath: 'intent.primary_goal', allowedOptionValues: values(PRIMARY_GOAL_OPTS) },
  { id: 'rhythm_template', step: 2, type: 'single-select', profileTarget: 'meal_schedule', onboardingBlobPath: 'eating.rhythm_template', allowedOptionValues: values(EATING_RHYTHM_OPTS) },
  { id: 'first_meal_window', step: 2, type: 'single-select', onboardingBlobPath: 'eating.first_meal_window', allowedOptionValues: values(FIRST_MEAL_WINDOW_OPTS) },
  { id: 'second_meal_window', step: 2, type: 'single-select', onboardingBlobPath: 'eating.second_meal_window', allowedOptionValues: values(SECOND_MEAL_WINDOW_OPTS) },
  { id: 'last_meal_window', step: 2, type: 'single-select', onboardingBlobPath: 'eating.last_meal_window', allowedOptionValues: values(LAST_MEAL_WINDOW_OPTS) },
  { id: 'last_bite_window', step: 2, type: 'single-select', onboardingBlobPath: 'eating.last_bite_window', allowedOptionValues: values(LAST_BITE_WINDOW_OPTS) },
  { id: 'dining_out_frequency', step: 2, type: 'single-select', profileTarget: 'dining_out_frequency', onboardingBlobPath: 'eating.dining_out_frequency', allowedOptionValues: values(DINING_OUT_OPTS) },
  { id: 'food_restrictions', step: 3, type: 'multi-select', onboardingBlobPath: 'preferences.food_restrictions', allowedOptionValues: values(FOOD_RESTRICTION_OPTS) },
  { id: 'disliked_foods', step: 3, type: 'text', onboardingBlobPath: 'preferences.disliked_foods' },
  { id: 'grocery_cadence', step: 4, type: 'single-select', onboardingBlobPath: 'planning.grocery_cadence', allowedOptionValues: values(GROCERY_CADENCE_OPTS) },
  { id: 'household_size', step: 4, type: 'number', profileTarget: 'household_size', onboardingBlobPath: 'planning.household_size' },

  // Legacy / optional catalog entries retained for compatibility.
  { id: 'priority', step: 1, type: 'single-select', onboardingBlobPath: 'intent.priority', allowedOptionValues: values(PRIORITY_OPTS) },
  { id: 'support_level', step: 1, type: 'single-select', onboardingBlobPath: 'intent.support_level', allowedOptionValues: values(SUPPORT_OPTS) },
  { id: 'intents', step: 1, type: 'multi-select', onboardingBlobPath: 'intent.intents', allowedOptionValues: values(INTENT_OPTS) },
  { id: 'body_fat_percent', step: 0, type: 'number', onboardingBlobPath: 'body.body_fat_percent' },
  { id: 'goal_state', step: 0, type: 'single-select', onboardingBlobPath: 'body.goal_state', allowedOptionValues: values(GOAL_STATE_OPTS) },
  { id: 'meal_slots', step: 2, type: 'multi-select', profileTarget: 'meal_schedule', allowedOptionValues: MEAL_SLOT_OPTION_KEYS },
  { id: 'eating_window', step: 2, type: 'single-select', profileTarget: 'eating_window', allowedOptionValues: values(EATING_WINDOW_OPTS) },
  { id: 'skipped_meals', step: 2, type: 'multi-select', onboardingBlobPath: 'eating.skipped_meals', allowedOptionValues: MEAL_SLOT_OPTION_KEYS },
  { id: 'dietary_style', step: 3, type: 'single-select', profileTarget: 'dietary_style', allowedOptionValues: values(DIETARY_STYLE_OPTS) },
  { id: 'allergies', step: 3, type: 'multi-select', profileTarget: 'allergies', allowedOptionValues: values(ALLERGY_OPTS) },
  { id: 'preferred_proteins', step: 3, type: 'multi-select', onboardingBlobPath: 'preferences.preferred_proteins', allowedOptionValues: values(PROTEIN_OPTS) },
  { id: 'cooking_confidence', step: 3, type: 'single-select', onboardingBlobPath: 'preferences.cooking_confidence', allowedOptionValues: values(COOKING_CONFIDENCE_OPTS) },
  { id: 'kitchen_access', step: 3, type: 'single-select', onboardingBlobPath: 'preferences.kitchen_access', allowedOptionValues: values(KITCHEN_OPTS) },
  { id: 'shopping_mode_preference', step: 4, type: 'single-select', profileTarget: 'shopping_mode_preference', allowedOptionValues: values(SHOPPING_OPTS) },
  { id: 'cooking_days', step: 4, type: 'multi-select', onboardingBlobPath: 'planning.cooking_days', allowedOptionValues: values(WEEKDAY_OPTS) },
  { id: 'prep_days', step: 4, type: 'multi-select', onboardingBlobPath: 'planning.prep_days', allowedOptionValues: values(WEEKDAY_OPTS) },
  { id: 'leftovers_tolerance', step: 4, type: 'single-select', onboardingBlobPath: 'planning.leftovers_tolerance', allowedOptionValues: values(LEFTOVERS_OPTS) },
  { id: 'budget_sensitivity', step: 4, type: 'single-select', onboardingBlobPath: 'planning.budget_sensitivity', allowedOptionValues: values(BUDGET_OPTS) },
];

export const KNOWN_QUESTION_IDS: readonly string[] = KNOWN_QUESTIONS.map((q) => q.id);
export const KNOWN_QUESTION_MAP: ReadonlyMap<string, KnownQuestionDef> = new Map(
  KNOWN_QUESTIONS.map((q) => [q.id, q]),
);

export const ALLOWED_PROFILE_TARGETS: readonly string[] = KNOWN_QUESTIONS
  .map((q) => q.profileTarget)
  .filter((t): t is string => Boolean(t));

export const ALLOWED_ONBOARDING_BLOB_PATHS: readonly string[] = KNOWN_QUESTIONS
  .map((q) => q.onboardingBlobPath)
  .filter((p): p is string => Boolean(p));

export function getKnownQuestion(id: string): KnownQuestionDef | undefined {
  return KNOWN_QUESTION_MAP.get(id);
}

/* ------------------------------------------------------------------ */
/*  Admin-configurable overlay (PRESENTATION only)                     */
/* ------------------------------------------------------------------ */

export const onboardingQuestionOverrideSchema = z
  .object({
    prompt: z.string().min(1).max(280).optional(),
    hint: z.string().max(280).optional(),
    required: z.boolean().optional(),
    visible: z.boolean().optional(),
    optionLabels: z.record(z.string().min(1), z.string().max(140)).optional(),
    optionOrder: z.array(z.string().min(1)).optional(),
  })
  .strip();

/* ------------------------------------------------------------------ */
/*  Page sequencing                                                     */
/* ------------------------------------------------------------------ */

export const MAX_ONBOARDING_PAGES = 60;

export const onboardingPageSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    helperText: z.string().max(280).optional(),
    questionIds: z.array(z.string().min(1)).min(1).max(4),
    visible: z.boolean().optional(),
    groupingReason: z.string().min(1).max(60).optional(),
  })
  .strip();

export type OnboardingPageConfig = z.infer<typeof onboardingPageSchema>;

export interface AllowedGrouping {
  reason: string;
  questionIds: string[];
}

export const ALLOWED_GROUPING_REASONS: readonly string[] = ['weekly_cooking_rhythm'];

export const ALLOWED_QUESTION_GROUPINGS: readonly AllowedGrouping[] = [
  { reason: 'weekly_cooking_rhythm', questionIds: ['cooking_days', 'prep_days'] },
];

export function isAllowedGrouping(questionIds: string[], reason?: string): boolean {
  if (questionIds.length <= 1) return true;
  const sorted = [...questionIds].sort();
  const key = sorted.join('|');
  return ALLOWED_QUESTION_GROUPINGS.some(
    (g) => g.reason === reason && [...g.questionIds].sort().join('|') === key,
  );
}

export const onboardingFlowConfigSchema = z
  .object({
    version: z.literal(1),
    questions: z.record(z.string(), onboardingQuestionOverrideSchema),
    pages: z.array(onboardingPageSchema).max(MAX_ONBOARDING_PAGES).optional(),
  })
  .strip();

export type OnboardingFlowConfig = z.infer<typeof onboardingFlowConfigSchema>;
export type OnboardingQuestionOverride = z.infer<typeof onboardingQuestionOverrideSchema>;

/* ------------------------------------------------------------------ */
/*  Durable DB record                                                   */
/* ------------------------------------------------------------------ */

export const onboardingFlowRecordSchema = z.object({
  flowKey: z.string().min(1),
  version: z.number().int().min(1),
  title: z.string().min(1).max(160),
  status: z.enum(ONBOARDING_FLOW_STATUSES),
  config: onboardingFlowConfigSchema,
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});
export type OnboardingFlowRecord = z.infer<typeof onboardingFlowRecordSchema>;

/* ------------------------------------------------------------------ */
/*  Default config                                                      */
/* ------------------------------------------------------------------ */

export const DEFAULT_PAGE_TITLES: Readonly<Record<string, string>> = {
  date_of_birth: 'Basic profile',
  height: 'Your height',
  weight: 'Your current weight',
  sex: 'Nutrition calculation setting',
  primary_goal: 'Nutrition intention',
  rhythm_template: 'Eating rhythm',
  first_meal_window: 'First meal timing',
  second_meal_window: 'Second meal timing',
  last_meal_window: 'Last meal timing',
  last_bite_window: 'Last-bite window',
  dining_out_frequency: 'Dining out',
  food_restrictions: 'Food preferences',
  disliked_foods: 'Foods to flag or avoid',
  grocery_cadence: 'Grocery rhythm',
  household_size: 'Household size',
  priority: 'What matters most right now?',
  support_level: 'How much support do you want?',
  intents: 'What do you want to use Fine Diet for?',
  body_fat_percent: 'Body fat %',
  goal_state: 'Your goal direction',
  meal_slots: 'What does a normal eating day look like?',
  eating_window: 'Eating window',
  skipped_meals: 'Meals you regularly skip',
  dietary_style: 'Dietary pattern',
  allergies: 'Allergies',
  preferred_proteins: 'Preferred proteins',
  cooking_confidence: 'Cooking confidence',
  kitchen_access: 'Kitchen access',
  shopping_mode_preference: 'Shopping mode',
  cooking_days: 'Cooking days',
  prep_days: 'Meal prep days',
  leftovers_tolerance: 'Leftovers',
  budget_sensitivity: 'Grocery budget',
};

export function deriveDefaultOnboardingPages(): OnboardingPageConfig[] {
  return APP_COPY_BASELINE_QUESTION_IDS.map((id) => ({
    id,
    title: DEFAULT_PAGE_TITLES[id] ?? id,
    questionIds: [id],
  }));
}

export const DEFAULT_ONBOARDING_PAGES: OnboardingPageConfig[] = deriveDefaultOnboardingPages();

export const DEFAULT_ONBOARDING_FLOW_CONFIG: OnboardingFlowConfig = {
  version: 1,
  questions: Object.fromEntries(
    APP_COPY_BASELINE_QUESTION_IDS.map((id) => [
      id,
      {
        required: id !== 'disliked_foods',
      },
    ]),
  ),
  pages: DEFAULT_ONBOARDING_PAGES,
};

export const DEFAULT_ONBOARDING_FLOW_TITLE = 'Welcome to Fine Diet';
