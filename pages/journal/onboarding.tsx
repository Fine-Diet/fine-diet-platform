'use client';

/**
 * /app/onboarding — Pre-app onboarding journey (Packet D)
 *
 * Collects foundational baseline data (intent, body, eating pattern,
 * preferences/constraints, planning/grocery) and persists it through the
 * existing guarded profile API (`POST /api/journal/profile`) into
 * `people.metadata`. It reuses the assessment journey's UI design
 * (OptionButton + ProgressBar + warm full-screen layout) but intentionally
 * does NOT touch the assessment scoring backend (`/api/assessments/*`,
 * `calculateScoring`, submissions). Onboarding answers are foundational
 * profile/schedule/preference data, not a scored assessment.
 *
 * Persistence:
 *   - Canonical metadata fields that the rest of the app already reads are
 *     written directly (date_of_birth, sex, height_cm, weight_kg,
 *     primary_goal, dietary_style, allergies, eating_window,
 *     dining_out_frequency, shopping_mode_preference, household_size,
 *     meal_schedule).
 *   - Everything else lives under a single `onboarding` metadata blob.
 *   - Completion is tracked via `onboarding_completed_at`; returning completed
 *     users are routed to the app home instead of repeating the flow.
 *
 * Guardrails honored: age is never stored (only date_of_birth); no medical
 * diagnoses are collected; optional fields never block completion; existing
 * profile behavior is preserved (additive metadata only).
 *
 * Reachable at /app/onboarding (canonical) and /journal/onboarding via the
 * /app re-export. Sits inside the entitled app area, so it runs after a user
 * has journal access (post-purchase), before they dive into the app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { OptionButton } from '@/components/assessments/OptionButton';
import { ProgressBar } from '@/components/assessments/ProgressBar';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { defaultMealSchedule } from '@/lib/plans/scheduleResolver';
import {
  MEAL_SLOT_KEYS,
  MEAL_SLOT_DEFAULT_LABELS,
  type MealSchedule,
  type MealSlotKey,
} from '@/lib/plans/types';

/* ------------------------------------------------------------------ */
/*  Option sets                                                         */
/* ------------------------------------------------------------------ */

interface Opt {
  value: string;
  label: string;
}

const PRIMARY_GOAL_OPTS: Opt[] = [
  { value: 'feel_better', label: 'Feel better day to day' },
  { value: 'lose_weight', label: 'Lose weight / body fat' },
  { value: 'build_muscle', label: 'Build muscle / strength' },
  { value: 'improve_energy', label: 'Improve energy & focus' },
  { value: 'digestive_health', label: 'Improve digestion' },
  { value: 'longevity', label: 'Long-term health & longevity' },
];

const PRIORITY_OPTS: Opt[] = [
  { value: 'sustainability', label: 'A sustainable, lasting change' },
  { value: 'speed', label: 'Faster, noticeable results' },
  { value: 'simplicity', label: 'Keeping it simple' },
  { value: 'guidance', label: 'Clear guidance & structure' },
];

const SUPPORT_OPTS: Opt[] = [
  { value: 'self_guided', label: 'Self-guided — just give me the tools' },
  { value: 'light_structure', label: 'Light structure & nudges' },
  { value: 'high_touch', label: 'High-touch — guide me closely' },
];

const INTENT_OPTS: Opt[] = [
  { value: 'journal', label: 'Track meals in the Journal' },
  { value: 'baseline', label: 'Follow the Baseline program' },
  { value: 'care', label: 'Integrative Care support' },
  { value: 'planning', label: 'Plan meals & groceries' },
];

