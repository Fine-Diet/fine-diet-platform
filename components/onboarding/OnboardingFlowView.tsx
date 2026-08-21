'use client';

/**
 * OnboardingFlowView — reusable live + preview onboarding UI.
 *
 * Renders the code-owned Initial Setup v2 page sequence and any valid admin
 * presentation overlay within the Initial Setup allowlist. The component owns
 * answer/page state only; live routes perform persistence through
 * `/api/onboarding/persist` → buildProfilePatch.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ACTIVITY_LEVEL_OPTS,
  ALLERGY_OPTS,
  BUDGET_OPTS,
  COOKING_CONFIDENCE_OPTS,
  DIETARY_STYLE_OPTS,
  DINING_OUT_OPTS,
  EATING_RHYTHM_OPTS,
  EATING_WINDOW_OPTS,
  FAVORITE_MEAL_OPTS,
  FIRST_MEAL_WINDOW_OPTS,
  FOOD_RESTRICTION_OPTS,
  GOAL_STATE_OPTS,
  GROCERY_CADENCE_OPTS,
  INITIAL_ANSWERS,
  INTENT_OPTS,
  KITCHEN_OPTS,
  LAST_BITE_WINDOW_OPTS,
  LAST_MEAL_WINDOW_OPTS,
  LEFTOVERS_OPTS,
  LOG_EMPHASIS_OPTS,
  LOGGING_PROMPT_OPTS,
  MEAL_SLOT_OPTION_KEYS,
  MEAL_SLOT_OPTION_LABELS,
  NUTRITION_TARGET_OPTS,
  PANTRY_FOUNDATION_OPTS,
  PRIMARY_GOAL_OPTS,
  PRIORITY_OPTS,
  PROTEIN_OPTS,
  PROGRAM_STARTING_POINT_OPTS,
  REVIEW_ACKNOWLEDGEMENT_OPTS,
  SECOND_MEAL_WINDOW_OPTS,
  SEX_OPTS,
  SHOPPING_OPTS,
  SUPPORT_OPTS,
  WEEKDAY_OPTS,
  type OnboardingAnswers,
} from '@/lib/onboarding/defaultOnboardingFlow';
import {
  convertHeightDisplayValue,
  convertWeightDisplayValue,
} from '@/lib/onboarding/buildProfilePatch';
import type { OnboardingFlowConfig, OnboardingPageConfig, OnboardingQuestionOverride } from '@/lib/onboarding/onboardingFlowTypes';
import { REQUIRED_APP_COPY_QUESTION_IDS } from '@/lib/onboarding/onboardingFlowTypes';
import { resolveOnboardingPages } from '@/lib/onboarding/onboardingPages';
import { isRequiredOnboardingAnswerPresent } from '@/lib/onboarding/requiredAnswersValidator';

export interface OnboardingFlowViewProps {
  initialAnswers?: OnboardingAnswers;
  initialStep?: number;
  flowConfig?: OnboardingFlowConfig;
  completed?: boolean;
  onMarkStarted?: () => void;
  onFinish?: (
    answers: OnboardingAnswers,
    opts: { skipRemaining: boolean },
  ) => Promise<void> | void;
  /** Debounced progress persistence hook (Package 2 resume). */
  onProgressChange?: (answers: OnboardingAnswers, step: number) => void;
  onReset?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Initial Setup v2 local visual tokens (prototype-matched)           */
/* ------------------------------------------------------------------ */

const V = {
  bg: '#2B261E',
  text: '#F5F1E8',
  muted: '#A8A294',
  border: 'rgba(245, 241, 232, 0.28)',
  surface: 'rgba(56, 50, 40, 0.92)',
  surfaceSoft: 'rgba(56, 50, 40, 0.65)',
  selectedBg: '#E8E2D6',
  selectedText: '#1E1B18',
  disabledBorder: 'rgba(245, 241, 232, 0.22)',
  disabledText: '#7A7468',
} as const;

