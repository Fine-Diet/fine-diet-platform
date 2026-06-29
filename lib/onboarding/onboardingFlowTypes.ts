/**
 * Onboarding authoring — durable types + code-owned safety allowlists.
 *
 * SAFETY BOUNDARY (do not blur this):
 *   - The set of known questions, their `profileTarget` (canonical
 *     `people.metadata` key) and `onboardingBlobPath` (dot path under the
 *     `onboarding` blob), their type, and their allowed option values are
 *     CODE-OWNED here. Admin config can override PRESENTATION only
 *     (prompts, hints, option labels + ordering, required/visible toggles).
 *   - Admin config can NEVER introduce a new question id, a new option
 *     value, or a new profile target. `buildProfilePatch` is unchanged and
 *     remains the single writer of `people.metadata`.
 *   - Durable completion state stays `people.metadata.onboarding_completed_at`.
 *
 * These schemas are SSR/client-safe (zod only, no server-only imports).
 */

import { z } from 'zod';
import {
  ALLERGY_OPTS,
  BUDGET_OPTS,
  COOKING_CONFIDENCE_OPTS,
  DIETARY_STYLE_OPTS,
  DINING_OUT_OPTS,
  EATING_WINDOW_OPTS,
  GOAL_STATE_OPTS,
  INTENT_OPTS,
  KITCHEN_OPTS,
  LEFTOVERS_OPTS,
  MEAL_SLOT_OPTION_KEYS,
  PRIMARY_GOAL_OPTS,
  PRIORITY_OPTS,
  PROTEIN_OPTS,
  SEX_OPTS,
  SHOPPING_OPTS,
  SUPPORT_OPTS,
  TOTAL_STEPS,
  WEEKDAY_OPTS,
  STEP_TITLES,
} from './defaultOnboardingFlow';

/* ------------------------------------------------------------------ */
/*  Status + flow key                                                   */
/* ------------------------------------------------------------------ */

export const ONBOARDING_FLOW_STATUSES = ['draft', 'published', 'archived'] as const;
export type OnboardingFlowStatus = (typeof ONBOARDING_FLOW_STATUSES)[number];

/** v1 ships a single flow rendered at /app/onboarding. */
export const DEFAULT_ONBOARDING_FLOW_KEY = 'default';

/* ------------------------------------------------------------------ */
/*  Known question catalog (CODE-OWNED — not admin-configurable)        */
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
  /** Stable id used as the config key. Never reassign. */
  id: string;
  /** Step index (0-based) this question renders on. */
  step: number;
  type: OnboardingQuestionType;
  /** Canonical `people.metadata` key written by buildProfilePatch, if any. */
  profileTarget?: string;
  /** Dot path under the `onboarding` metadata blob, if any. */
  onboardingBlobPath?: string;
  /** Allowed option values for select types. Empty/absent for free inputs. */
  allowedOptionValues?: readonly string[];
}

function values(opts: readonly { value: string }[]): readonly string[] {
  return opts.map((o) => o.value);
}

/**
 * The complete, code-owned catalog of questions the onboarding flow may
 * render. The live view and the admin authoring UI both key off these ids.
 * Adding a question here is a code change; admin config can never add one.
 */