const SEX_OPTS: Opt[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

const GOAL_STATE_OPTS: Opt[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain weight' },
  { value: 'recomp', label: 'Recomposition (lose fat, gain muscle)' },
];

const EATING_WINDOW_OPTS: Opt[] = [
  { value: 'none', label: 'No set window — I eat across the day' },
  { value: '12h', label: '12-hour window' },
  { value: '10h', label: '10-hour window' },
  { value: '8h', label: '8-hour window (16:8)' },
];

const DINING_OUT_OPTS: Opt[] = [
  { value: 'never', label: 'Almost never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'weekly', label: 'About weekly' },
  { value: 'multiple_per_week', label: 'A few times a week' },
  { value: 'daily', label: 'Most days' },
];

const DIETARY_STYLE_OPTS: Opt[] = [
  { value: 'omnivore', label: 'Omnivore — I eat most things' },
  { value: 'flexitarian', label: 'Flexitarian / mostly plants' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'paleo', label: 'Paleo' },
  { value: 'keto', label: 'Keto / low-carb' },
];

const ALLERGY_OPTS: Opt[] = [
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

const PROTEIN_OPTS: Opt[] = [
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

const COOKING_CONFIDENCE_OPTS: Opt[] = [
  { value: 'beginner', label: 'Beginner — keep it very simple' },
  { value: 'comfortable', label: 'Comfortable with basics' },
  { value: 'confident', label: 'Confident cook' },
  { value: 'chef', label: 'Love to cook / advanced' },
];

const KITCHEN_OPTS: Opt[] = [
  { value: 'full', label: 'Full kitchen' },
  { value: 'basic', label: 'Basic setup' },
  { value: 'minimal', label: 'Minimal (microwave/dorm)' },
  { value: 'none', label: 'No real kitchen right now' },
];

const SHOPPING_OPTS: Opt[] = [
  { value: 'in_store', label: 'Shop in-store' },
  { value: 'instacart', label: 'Delivery (Instacart, etc.)' },
  { value: 'mixed', label: 'A mix of both' },
];

const LEFTOVERS_OPTS: Opt[] = [
  { value: 'love', label: 'Love leftovers — cook once, eat twice' },
  { value: 'ok', label: 'Leftovers are fine' },
  { value: 'avoid', label: 'Prefer fresh each time' },
];

const BUDGET_OPTS: Opt[] = [
  { value: 'tight', label: 'Tight — budget matters a lot' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'flexible', label: 'Flexible' },
];

const WEEKDAY_OPTS: Opt[] = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

/* ------------------------------------------------------------------ */
/*  Answer state                                                        */
/* ------------------------------------------------------------------ */

interface OnboardingAnswers {
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

const INITIAL_ANSWERS: OnboardingAnswers = {
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

const STEP_TITLES = [
  'What brings you here?',
  'A few baseline details',
  'How you eat',
  'Preferences & constraints',
  'Planning & groceries',
] as const;

const TOTAL_STEPS = STEP_TITLES.length;

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                                 */
/* ------------------------------------------------------------------ */

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toHeightCm(value: string, unit: 'cm' | 'in'): number | null {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return unit === 'cm' ? Math.round(n) : Math.round(n * 2.54);
}

function toWeightKg(value: string, unit: 'kg' | 'lb'): number | null {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return unit === 'kg' ? Math.round(n * 10) / 10 : Math.round(n * 0.45359237 * 10) / 10;
}

function buildMealSchedule(selected: MealSlotKey[]): MealSchedule {
  const schedule = defaultMealSchedule();
  const enabledSet = new Set(selected.length > 0 ? selected : ['breakfast', 'lunch', 'dinner']);
  for (const key of MEAL_SLOT_KEYS) {
    schedule.slots[key] = { ...schedule.slots[key], enabled: enabledSet.has(key) };
  }
  schedule.updated_at = new Date().toISOString();
  return schedule;
}

/** Map onboarding answers to a profile-API patch (canonical fields + blob). */
function buildProfilePatch(a: OnboardingAnswers): Record<string, unknown> {
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

/* ------------------------------------------------------------------ */
/*  Small presentational helpers (assessment aesthetic)                 */
/* ------------------------------------------------------------------ */

function Question({
  prompt,
  hint,
  children,
}: {
  prompt: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-[#4F4234] mb-1">{prompt}</h3>
      {hint && <p className="text-sm text-[#4F4234]/70 mb-3">{hint}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

const TEXT_INPUT_CLASS =
  'w-full rounded-2xl bg-[#fffff6] px-5 py-3 text-base text-[#4F4234] placeholder-[#4F4234]/40 border border-transparent focus:border-[#6AB1AE] focus:outline-none';

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingAnswers>(INITIAL_ANSWERS);
  const [step, setStep] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'completed'>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedRef = useRef(false);
  const startedRef = useRef(false);

  // Returning completed users skip onboarding. Pre-access users are already
  // gated to /journal-waitlist by middleware before reaching this page.
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/journal/profile', { credentials: 'include' });
        if (res.ok) {
          const data = (await res.json()) as { profile?: Record<string, unknown> };
          if (data.profile?.onboarding_completed_at) {
            setLoadState('completed');
            void router.replace(APP_ROUTES.home);
            return;
          }
        }
      } catch {
        // Non-fatal: fall through and let the user onboard.
      }
      setLoadState('ready');
    })();
  }, [router]);

  // Mark onboarding_started_at once (fire-and-forget; never blocks the UI).
  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetch('/api/journal/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ onboarding_started_at: new Date().toISOString() }),
    }).catch(() => {});
  }, []);

  const set = useCallback(<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    markStarted();
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, [markStarted]);

  const toggleIn = useCallback(
    <K extends keyof OnboardingAnswers>(key: K, value: string) => {
      markStarted();
      setAnswers((prev) => {
        const arr = prev[key] as unknown as string[];
        const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
        return { ...prev, [key]: next as unknown as OnboardingAnswers[K] };
      });
    },
    [markStarted],
  );

  const finish = useCallback(
    async (skipRemaining = false) => {
      setSaving(true);
      setError(null);
      try {
        const patch = buildProfilePatch(answers);
        if (skipRemaining) {
          (patch as Record<string, unknown>).onboarding = {
            ...(patch.onboarding as Record<string, unknown>),
            skipped_remaining: true,
          };
        }
        const res = await fetch('/api/journal/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Could not save your onboarding.');
        }
        void router.replace(`${APP_ROUTES.home}?onboarded=1`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your onboarding.');
        setSaving(false);
      }
    },
    [answers, router],
  );

  const canContinue = useMemo(() => {
    // Only the first step gently requires a primary goal; everything else is
    // optional so app access is never blocked on skipped fields.
    if (step === 0) return Boolean(answers.primary_goal);
    return true;
  }, [step, answers.primary_goal]);

  const isLastStep = step === TOTAL_STEPS - 1;

  const goNext = useCallback(() => {
    if (isLastStep) {
      void finish(false);
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [isLastStep, finish]);

  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  if (loadState === 'loading' || loadState === 'completed') {
    return (
      <div className="min-h-screen bg-[#CECAB9] flex items-center justify-center">
        <p className="text-[#4F4234] text-base">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#CECAB9] flex flex-col">
      <div className="mx-auto w-full max-w-[560px] px-5 pt-10 pb-32">
        <ProgressBar currentIndex={step} totalQuestions={TOTAL_STEPS} />

        <h2 className="mt-6 mb-6 text-2xl font-bold text-[#4F4234]">{STEP_TITLES[step]}</h2>

        {step === 0 && (
          <>
            <Question prompt="What's your primary goal?" hint="Pick the one that matters most right now.">
              {PRIMARY_GOAL_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.primary_goal === opt.value}
                  onClick={() => set('primary_goal', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="What matters most in how you get there?">
              {PRIORITY_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.priority === opt.value}
                  onClick={() => set('priority', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="How much support do you want?">
              {SUPPORT_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.support_level === opt.value}
                  onClick={() => set('support_level', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="What do you want to use Fine Diet for?" hint="Select all that apply.">
              {INTENT_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.intents.includes(opt.value)}
                  onClick={() => toggleIn('intents', opt.value)}
                />
              ))}
            </Question>
          </>
        )}

        {step === 1 && (
          <>
            <Question prompt="Date of birth" hint="We use this to personalize targets. We never store your age directly.">
              <input
                type="date"
                value={answers.date_of_birth}
                onChange={(e) => set('date_of_birth', e.target.value)}
                className={TEXT_INPUT_CLASS}
              />
            </Question>
            <Question prompt="Sex" hint="Used for nutrition baselines; optional.">
              {SEX_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.sex === opt.value}
                  onClick={() => set('sex', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="Height" hint="Optional.">
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={answers.height_value}
                  onChange={(e) => set('height_value', e.target.value)}
                  placeholder={answers.height_unit === 'cm' ? '175' : '69'}
                  className={TEXT_INPUT_CLASS}
                />
                <select
                  value={answers.height_unit}
                  onChange={(e) => set('height_unit', e.target.value as 'cm' | 'in')}
                  className="rounded-2xl bg-[#fffff6] px-4 py-3 text-base text-[#4F4234] border border-transparent focus:border-[#6AB1AE] focus:outline-none"
                >
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>
            </Question>
            <Question prompt="Weight" hint="Optional.">
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={answers.weight_value}
                  onChange={(e) => set('weight_value', e.target.value)}
                  placeholder={answers.weight_unit === 'kg' ? '70' : '154'}
                  className={TEXT_INPUT_CLASS}
                />
                <select
                  value={answers.weight_unit}
                  onChange={(e) => set('weight_unit', e.target.value as 'kg' | 'lb')}
                  className="rounded-2xl bg-[#fffff6] px-4 py-3 text-base text-[#4F4234] border border-transparent focus:border-[#6AB1AE] focus:outline-none"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
            </Question>
            <Question prompt="Body fat %" hint="Optional — leave blank if unknown.">
              <input
                type="number"
                inputMode="decimal"
                value={answers.body_fat_percent}
                onChange={(e) => set('body_fat_percent', e.target.value)}
                placeholder="e.g. 22"
                className={TEXT_INPUT_CLASS}
              />
            </Question>
            <Question prompt="What's your goal direction?" hint="Optional.">
              {GOAL_STATE_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.goal_state === opt.value}
                  onClick={() => set('goal_state', opt.value)}
                />
              ))}
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <Question prompt="Which meals do you usually eat?" hint="This seeds your meal schedule. You can fine-tune it later in Profile.">
              {MEAL_SLOT_KEYS.map((key) => (
                <OptionButton
                  key={key}
                  optionId={key}
                  label={MEAL_SLOT_DEFAULT_LABELS[key]}
                  isSelected={answers.meal_slots.includes(key)}
                  onClick={() => toggleIn('meal_slots', key)}
                />
              ))}
            </Question>
            <Question prompt="Do you keep an eating window?" hint="Optional.">
              {EATING_WINDOW_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.eating_window === opt.value}
                  onClick={() => set('eating_window', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="Any meals you regularly skip?" hint="Optional — select all that apply.">
              {MEAL_SLOT_KEYS.map((key) => (
                <OptionButton
                  key={key}
                  optionId={key}
                  label={MEAL_SLOT_DEFAULT_LABELS[key]}
                  isSelected={answers.skipped_meals.includes(key)}
                  onClick={() => toggleIn('skipped_meals', key)}
                />
              ))}
            </Question>
            <Question prompt="How often do you eat out or order in?">
              {DINING_OUT_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.dining_out_frequency === opt.value}
                  onClick={() => set('dining_out_frequency', opt.value)}
                />
              ))}
            </Question>
          </>
        )}

        {step === 3 && (
          <>
            <Question prompt="How would you describe your diet?">
              {DIETARY_STYLE_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.dietary_style === opt.value}
                  onClick={() => set('dietary_style', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="Any allergies?" hint="Optional — select all that apply.">
              {ALLERGY_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.allergies.includes(opt.value)}
                  onClick={() => toggleIn('allergies', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="Foods you'd rather avoid?" hint="Optional — free text, comma separated.">
              <input
                type="text"
                value={answers.disliked_foods}
                onChange={(e) => set('disliked_foods', e.target.value)}
                placeholder="e.g. cilantro, liver, very spicy food"
                className={TEXT_INPUT_CLASS}
              />
            </Question>
            <Question prompt="Preferred proteins?" hint="Optional — select all that apply.">
              {PROTEIN_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.preferred_proteins.includes(opt.value)}
                  onClick={() => toggleIn('preferred_proteins', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="How confident are you cooking?">
              {COOKING_CONFIDENCE_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.cooking_confidence === opt.value}
                  onClick={() => set('cooking_confidence', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="What's your kitchen like?">
              {KITCHEN_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.kitchen_access === opt.value}
                  onClick={() => set('kitchen_access', opt.value)}
                />
              ))}
            </Question>
          </>
        )}

        {step === 4 && (
          <>
            <Question prompt="How many people are you cooking for?" hint="Optional.">
              <input
                type="number"
                inputMode="numeric"
                value={answers.household_size}
                onChange={(e) => set('household_size', e.target.value)}
                placeholder="e.g. 2"
                className={TEXT_INPUT_CLASS}
              />
            </Question>
            <Question prompt="How do you prefer to shop?">
              {SHOPPING_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.shopping_mode_preference === opt.value}
                  onClick={() => set('shopping_mode_preference', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="Which days can you cook?" hint="Optional — select all that apply.">
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleIn('cooking_days', opt.value)}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      answers.cooking_days.includes(opt.value)
                        ? 'bg-[#6AB1AE] text-white font-semibold'
                        : 'bg-[#fffff6] text-[#4F4234]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Question>
            <Question prompt="Which days can you meal prep?" hint="Optional — select all that apply.">
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleIn('prep_days', opt.value)}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      answers.prep_days.includes(opt.value)
                        ? 'bg-[#6AB1AE] text-white font-semibold'
                        : 'bg-[#fffff6] text-[#4F4234]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Question>
            <Question prompt="How do you feel about leftovers?">
              {LEFTOVERS_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.leftovers_tolerance === opt.value}
                  onClick={() => set('leftovers_tolerance', opt.value)}
                />
              ))}
            </Question>
            <Question prompt="How budget-sensitive are your groceries?">
              {BUDGET_OPTS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  optionId={opt.value}
                  label={opt.label}
                  isSelected={answers.budget_sensitivity === opt.value}
                  onClick={() => set('budget_sensitivity', opt.value)}
                />
              ))}
            </Question>
          </>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer nav */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#4F4234]/10 bg-[#CECAB9]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-4">
            {step > 0 ? (
              <button
                type="button"
                onClick={goBack}
                disabled={saving}
                className="text-sm font-medium text-[#4F4234]/70 hover:text-[#4F4234] disabled:opacity-50"
              >
                ← Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => void finish(true)}
              disabled={saving}
              className="text-sm font-medium text-[#4F4234]/50 hover:text-[#4F4234] disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue || saving}
            className="rounded-full bg-[#001010] px-8 py-3 text-base font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