const FIELD_CLASS =
  'w-full rounded-full bg-transparent px-5 py-3.5 text-base text-[#F5F1E8] placeholder-[#7A7468] border border-[rgba(245,241,232,0.28)] focus:border-[rgba(245,241,232,0.55)] focus:outline-none';

const UNIT_SELECT_CLASS =
  'rounded-full bg-transparent pl-2 pr-7 py-3.5 text-sm text-[#A8A294] border-0 focus:outline-none appearance-none cursor-pointer';

interface Opt { value: string; label: string }

const MEAL_SLOT_OPTS: Opt[] = MEAL_SLOT_OPTION_KEYS.map((k) => ({
  value: k,
  label: MEAL_SLOT_OPTION_LABELS[k],
}));

const DEFAULT_OPTIONS: Record<string, Opt[]> = {
  primary_goal: PRIMARY_GOAL_OPTS,
  priority: PRIORITY_OPTS,
  support_level: SUPPORT_OPTS,
  intents: INTENT_OPTS,
  sex: SEX_OPTS,
  goal_state: GOAL_STATE_OPTS,
  rhythm_template: EATING_RHYTHM_OPTS,
  first_meal_window: FIRST_MEAL_WINDOW_OPTS,
  second_meal_window: SECOND_MEAL_WINDOW_OPTS,
  last_meal_window: LAST_MEAL_WINDOW_OPTS,
  last_bite_window: LAST_BITE_WINDOW_OPTS,
  dining_out_frequency: DINING_OUT_OPTS,
  food_restrictions: FOOD_RESTRICTION_OPTS,
  grocery_cadence: GROCERY_CADENCE_OPTS,
  activity_level: ACTIVITY_LEVEL_OPTS,
  nutrition_target_preference: NUTRITION_TARGET_OPTS,
  log_emphasis_metrics: LOG_EMPHASIS_OPTS,
  pantry_foundation: PANTRY_FOUNDATION_OPTS,
  favorite_meal_preference: FAVORITE_MEAL_OPTS,
  logging_prompts: LOGGING_PROMPT_OPTS,
  program_starting_point: PROGRAM_STARTING_POINT_OPTS,
  review_acknowledgement: REVIEW_ACKNOWLEDGEMENT_OPTS,
  meal_slots: MEAL_SLOT_OPTS,
  eating_window: EATING_WINDOW_OPTS,
  skipped_meals: MEAL_SLOT_OPTS,
  dietary_style: DIETARY_STYLE_OPTS,
  allergies: ALLERGY_OPTS,
  preferred_proteins: PROTEIN_OPTS,
  cooking_confidence: COOKING_CONFIDENCE_OPTS,
  kitchen_access: KITCHEN_OPTS,
  shopping_mode_preference: SHOPPING_OPTS,
  cooking_days: WEEKDAY_OPTS,
  prep_days: WEEKDAY_OPTS,
  leftovers_tolerance: LEFTOVERS_OPTS,
  budget_sensitivity: BUDGET_OPTS,
};

const DEFAULT_REQUIRED = new Set<string>(REQUIRED_APP_COPY_QUESTION_IDS);

