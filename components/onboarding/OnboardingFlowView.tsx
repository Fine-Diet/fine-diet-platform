'use client';

/**
 * OnboardingFlowView — reusable live + preview onboarding UI.
 *
 * Renders the code-owned App Copy baseline page sequence and any valid admin
 * presentation overlay. The component owns answer/page state only; live routes
 * perform persistence through buildProfilePatch.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { OptionButton } from '@/components/assessments/OptionButton';
import { ProgressBar } from '@/components/assessments/ProgressBar';
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
  INITIAL_ANSWERS,
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
  type OnboardingAnswers,
} from '@/lib/onboarding/defaultOnboardingFlow';
import type { OnboardingFlowConfig, OnboardingPageConfig, OnboardingQuestionOverride } from '@/lib/onboarding/onboardingFlowTypes';
import { resolveOnboardingPages } from '@/lib/onboarding/onboardingPages';
import { MEAL_SLOT_DEFAULT_LABELS } from '@/lib/plans/types';

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
  onReset?: () => void;
}

const TEXT_INPUT_CLASS =
  'w-full rounded-2xl bg-[#fffff6] px-5 py-3 text-base text-[#4F4234] placeholder-[#4F4234]/40 border border-transparent focus:border-[#6AB1AE] focus:outline-none';

interface Opt { value: string; label: string }

const MEAL_SLOT_OPTS: Opt[] = MEAL_SLOT_OPTION_KEYS.map((k) => ({
  value: k,
  label: MEAL_SLOT_DEFAULT_LABELS[k],
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

const DEFAULT_REQUIRED = new Set<string>([
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
  'grocery_cadence',
  'household_size',
]);

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
  date_of_birth: "What's your date of birth?",
  height: "What's your height?",
  weight: "What's your current weight?",
  sex: 'What sex should we use for nutrition calculations?',
  primary_goal: 'What are you using Fine Diet to support right now?',
  rhythm_template: 'Choose a starting eating rhythm.',
  first_meal_window: 'What time do you usually have your first meal?',
  second_meal_window: 'What time do you usually have lunch or your second meal?',
  last_meal_window: 'What time do you usually have dinner or your last meal?',
  last_bite_window: 'Do you want a last-bite window?',
  dining_out_frequency: 'How often do you dine out?',
  food_restrictions: 'Any foods or ingredients your plans should account for?',
  disliked_foods: 'Any foods you want Fine Diet to flag or avoid when planning?',
  grocery_cadence: 'How do you prefer to shop for groceries?',
  household_size: 'What is your household size?',
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

const DEFAULT_HINTS: Record<string, string> = {
  date_of_birth: 'We store your date of birth, not your age.',
  height: 'Used to set baseline nutrition ranges.',
  weight: 'Used to set baseline nutrition ranges. You can update this later.',
  food_restrictions: 'Select all that apply.',
  disliked_foods: 'Optional — open text.',
};

function Question({ prompt, hint, children }: { prompt: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-[#4F4234] mb-1">{prompt}</h3>
      {hint && <p className="text-sm text-[#4F4234]/70 mb-3">{hint}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

export function OnboardingFlowView({
  initialAnswers,
  initialStep,
  flowConfig,
  completed = false,
  onMarkStarted,
  onFinish,
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

  const overrideFor = useCallback(
    (qid: string): OnboardingQuestionOverride =>
      (flowConfig?.questions as Record<string, OnboardingQuestionOverride> | undefined)?.[qid] ?? {},
    [flowConfig],
  );

  const promptFor = useCallback(
    (qid: string) => overrideFor(qid).prompt || DEFAULT_PROMPTS[qid] || qid,
    [overrideFor],
  );

  const hintFor = useCallback(
    (qid: string) => {
      const h = overrideFor(qid).hint;
      return h === undefined ? DEFAULT_HINTS[qid] : h;
    },
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
    onMarkStarted?.();
    setAnswers((prev) => ({ ...prev, [key]: value } as OnboardingAnswers));
  }, [onMarkStarted]);

  const toggleAnswer = useCallback((key: keyof OnboardingAnswers, value: string) => {
    onMarkStarted?.();
    setAnswers((prev) => {
      const arr = (prev[key] as unknown as string[]) ?? [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [key]: next } as OnboardingAnswers;
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

  const canContinue = useMemo(() => {
    const ids = currentPage?.questionIds ?? [];
    for (const qid of ids) {
      if (!isVisible(qid)) continue;
      if (!isRequired(qid)) continue;
      const check = ANSWER_CHECK[qid];
      if (check && !check(answers)) return false;
    }
    return true;
  }, [currentPage, answers, isVisible, isRequired]);

  const isLastPage = pageIndex === totalPages - 1;

  const goNext = useCallback(() => {
    if (isLastPage) {
      void finish(false);
      return;
    }
    setPageIndex((p) => Math.min(p + 1, totalPages - 1));
  }, [isLastPage, finish, totalPages]);

  const goBack = useCallback(() => setPageIndex((p) => Math.max(p - 1, 0)), []);

  const handleReset = useCallback(() => {
    setAnswers(seedAnswers);
    setPageIndex(Math.min(Math.max(initialStep ?? 0, 0), Math.max(totalPages - 1, 0)));
    setError(null);
    setSubmitting(false);
    onReset?.();
  }, [seedAnswers, initialStep, totalPages, onReset]);

  const renderQuestion = useCallback(
    (qid: string): ReactNode => {
      if (qid === 'date_of_birth') {
        return (
          <Question prompt={promptFor(qid)} hint={hintFor(qid)}>
            <input type="date" value={answers.date_of_birth} onChange={(e) => setAnswer('date_of_birth', e.target.value)} className={TEXT_INPUT_CLASS} />
          </Question>
        );
      }

      if (qid === 'height') {
        return (
          <Question prompt={promptFor(qid)} hint={hintFor(qid)}>
            <div className="flex gap-2">
              <input type="number" inputMode="decimal" value={answers.height_value} onChange={(e) => setAnswer('height_value', e.target.value)} placeholder={answers.height_unit === 'cm' ? '175' : '69'} className={TEXT_INPUT_CLASS} />
              <select value={answers.height_unit} onChange={(e) => setAnswer('height_unit', e.target.value as 'cm' | 'in')} className="rounded-2xl bg-[#fffff6] px-4 py-3 text-base text-[#4F4234] border border-transparent focus:border-[#6AB1AE] focus:outline-none">
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
          </Question>
        );
      }

      if (qid === 'weight') {
        return (
          <Question prompt={promptFor(qid)} hint={hintFor(qid)}>
            <div className="flex gap-2">
              <input type="number" inputMode="decimal" value={answers.weight_value} onChange={(e) => setAnswer('weight_value', e.target.value)} placeholder={answers.weight_unit === 'kg' ? '70' : '154'} className={TEXT_INPUT_CLASS} />
              <select value={answers.weight_unit} onChange={(e) => setAnswer('weight_unit', e.target.value as 'kg' | 'lb')} className="rounded-2xl bg-[#fffff6] px-4 py-3 text-base text-[#4F4234] border border-transparent focus:border-[#6AB1AE] focus:outline-none">
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>
          </Question>
        );
      }

      const textKey = TEXT_KEYS[qid];
      if (textKey) {
        const isNumber = qid === 'household_size' || qid === 'body_fat_percent';
        return (
          <Question prompt={promptFor(qid)} hint={hintFor(qid)}>
            <input
              type={isNumber ? 'number' : 'text'}
              inputMode={isNumber ? 'numeric' : undefined}
              value={(answers[textKey] as string) ?? ''}
              onChange={(e) => setAnswer(textKey, e.target.value)}
              placeholder={qid === 'household_size' ? 'e.g. 2' : qid === 'disliked_foods' ? 'e.g. cilantro, liver, very spicy food' : undefined}
              className={TEXT_INPUT_CLASS}
            />
          </Question>
        );
      }

      const singleKey = SINGLE_SELECT_KEYS[qid];
      if (singleKey) {
        return (
          <Question prompt={promptFor(qid)} hint={hintFor(qid)}>
            {optionsFor(qid).map((opt) => (
              <OptionButton
                key={opt.value}
                optionId={opt.value}
                label={opt.label}
                isSelected={answers[singleKey] === opt.value}
                onClick={() => setAnswer(singleKey, opt.value)}
              />
            ))}
          </Question>
        );
      }

      const multiKey = MULTI_SELECT_KEYS[qid];
      if (multiKey) {
        const values = (answers[multiKey] as unknown as string[]) ?? [];
        return (
          <Question prompt={promptFor(qid)} hint={hintFor(qid) ?? 'Select all that apply.'}>
            {optionsFor(qid).map((opt) => (
              <OptionButton
                key={opt.value}
                optionId={opt.value}
                label={opt.label}
                isSelected={values.includes(opt.value)}
                onClick={() => toggleAnswer(multiKey, opt.value)}
              />
            ))}
          </Question>
        );
      }

      return null;
    },
    [answers, optionsFor, promptFor, hintFor, setAnswer, toggleAnswer],
  );

  if (completed) {
    return (
      <div className="min-h-screen bg-[#CECAB9] flex items-center justify-center px-5">
        <div className="mx-auto w-full max-w-[560px] rounded-[24px] bg-[#fffff6] p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#6AB1AE] text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[#4F4234] mb-2">Preview complete</h2>
          <p className="text-sm text-[#4F4234]/70 mb-6">
            This is the non-persistent completion state editors see after finishing the onboarding preview. No profile data was written.
          </p>
          <button type="button" onClick={handleReset} className="rounded-full bg-[#001010] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90">
            Restart preview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#CECAB9] flex flex-col">
      <div className="mx-auto w-full max-w-[560px] px-5 pt-10 pb-32">
        <ProgressBar currentIndex={pageIndex} totalQuestions={totalPages} />

        <h2 className="mt-6 mb-2 text-2xl font-bold text-[#4F4234]">{currentPage?.title ?? ''}</h2>
        {currentPage?.helperText && <p className="mb-4 text-sm text-[#4F4234]/70">{currentPage.helperText}</p>}

        {currentPage?.questionIds
          .filter((qid) => isVisible(qid))
          .map((qid) => <div key={qid}>{renderQuestion(qid)}</div>)}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#4F4234]/10 bg-[#CECAB9]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-4">
            {pageIndex > 0 ? (
              <button type="button" onClick={goBack} disabled={submitting} className="text-sm font-medium text-[#4F4234]/70 hover:text-[#4F4234] disabled:opacity-50">
                ← Back
              </button>
            ) : <span />}
            <button type="button" onClick={() => void finish(true)} disabled={submitting} className="text-sm font-medium text-[#4F4234]/50 hover:text-[#4F4234] disabled:opacity-50">
              Skip for now
            </button>
          </div>

          <button type="button" onClick={goNext} disabled={!canContinue || submitting} className="rounded-full bg-[#001010] px-8 py-3 text-base font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? 'Saving…' : isLastPage ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlowView;