export const KNOWN_QUESTIONS: readonly KnownQuestionDef[] = [
  // Step 0 — intent
  { id: 'primary_goal', step: 0, type: 'single-select', profileTarget: 'primary_goal', onboardingBlobPath: 'intent.primary_goal', allowedOptionValues: values(PRIMARY_GOAL_OPTS) },
  { id: 'priority', step: 0, type: 'single-select', onboardingBlobPath: 'intent.priority', allowedOptionValues: values(PRIORITY_OPTS) },
  { id: 'support_level', step: 0, type: 'single-select', onboardingBlobPath: 'intent.support_level', allowedOptionValues: values(SUPPORT_OPTS) },
  { id: 'intents', step: 0, type: 'multi-select', onboardingBlobPath: 'intent.intents', allowedOptionValues: values(INTENT_OPTS) },

  // Step 1 — body baseline
  { id: 'date_of_birth', step: 1, type: 'date', profileTarget: 'date_of_birth' },
  { id: 'sex', step: 1, type: 'single-select', profileTarget: 'sex', allowedOptionValues: values(SEX_OPTS) },
  { id: 'height', step: 1, type: 'height', profileTarget: 'height_cm' },
  { id: 'weight', step: 1, type: 'weight', profileTarget: 'weight_kg' },
  { id: 'body_fat_percent', step: 1, type: 'number', onboardingBlobPath: 'body.body_fat_percent' },
  { id: 'goal_state', step: 1, type: 'single-select', onboardingBlobPath: 'body.goal_state', allowedOptionValues: values(GOAL_STATE_OPTS) },

  // Step 2 — eating pattern
  { id: 'meal_slots', step: 2, type: 'multi-select', profileTarget: 'meal_schedule', allowedOptionValues: MEAL_SLOT_OPTION_KEYS },
  { id: 'eating_window', step: 2, type: 'single-select', profileTarget: 'eating_window', allowedOptionValues: values(EATING_WINDOW_OPTS) },
  { id: 'skipped_meals', step: 2, type: 'multi-select', onboardingBlobPath: 'eating.skipped_meals', allowedOptionValues: MEAL_SLOT_OPTION_KEYS },
  { id: 'dining_out_frequency', step: 2, type: 'single-select', profileTarget: 'dining_out_frequency', allowedOptionValues: values(DINING_OUT_OPTS) },

  // Step 3 — preferences / constraints
  { id: 'dietary_style', step: 3, type: 'single-select', profileTarget: 'dietary_style', allowedOptionValues: values(DIETARY_STYLE_OPTS) },
  { id: 'allergies', step: 3, type: 'multi-select', profileTarget: 'allergies', allowedOptionValues: values(ALLERGY_OPTS) },
  { id: 'disliked_foods', step: 3, type: 'text', onboardingBlobPath: 'preferences.disliked_foods' },
  { id: 'preferred_proteins', step: 3, type: 'multi-select', onboardingBlobPath: 'preferences.preferred_proteins', allowedOptionValues: values(PROTEIN_OPTS) },
  { id: 'cooking_confidence', step: 3, type: 'single-select', onboardingBlobPath: 'preferences.cooking_confidence', allowedOptionValues: values(COOKING_CONFIDENCE_OPTS) },
  { id: 'kitchen_access', step: 3, type: 'single-select', onboardingBlobPath: 'preferences.kitchen_access', allowedOptionValues: values(KITCHEN_OPTS) },

  // Step 4 — planning / grocery
  { id: 'household_size', step: 4, type: 'number', profileTarget: 'household_size' },
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

/** Canonical `people.metadata` keys a known question may write. */
export const ALLOWED_PROFILE_TARGETS: readonly string[] = KNOWN_QUESTIONS
  .map((q) => q.profileTarget)
  .filter((t): t is string => Boolean(t));

/** Dot paths under the `onboarding` metadata blob a known question may write. */
export const ALLOWED_ONBOARDING_BLOB_PATHS: readonly string[] = KNOWN_QUESTIONS
  .map((q) => q.onboardingBlobPath)
  .filter((p): p is string => Boolean(p));

export function getKnownQuestion(id: string): KnownQuestionDef | undefined {
  return KNOWN_QUESTION_MAP.get(id);
}

/* ------------------------------------------------------------------ */
/*  Admin-configurable overlay (PRESENTATION only)                     */
/* ------------------------------------------------------------------ */

/**
 * Per-question presentation override. `optionLabels` / `optionOrder` are
 * validated against the per-question `allowedOptionValues` in
 * `onboardingFlowValidation.ts` (zod can only check structure here).
 *
 * Note: we intentionally use `z.record(z.string(), ...)` for the questions map
 * (see onboardingFlowConfigSchema) rather than `z.record(z.enum(...), ...)`.
 * zod treats an enum-keyed record as requiring EVERY enum member to be
 * present as a key, which would force every known question to be configured.
 * Instead, key membership (known question ids only) is enforced in
 * `validateOnboardingFlowConfig`'s semantic layer.
 */
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

/**
 * The full admin-authorable config blob. Stored as `config` JSONB.
 *   - `version` is locked to 1 for v1.
 *   - `steps` must be exactly TOTAL_STEPS (5) entries, indexed by step.
 *   - `questions` is a string-keyed map; unknown question ids are rejected by
 *     `validateOnboardingFlowConfig` (semantic layer).
 * Unknown top-level keys are stripped.
 */
export const onboardingFlowConfigSchema = z
  .object({
    version: z.literal(1),
    steps: z
      .array(z.object({ title: z.string().min(1).max(120) }))
      .length(TOTAL_STEPS),
    questions: z.record(z.string(), onboardingQuestionOverrideSchema),
  })
  .strip();

export type OnboardingFlowConfig = z.infer<typeof onboardingFlowConfigSchema>;
export type OnboardingQuestionOverride = z.infer<typeof onboardingQuestionOverrideSchema>;

/* ------------------------------------------------------------------ */
/*  Durable DB record (app-layer camelCase shape)                      */
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
/*  Default config (mirrors the code-owned default flow)               */
/* ------------------------------------------------------------------ */

/**
 * The default config — used when no DB row exists (live fallback) and as the
 * seed for a new draft. Mirrors the code-owned step titles and carries no
 * per-question overrides, so the live view renders exactly as it did before
 * authoring existed.
 */
export const DEFAULT_ONBOARDING_FLOW_CONFIG: OnboardingFlowConfig = {
  version: 1,
  steps: STEP_TITLES.map((title) => ({ title })),
  questions: {},
};

export const DEFAULT_ONBOARDING_FLOW_TITLE = 'Welcome to Fine Diet';