const ANSWER_CHECK: Record<string, (a: OnboardingAnswers) => boolean> = {
  date_of_birth: (a) => Boolean(a.date_of_birth),
  height: (a) => Boolean(a.height_value.trim()),
  weight: (a) => Boolean(a.weight_value.trim()),
  sex: (a) => Boolean(a.sex),
  primary_goal: (a) => Boolean(a.primary_goal),
  rhythm_template: (a) => Boolean(a.rhythm_template),
  first_meal_window: (a) => Boolean(a.first_meal_window),
  second_meal_window: (a) => Boolean(a.second_meal_window),
  last_meal_window: (a) => Boolean(a.last_meal_window),
  last_bite_window: (a) => Boolean(a.last_bite_window),
  dining_out_frequency: (a) => Boolean(a.dining_out_frequency),
  food_restrictions: (a) => a.food_restrictions.length > 0,
  disliked_foods: (a) => Boolean(a.disliked_foods.trim()),
  grocery_cadence: (a) => Boolean(a.grocery_cadence),
  household_size: (a) => Boolean(a.household_size.trim()),
  activity_level: (a) => Boolean(a.activity_level),
  nutrition_target_preference: (a) => Boolean(a.nutrition_target_preference),
  log_emphasis_metrics: (a) => a.log_emphasis_metrics.length > 0,
  pantry_foundation: (a) => Boolean(a.pantry_foundation),
  favorite_meal_preference: (a) => Boolean(a.favorite_meal_preference),
  logging_prompts: (a) => a.logging_prompts.length > 0,
  program_starting_point: (a) => Boolean(a.program_starting_point),
  review_acknowledgement: (a) => Boolean(a.review_acknowledgement),
  priority: (a) => Boolean(a.priority),
  support_level: (a) => Boolean(a.support_level),
  intents: (a) => a.intents.length > 0,
  body_fat_percent: (a) => Boolean(a.body_fat_percent.trim()),
  goal_state: (a) => Boolean(a.goal_state),
  meal_slots: (a) => a.meal_slots.length > 0,
  eating_window: (a) => Boolean(a.eating_window),
  skipped_meals: (a) => a.skipped_meals.length > 0,
  dietary_style: (a) => Boolean(a.dietary_style),
  allergies: (a) => a.allergies.length > 0,
  preferred_proteins: (a) => a.preferred_proteins.length > 0,
  cooking_confidence: (a) => Boolean(a.cooking_confidence),
  kitchen_access: (a) => Boolean(a.kitchen_access),
  shopping_mode_preference: (a) => Boolean(a.shopping_mode_preference),
  cooking_days: (a) => a.cooking_days.length > 0,
  prep_days: (a) => a.prep_days.length > 0,
  leftovers_tolerance: (a) => Boolean(a.leftovers_tolerance),
  budget_sensitivity: (a) => Boolean(a.budget_sensitivity),
};

const SINGLE_SELECT_KEYS: Record<string, keyof OnboardingAnswers> = {
  primary_goal: 'primary_goal',
  priority: 'priority',
  support_level: 'support_level',
  sex: 'sex',
  goal_state: 'goal_state',
  rhythm_template: 'rhythm_template',
  first_meal_window: 'first_meal_window',
  second_meal_window: 'second_meal_window',
  last_meal_window: 'last_meal_window',
  last_bite_window: 'last_bite_window',
  dining_out_frequency: 'dining_out_frequency',
  grocery_cadence: 'grocery_cadence',
  activity_level: 'activity_level',
  nutrition_target_preference: 'nutrition_target_preference',
  pantry_foundation: 'pantry_foundation',
  favorite_meal_preference: 'favorite_meal_preference',
  program_starting_point: 'program_starting_point',
  review_acknowledgement: 'review_acknowledgement',
  eating_window: 'eating_window',
  dietary_style: 'dietary_style',
  cooking_confidence: 'cooking_confidence',
  kitchen_access: 'kitchen_access',
  shopping_mode_preference: 'shopping_mode_preference',
  leftovers_tolerance: 'leftovers_tolerance',
  budget_sensitivity: 'budget_sensitivity',
};

const MULTI_SELECT_KEYS: Record<string, keyof OnboardingAnswers> = {
  intents: 'intents',
  food_restrictions: 'food_restrictions',
  log_emphasis_metrics: 'log_emphasis_metrics',
  logging_prompts: 'logging_prompts',
  meal_slots: 'meal_slots',
  skipped_meals: 'skipped_meals',
  allergies: 'allergies',
  preferred_proteins: 'preferred_proteins',
  cooking_days: 'cooking_days',
  prep_days: 'prep_days',
};

const TEXT_KEYS: Record<string, keyof OnboardingAnswers> = {
  disliked_foods: 'disliked_foods',
  body_fat_percent: 'body_fat_percent',
  household_size: 'household_size',
};

const DEFAULT_PROMPTS: Record<string, string> = {
  date_of_birth: 'Date of Birth',
  height: 'Height',
  weight: 'Current Weight',
  sex: 'Sex for calculations',
  primary_goal: 'What are you using Fine Diet to support right now?',
  rhythm_template: 'Choose a starting eating rhythm.',
  first_meal_window: 'What time do you usually have your first meal?',
  second_meal_window: 'What time do you usually have lunch or your second meal?',
  last_meal_window: 'What time do you usually have dinner or your last meal?',
  last_bite_window: 'Do you want a last-bite window?',
  dining_out_frequency: 'How often do you dine out?',
  activity_level: 'What is your general activity level?',
  nutrition_target_preference: 'Do you want Fine Diet to estimate your starting nutrition targets/ranges?',
  log_emphasis_metrics: 'What should your daily log emphasize?',
  food_restrictions: 'Any foods or ingredients your plans should account for?',
  disliked_foods: 'Any foods you want Fine Diet to flag or avoid when planning?',
  grocery_cadence: 'How do you prefer to shop for groceries?',
  household_size: 'What is your household size?',
  pantry_foundation: 'Want to start your pantry foundation?',
  favorite_meal_preference: 'Do you have meals you repeat often?',
  logging_prompts: 'What else do you want available in your daily log?',
  program_starting_point: 'Do you want a guided starting point?',
  review_acknowledgement: 'Review your setup.',
  priority: 'What matters most in how you get there?',
  support_level: 'How much support do you want?',
  intents: 'What do you want to use Fine Diet for?',
  body_fat_percent: 'Body fat %',
  goal_state: "What's your goal direction?",
  meal_slots: 'Which meals do you usually eat?',
  eating_window: 'Do you keep an eating window?',
  skipped_meals: 'Any meals you regularly skip?',
  dietary_style: 'How would you describe your diet?',
  allergies: 'Any allergies?',
  preferred_proteins: 'Preferred proteins?',
  cooking_confidence: 'How confident are you cooking?',
  kitchen_access: "What's your kitchen like?",
  shopping_mode_preference: 'How do you prefer to shop?',
  cooking_days: 'Which days can you cook?',
  prep_days: 'Which days can you meal prep?',
  leftovers_tolerance: 'How do you feel about leftovers?',
  budget_sensitivity: 'How budget-sensitive are your groceries?',
};

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm text-[#A8A294]">{children}</label>;
}

function CapsuleOption({
  label,
  selected,
  onClick,
  compact,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`
        rounded-full text-center transition-colors duration-200
        ${compact ? 'px-3 py-3 text-sm sm:text-base' : 'w-full px-6 py-4 text-base'}
        ${
          selected
            ? 'bg-[#E8E2D6] text-[#1E1B18] font-semibold'
            : 'bg-[rgba(56,50,40,0.92)] text-[#F5F1E8] font-normal'
        }
      `}
    >
      {label}
    </button>
  );
}

/** Canonical height_value stays total inches when unit is `in`. */
function inchesParts(totalInchesRaw: string): { feet: string; inches: string } {
  const n = Number.parseFloat(totalInchesRaw);
  if (!Number.isFinite(n) || n <= 0) return { feet: '', inches: '' };
  const total = Math.round(n);
  return { feet: String(Math.floor(total / 12)), inches: String(total % 12) };
}

function combineInches(feetRaw: string, inchesRaw: string): string {
  const feet = Number.parseInt(feetRaw, 10);
  const inches = Number.parseInt(inchesRaw || '0', 10);
  if (!Number.isFinite(feet) || feet < 0) return '';
  if (!Number.isFinite(inches) || inches < 0 || inches > 11) return '';
  return String(feet * 12 + inches);
}

/** ISO yyyy-mm-dd ↔ mm / dd / yyyy display helpers. */
function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${m} / ${d} / ${y}`;
}

function displayToIso(display: string): string | null {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const month = Number(mm);
  const day = Number(dd);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  if (digits.length <= 2) return mm;
  if (digits.length <= 4) return `${mm} / ${dd}`;
  return `${mm} / ${dd} / ${yyyy}`;
}

export function OnboardingFlowView({
  initialAnswers,
  initialStep,
  flowConfig,
  completed = false,
  onMarkStarted,
  onFinish,
  onProgressChange,
  onReset,
}: OnboardingFlowViewProps) {
  const seedAnswers = initialAnswers ?? INITIAL_ANSWERS;
  const pages = useMemo<OnboardingPageConfig[]>(() => resolveOnboardingPages(flowConfig), [flowConfig]);
  const totalPages = pages.length;

  const [answers, setAnswers] = useState<OnboardingAnswers>(seedAnswers);
  const [pageIndex, setPageIndex] = useState<number>(() =>
    Math.min(Math.max(initialStep ?? 0, 0), Math.max(totalPages - 1, 0)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobDisplay, setDobDisplay] = useState(() => isoToDisplay(seedAnswers.date_of_birth));
  const [heightFeet, setHeightFeet] = useState(() =>
    seedAnswers.height_unit === 'in' ? inchesParts(seedAnswers.height_value).feet : '',
  );
  const [heightInches, setHeightInches] = useState(() =>
    seedAnswers.height_unit === 'in' ? inchesParts(seedAnswers.height_value).inches : '',
  );
  // Gate debounced progress so initial mount cannot overwrite durable state
  // with INITIAL_ANSWERS / pre-hydration seed values.
  const allowProgressPersistRef = useRef(false);

  useEffect(() => {
    if (!allowProgressPersistRef.current) return;
    onProgressChange?.(answers, pageIndex);
  }, [answers, pageIndex, onProgressChange]);

  const overrideFor = useCallback(
    (qid: string): OnboardingQuestionOverride =>
      (flowConfig?.questions as Record<string, OnboardingQuestionOverride> | undefined)?.[qid] ?? {},
    [flowConfig],
  );

  const promptFor = useCallback(
    (qid: string) => overrideFor(qid).prompt || DEFAULT_PROMPTS[qid] || qid,
    [overrideFor],
  );

  const isRequired = useCallback(
    (qid: string) => overrideFor(qid).required ?? DEFAULT_REQUIRED.has(qid),
    [overrideFor],
  );

  const isVisible = useCallback((qid: string) => overrideFor(qid).visible ?? true, [overrideFor]);

  const optionsFor = useCallback(
    (qid: string): Opt[] => {
      const all = DEFAULT_OPTIONS[qid];
      if (!all) return [];
      const override = overrideFor(qid);
      const byValue = new Map(all.map((o) => [o.value, o]));
      const ordered: Opt[] = override.optionOrder && override.optionOrder.length > 0
        ? override.optionOrder.map((v) => byValue.get(v)).filter((o): o is Opt => Boolean(o))
        : all;
      const labels = override.optionLabels ?? {};
      return ordered.map((o) => ({ value: o.value, label: labels[o.value] ?? o.label }));
    },
    [overrideFor],
  );

  const setAnswer = useCallback((key: keyof OnboardingAnswers, value: unknown) => {
    allowProgressPersistRef.current = true;
    onMarkStarted?.();
    setAnswers((prev) => ({ ...prev, [key]: value } as OnboardingAnswers));
  }, [onMarkStarted]);

  const toggleAnswer = useCallback((key: keyof OnboardingAnswers, value: string) => {
    allowProgressPersistRef.current = true;
    onMarkStarted?.();
    setAnswers((prev) => {
      const arr = (prev[key] as unknown as string[]) ?? [];
      if (arr.includes(value)) {
        return { ...prev, [key]: arr.filter((v) => v !== value) } as OnboardingAnswers;
      }
      if (key === 'log_emphasis_metrics' && arr.length >= 3) {
        return prev;
      }
      return { ...prev, [key]: [...arr, value] } as OnboardingAnswers;
    });
  }, [onMarkStarted]);

  const finish = useCallback(
    async (skipRemaining = false) => {
      if (!onFinish) return;
      setSubmitting(true);
      setError(null);
      try {
        await onFinish(answers, { skipRemaining });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your onboarding.');
        setSubmitting(false);
      }
    },
    [answers, onFinish],
  );

  const currentPage = pages[pageIndex];

  const requiredIdSet = useMemo(
    () => new Set<string>(REQUIRED_APP_COPY_QUESTION_IDS),
    [],
  );

  const canContinue = useMemo(() => {
    const ids = currentPage?.questionIds ?? [];
    for (const qid of ids) {
      if (!isVisible(qid)) continue;
      if (!isRequired(qid)) continue;
      if (requiredIdSet.has(qid)) {
        if (!isRequiredOnboardingAnswerPresent(qid, answers)) return false;
        continue;
      }
      const check = ANSWER_CHECK[qid];
      if (check && !check(answers)) return false;
    }
    return true;
  }, [currentPage, answers, isVisible, isRequired, requiredIdSet]);

  const isLastPage = pageIndex === totalPages - 1;

  const goNext = useCallback(() => {
    allowProgressPersistRef.current = true;
    if (isLastPage) {
      void finish(false);
      return;
    }
    setPageIndex((p) => Math.min(p + 1, totalPages - 1));
  }, [isLastPage, finish, totalPages]);

  const goBack = useCallback(() => {
    allowProgressPersistRef.current = true;
    setPageIndex((p) => Math.max(p - 1, 0));
  }, []);

  const handleReset = useCallback(() => {
    setAnswers(seedAnswers);
    setDobDisplay(isoToDisplay(seedAnswers.date_of_birth));
    setHeightFeet(seedAnswers.height_unit === 'in' ? inchesParts(seedAnswers.height_value).feet : '');
    setHeightInches(seedAnswers.height_unit === 'in' ? inchesParts(seedAnswers.height_value).inches : '');
    setPageIndex(Math.min(Math.max(initialStep ?? 0, 0), Math.max(totalPages - 1, 0)));
    setError(null);
    setSubmitting(false);
    onReset?.();
  }, [seedAnswers, initialStep, totalPages, onReset]);

  const updateImperialHeight = useCallback(
    (feet: string, inches: string) => {
      setHeightFeet(feet);
      setHeightInches(inches);
      const combined = combineInches(feet, inches);
      setAnswer('height_value', combined);
      setAnswer('height_unit', 'in');
    },
    [setAnswer],
  );

  const renderBasicsFields = useCallback((): ReactNode => {
    const sexOpts = optionsFor('sex');
    const imperial = answers.height_unit === 'in';

    return (
      <div className="space-y-6">
        <div>
          <FieldLabel>{promptFor('date_of_birth')}</FieldLabel>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="mm / dd / yyyy"
            value={dobDisplay}
            aria-label="Date of Birth"
            onChange={(e) => {
              const next = formatDobInput(e.target.value);
              setDobDisplay(next);
              const iso = displayToIso(next);
              if (iso) setAnswer('date_of_birth', iso);
              else if (!next.trim()) setAnswer('date_of_birth', '');
            }}
            className={FIELD_CLASS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>{promptFor('height')}</FieldLabel>
            <div className="flex items-center rounded-full border border-[rgba(245,241,232,0.28)] px-3">
              {imperial ? (
                <div className="flex min-w-0 flex-1 items-center gap-1 py-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={8}
                    aria-label="Height feet"
                    value={heightFeet}
                    placeholder="5"
                    onChange={(e) => updateImperialHeight(e.target.value, heightInches)}
                    className="w-10 bg-transparent py-2.5 text-base text-[#F5F1E8] placeholder-[#7A7468] focus:outline-none"
                  />
                  <span className="text-sm text-[#A8A294]">ft</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={11}
                    aria-label="Height inches"
                    value={heightInches}
                    placeholder="10"
                    onChange={(e) => updateImperialHeight(heightFeet, e.target.value)}
                    className="w-10 bg-transparent py-2.5 text-base text-[#F5F1E8] placeholder-[#7A7468] focus:outline-none"
                  />
                  <span className="text-sm text-[#A8A294]">in</span>
                </div>
              ) : (
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label="Height"
                  value={answers.height_value}
                  placeholder="175"
                  onChange={(e) => setAnswer('height_value', e.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-3.5 pl-2 text-base text-[#F5F1E8] placeholder-[#7A7468] focus:outline-none"
                />
              )}
              <select
                aria-label="Height unit"
                value={answers.height_unit}
                onChange={(e) => {
                  const next = e.target.value as 'cm' | 'in';
                  const prev = answers.height_unit;
                  if (next === prev) return;
                  const converted = convertHeightDisplayValue(answers.height_value, prev, next);
                  setAnswer('height_value', converted);
                  setAnswer('height_unit', next);
                  if (next === 'in') {
                    const parts = inchesParts(converted);
                    setHeightFeet(parts.feet);
                    setHeightInches(parts.inches);
                  } else {
                    setHeightFeet('');
                    setHeightInches('');
                  }
                }}
                className={UNIT_SELECT_CLASS}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23A8A294' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.35rem center',
                }}
              >
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>{promptFor('weight')}</FieldLabel>
            <div className="flex items-center rounded-full border border-[rgba(245,241,232,0.28)] px-3">
              <input
                type="number"
                inputMode="decimal"
                aria-label="Current Weight"
                value={answers.weight_value}
                placeholder="150"
                onChange={(e) => setAnswer('weight_value', e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3.5 pl-2 text-base text-[#F5F1E8] placeholder-[#7A7468] focus:outline-none"
              />
              <select
                aria-label="Weight unit"
                value={answers.weight_unit}
                onChange={(e) => {
                  const next = e.target.value as 'kg' | 'lb';
                  const prev = answers.weight_unit;
                  if (next === prev) return;
                  const converted = convertWeightDisplayValue(answers.weight_value, prev, next);
                  setAnswer('weight_value', converted);
                  setAnswer('weight_unit', next);
                }}
                className={UNIT_SELECT_CLASS}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23A8A294' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.35rem center',
                }}
              >
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <FieldLabel>{promptFor('sex')}</FieldLabel>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Sex for calculations">
            {sexOpts.map((opt) => (
              <CapsuleOption
                key={opt.value}
                label={opt.label}
                compact
                selected={answers.sex === opt.value}
                onClick={() => setAnswer('sex', opt.value)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }, [
    answers.height_unit,
    answers.height_value,
    answers.weight_unit,
    answers.weight_value,
    answers.sex,
    dobDisplay,
    heightFeet,
    heightInches,
    optionsFor,
    promptFor,
    setAnswer,
    updateImperialHeight,
  ]);

  const renderQuestion = useCallback(
    (qid: string): ReactNode => {
      if (qid === 'date_of_birth' || qid === 'height' || qid === 'weight' || qid === 'sex') {
        // Basics page renders as a composed layout once; skip per-qid duplicates.
        return null;
      }

      const textKey = TEXT_KEYS[qid];
      if (textKey) {
        const isNumber = qid === 'household_size' || qid === 'body_fat_percent';
        return (
          <div className="mb-6">
            <FieldLabel>{promptFor(qid)}</FieldLabel>
            <input
              type={isNumber ? 'number' : 'text'}
              inputMode={isNumber ? 'numeric' : undefined}
              value={(answers[textKey] as string) ?? ''}
              onChange={(e) => setAnswer(textKey, e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        );
      }

      const singleKey = SINGLE_SELECT_KEYS[qid];
      if (singleKey) {
        return (
          <div className="space-y-3" role="group" aria-label={promptFor(qid)}>
            {optionsFor(qid).map((opt) => (
              <CapsuleOption
                key={opt.value}
                label={opt.label}
                selected={answers[singleKey] === opt.value}
                onClick={() => setAnswer(singleKey, opt.value)}
              />
            ))}
          </div>
        );
      }

      const multiKey = MULTI_SELECT_KEYS[qid];
      if (multiKey) {
        const values = (answers[multiKey] as unknown as string[]) ?? [];
        return (
          <div className="space-y-3" role="group" aria-label={promptFor(qid)}>
            {optionsFor(qid).map((opt) => (
              <CapsuleOption
                key={opt.value}
                label={opt.label}
                selected={values.includes(opt.value)}
                onClick={() => toggleAnswer(multiKey, opt.value)}
              />
            ))}
          </div>
        );
      }

      return null;
    },
    [answers, optionsFor, promptFor, setAnswer, toggleAnswer],
  );

  const pageQuestionIds = currentPage?.questionIds.filter((qid) => isVisible(qid)) ?? [];
  const isBasicsPage = pageQuestionIds.includes('date_of_birth')
    && pageQuestionIds.includes('height')
    && pageQuestionIds.includes('weight')
    && pageQuestionIds.includes('sex');

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ background: V.bg }}>
        <div className="mx-auto w-full max-w-[560px] rounded-[24px] p-8 text-center" style={{ background: V.selectedBg }}>
          <h2 className="text-2xl font-bold mb-2" style={{ color: V.selectedText }}>Preview complete</h2>
          <p className="text-sm mb-6" style={{ color: V.selectedText, opacity: 0.7 }}>
            This is the non-persistent completion state editors see after finishing the onboarding preview. No profile data was written.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: V.bg, color: V.text }}
          >
            Restart preview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: V.bg, color: V.text }}>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pb-36 pt-6 sm:pt-10">
        <div className="mb-8 flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={pageIndex === 0 || submitting}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center text-xl text-[#F5F1E8] disabled:opacity-30"
          >
            ←
          </button>
          <span className="text-sm text-[#A8A294]" aria-live="polite">
            {pageIndex + 1} of {totalPages}
          </span>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-[#F5F1E8] sm:text-[2rem]">
            {currentPage?.title ?? ''}
          </h1>
          {currentPage?.helperText && (
            <p className="mt-2 text-sm text-[#A8A294] sm:text-base">{currentPage.helperText}</p>
          )}
        </div>

        <div className="flex-1">
          {isBasicsPage ? renderBasicsFields() : null}
          {pageQuestionIds
            .filter((qid) => !(isBasicsPage && ['date_of_birth', 'height', 'weight', 'sex'].includes(qid)))
            .map((qid) => (
              <div key={qid}>{renderQuestion(qid)}</div>
            ))}
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10" style={{ background: `linear-gradient(transparent, ${V.bg} 28%)` }}>
        <div className="mx-auto w-full max-w-[560px] px-5 pb-6 pt-4">
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue || submitting}
            aria-disabled={!canContinue || submitting}
            className={`
              w-full rounded-full px-8 py-4 text-base font-semibold transition-colors
              ${
                canContinue && !submitting
                  ? 'bg-[#E8E2D6] text-[#1E1B18]'
                  : 'border border-[rgba(245,241,232,0.22)] bg-transparent text-[#7A7468] cursor-not-allowed'
              }
            `}
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void finish(true)}
              disabled={submitting}
              className="text-sm text-[#7A7468] hover:text-[#A8A294] disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlowView;
