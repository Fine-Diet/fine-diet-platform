'use client';

/**
 * OnboardingFlowView — the reusable Journal onboarding UI.
 *
 * Renders the same warm, full-screen, five-step flow for both the live
 * `/app/onboarding` route and the admin-only preview. Persistence is factored
 * out so the same component can drive a non-mutating preview.
 *
 * Authoring overlay (v1):
 *   - An optional `flowConfig` (OnboardingFlowConfig) overrides PRESENTATION
 *     only — step titles, per-question prompt/hint/required/visible, and
 *     option labels + ordering. The set of questions, their profile targets,
 *     and allowed option values are CODE-OWNED in onboardingFlowTypes.ts; the
 *     overlay can never introduce new questions or write new metadata keys.
 *   - When `flowConfig` is omitted (or a question/option has no override), the
 *     view renders the code-owned defaults exactly as it did before
 *     authoring existed.
 *
 * Contract:
 *   - The view owns answer + step state. It never touches the network.
 *   - `onMarkStarted` fires once on the first answer interaction. Live routes
 *     POST `onboarding_started_at`; preview routes leave it undefined.
 *   - `onFinish(answers, { skipRemaining })` is called on last-step Next or
 *     "Skip for now". Live routes POST the profile patch + redirect. Preview
 *     routes set a local `completed` flag and re-render with `completed`.
 *   - When `completed` is true the view renders a non-persistent
 *     preview-complete screen (preview only).
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
  EATING_WINDOW_OPTS,
  GOAL_STATE_OPTS,
  INITIAL_ANSWERS,
  INTENT_OPTS,
  KITCHEN_OPTS,
  LEFTOVERS_OPTS,
  MEAL_SLOT_OPTION_KEYS,
  PRIMARY_GOAL_OPTS,
  PRIORITY_OPTS,
  PROTEIN_OPTS,
  SEX_OPTS,
  SHOPPING_OPTS,
  STEP_TITLES,
  SUPPORT_OPTS,
  TOTAL_STEPS,
  WEEKDAY_OPTS,
  type OnboardingAnswers,
} from '@/lib/onboarding/defaultOnboardingFlow';
import type { OnboardingFlowConfig, OnboardingQuestionOverride } from '@/lib/onboarding/onboardingFlowTypes';
import { MEAL_SLOT_DEFAULT_LABELS } from '@/lib/plans/types';

export interface OnboardingFlowViewProps {
  initialAnswers?: OnboardingAnswers;
  initialStep?: number;
  /** Admin-authorable presentation overlay. Omitted → code-owned defaults. */
  flowConfig?: OnboardingFlowConfig;
  /** When true, render a non-persistent preview-complete screen. */
  completed?: boolean;
  /** Live-only: fire-and-forget POST of onboarding_started_at. */
  onMarkStarted?: () => void;
  /**
   * Called when the user finishes (last-step Next or "Skip for now").
   * May return a Promise; while pending the view shows a saving state and
   * disables nav. Throw to surface an error inline.
   */
  onFinish?: (
    answers: OnboardingAnswers,
    opts: { skipRemaining: boolean },
  ) => Promise<void> | void;
  /** Called when the user clicks "Restart preview" on the complete screen. */
  onReset?: () => void;
}

const TEXT_INPUT_CLASS =
  'w-full rounded-2xl bg-[#fffff6] px-5 py-3 text-base text-[#4F4234] placeholder-[#4F4234]/40 border border-transparent focus:border-[#6AB1AE] focus:outline-none';

interface Opt { value: string; label: string }

const MEAL_SLOT_OPTS: Opt[] = MEAL_SLOT_OPTION_KEYS.map((k) => ({
  value: k,
  label: MEAL_SLOT_DEFAULT_LABELS[k],
}));

/** Default options per known question id. Free-input questions have none. */
const DEFAULT_OPTIONS: Record<string, Opt[]> = {
  primary_goal: PRIMARY_GOAL_OPTS,
  priority: PRIORITY_OPTS,
  support_level: SUPPORT_OPTS,
  intents: INTENT_OPTS,
  sex: SEX_OPTS,
  goal_state: GOAL_STATE_OPTS,
  meal_slots: MEAL_SLOT_OPTS,
  eating_window: EATING_WINDOW_OPTS,
  skipped_meals: MEAL_SLOT_OPTS,
  dining_out_frequency: DINING_OUT_OPTS,
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

/** Code-owned default required set (preserves pre-authoring behavior). */
const DEFAULT_REQUIRED = new Set<string>(['primary_goal']);

/** Per-question "is answered" predicates for required gating. */
const ANSWER_CHECK: Record<string, (a: OnboardingAnswers) => boolean> = {
  primary_goal: (a) => Boolean(a.primary_goal),
  priority: (a) => Boolean(a.priority),
  support_level: (a) => Boolean(a.support_level),
  intents: (a) => a.intents.length > 0,
  date_of_birth: (a) => Boolean(a.date_of_birth),
  sex: (a) => Boolean(a.sex),
  height: (a) => Boolean(a.height_value.trim()),
  weight: (a) => Boolean(a.weight_value.trim()),
  body_fat_percent: (a) => Boolean(a.body_fat_percent.trim()),
  goal_state: (a) => Boolean(a.goal_state),
  meal_slots: (a) => a.meal_slots.length > 0,
  eating_window: (a) => Boolean(a.eating_window),
  skipped_meals: (a) => a.skipped_meals.length > 0,
  dining_out_frequency: (a) => Boolean(a.dining_out_frequency),
  dietary_style: (a) => Boolean(a.dietary_style),
  allergies: (a) => a.allergies.length > 0,
  disliked_foods: (a) => Boolean(a.disliked_foods.trim()),
  preferred_proteins: (a) => a.preferred_proteins.length > 0,
  cooking_confidence: (a) => Boolean(a.cooking_confidence),
  kitchen_access: (a) => Boolean(a.kitchen_access),
  household_size: (a) => Boolean(a.household_size.trim()),
  shopping_mode_preference: (a) => Boolean(a.shopping_mode_preference),
  cooking_days: (a) => a.cooking_days.length > 0,
  prep_days: (a) => a.prep_days.length > 0,
  leftovers_tolerance: (a) => Boolean(a.leftovers_tolerance),
  budget_sensitivity: (a) => Boolean(a.budget_sensitivity),
};

/** Known questions grouped by step (mirrors onboardingFlowTypes catalog). */
const QUESTIONS_BY_STEP: Record<number, string[]> = {
  0: ['primary_goal', 'priority', 'support_level', 'intents'],
  1: ['date_of_birth', 'sex', 'height', 'weight', 'body_fat_percent', 'goal_state'],
  2: ['meal_slots', 'eating_window', 'skipped_meals', 'dining_out_frequency'],
  3: ['dietary_style', 'allergies', 'disliked_foods', 'preferred_proteins', 'cooking_confidence', 'kitchen_access'],
  4: ['household_size', 'shopping_mode_preference', 'cooking_days', 'prep_days', 'leftovers_tolerance', 'budget_sensitivity'],
};

function Question({
  prompt,
  hint,
  children,
}: {
  prompt: string;
  hint?: string;
  children: ReactNode;
}) {
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
  const seedStep = Math.min(Math.max(initialStep ?? 0, 0), TOTAL_STEPS - 1);

  const [answers, setAnswers] = useState<OnboardingAnswers>(seedAnswers);
  const [step, setStep] = useState<number>(seedStep);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- overlay helpers (presentation only) ---- */
  const overrideFor = useCallback(
    (qid: string): OnboardingQuestionOverride =>
      (flowConfig?.questions as Record<string, OnboardingQuestionOverride> | undefined)?.[qid] ?? {},
    [flowConfig],
  );

  const stepTitle = useCallback(
    (index: number) => flowConfig?.steps?.[index]?.title || STEP_TITLES[index],
    [flowConfig],
  );

  const promptFor = useCallback(
    (qid: string, fallback: string) => overrideFor(qid).prompt || fallback,
    [overrideFor],
  );
  const hintFor = useCallback(
    (qid: string, fallback?: string) => {
      const h = overrideFor(qid).hint;
      return h === undefined ? fallback : h;
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

  /* ---- answer state ---- */
  const set = useCallback(
    <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
      onMarkStarted?.();
      setAnswers((prev) => ({ ...prev, [key]: value }));
    },
    [onMarkStarted],
  );

  const toggleIn = useCallback(
    <K extends keyof OnboardingAnswers>(key: K, value: string) => {
      onMarkStarted?.();
      setAnswers((prev) => {
        const arr = prev[key] as unknown as string[];
        const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
        return { ...prev, [key]: next as unknown as OnboardingAnswers[K] };
      });
    },
    [onMarkStarted],
  );

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

  const canContinue = useMemo(() => {
    const ids = QUESTIONS_BY_STEP[step] ?? [];
    for (const qid of ids) {
      if (!isVisible(qid)) continue;
      if (!isRequired(qid)) continue;
      const check = ANSWER_CHECK[qid];
      if (check && !check(answers)) return false;
    }
    return true;
  }, [step, answers, isVisible, isRequired]);

  const isLastStep = step === TOTAL_STEPS - 1;

  const goNext = useCallback(() => {
    if (isLastStep) {
      void finish(false);
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [isLastStep, finish]);

  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const handleReset = useCallback(() => {
    setAnswers(seedAnswers);
    setStep(seedStep);
    setError(null);
    setSubmitting(false);
    onReset?.();
  }, [seedAnswers, seedStep, onReset]);

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
            This is the non-persistent completion state editors see after finishing the onboarding preview. No profile
            data was written.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full bg-[#001010] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Restart preview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#CECAB9] flex flex-col">
      <div className="mx-auto w-full max-w-[560px] px-5 pt-10 pb-32">
        <ProgressBar currentIndex={step} totalQuestions={TOTAL_STEPS} />

        <h2 className="mt-6 mb-6 text-2xl font-bold text-[#4F4234]">{stepTitle(step)}</h2>

        {step === 0 && (
          <>
            {isVisible('primary_goal') && (
              <Question prompt={promptFor('primary_goal', "What's your primary goal?")} hint={hintFor('primary_goal', 'Pick the one that matters most right now.')}>
                {optionsFor('primary_goal').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.primary_goal === opt.value} onClick={() => set('primary_goal', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('priority') && (
              <Question prompt={promptFor('priority', 'What matters most in how you get there?')}>
                {optionsFor('priority').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.priority === opt.value} onClick={() => set('priority', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('support_level') && (
              <Question prompt={promptFor('support_level', 'How much support do you want?')}>
                {optionsFor('support_level').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.support_level === opt.value} onClick={() => set('support_level', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('intents') && (
              <Question prompt={promptFor('intents', 'What do you want to use Fine Diet for?')} hint={hintFor('intents', 'Select all that apply.')}>
                {optionsFor('intents').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.intents.includes(opt.value)} onClick={() => toggleIn('intents', opt.value)} />
                ))}
              </Question>
            )}
          </>
        )}

        {step === 1 && (
          <>
            {isVisible('date_of_birth') && (
              <Question prompt={promptFor('date_of_birth', 'Date of birth')} hint={hintFor('date_of_birth', 'We use this to personalize targets. We never store your age directly.')}>
                <input type="date" value={answers.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} className={TEXT_INPUT_CLASS} />
              </Question>
            )}
            {isVisible('sex') && (
              <Question prompt={promptFor('sex', 'Sex')} hint={hintFor('sex', 'Used for nutrition baselines; optional.')}>
                {optionsFor('sex').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.sex === opt.value} onClick={() => set('sex', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('height') && (
              <Question prompt={promptFor('height', 'Height')} hint={hintFor('height', 'Optional.')}>
                <div className="flex gap-2">
                  <input type="number" inputMode="decimal" value={answers.height_value} onChange={(e) => set('height_value', e.target.value)} placeholder={answers.height_unit === 'cm' ? '175' : '69'} className={TEXT_INPUT_CLASS} />
                  <select value={answers.height_unit} onChange={(e) => set('height_unit', e.target.value as 'cm' | 'in')} className="rounded-2xl bg-[#fffff6] px-4 py-3 text-base text-[#4F4234] border border-transparent focus:border-[#6AB1AE] focus:outline-none">
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </select>
                </div>
              </Question>
            )}
            {isVisible('weight') && (
              <Question prompt={promptFor('weight', 'Weight')} hint={hintFor('weight', 'Optional.')}>
                <div className="flex gap-2">
                  <input type="number" inputMode="decimal" value={answers.weight_value} onChange={(e) => set('weight_value', e.target.value)} placeholder={answers.weight_unit === 'kg' ? '70' : '154'} className={TEXT_INPUT_CLASS} />
                  <select value={answers.weight_unit} onChange={(e) => set('weight_unit', e.target.value as 'kg' | 'lb')} className="rounded-2xl bg-[#fffff6] px-4 py-3 text-base text-[#4F4234] border border-transparent focus:border-[#6AB1AE] focus:outline-none">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
              </Question>
            )}
            {isVisible('body_fat_percent') && (
              <Question prompt={promptFor('body_fat_percent', 'Body fat %')} hint={hintFor('body_fat_percent', 'Optional — leave blank if unknown.')}>
                <input type="number" inputMode="decimal" value={answers.body_fat_percent} onChange={(e) => set('body_fat_percent', e.target.value)} placeholder="e.g. 22" className={TEXT_INPUT_CLASS} />
              </Question>
            )}
            {isVisible('goal_state') && (
              <Question prompt={promptFor('goal_state', "What's your goal direction?")} hint={hintFor('goal_state', 'Optional.')}>
                {optionsFor('goal_state').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.goal_state === opt.value} onClick={() => set('goal_state', opt.value)} />
                ))}
              </Question>
            )}
          </>
        )}

        {step === 2 && (
          <>
            {isVisible('meal_slots') && (
              <Question prompt={promptFor('meal_slots', 'Which meals do you usually eat?')} hint={hintFor('meal_slots', 'This seeds your meal schedule. You can fine-tune it later in Profile.')}>
                {optionsFor('meal_slots').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.meal_slots.includes(opt.value as OnboardingAnswers['meal_slots'][number])} onClick={() => toggleIn('meal_slots', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('eating_window') && (
              <Question prompt={promptFor('eating_window', 'Do you keep an eating window?')} hint={hintFor('eating_window', 'Optional.')}>
                {optionsFor('eating_window').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.eating_window === opt.value} onClick={() => set('eating_window', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('skipped_meals') && (
              <Question prompt={promptFor('skipped_meals', 'Any meals you regularly skip?')} hint={hintFor('skipped_meals', 'Optional — select all that apply.')}>
                {optionsFor('skipped_meals').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.skipped_meals.includes(opt.value as OnboardingAnswers['skipped_meals'][number])} onClick={() => toggleIn('skipped_meals', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('dining_out_frequency') && (
              <Question prompt={promptFor('dining_out_frequency', 'How often do you eat out or order in?')}>
                {optionsFor('dining_out_frequency').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.dining_out_frequency === opt.value} onClick={() => set('dining_out_frequency', opt.value)} />
                ))}
              </Question>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {isVisible('dietary_style') && (
              <Question prompt={promptFor('dietary_style', 'How would you describe your diet?')}>
                {optionsFor('dietary_style').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.dietary_style === opt.value} onClick={() => set('dietary_style', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('allergies') && (
              <Question prompt={promptFor('allergies', 'Any allergies?')} hint={hintFor('allergies', 'Optional — select all that apply.')}>
                {optionsFor('allergies').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.allergies.includes(opt.value)} onClick={() => toggleIn('allergies', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('disliked_foods') && (
              <Question prompt={promptFor('disliked_foods', "Foods you'd rather avoid?")} hint={hintFor('disliked_foods', 'Optional — free text, comma separated.')}>
                <input type="text" value={answers.disliked_foods} onChange={(e) => set('disliked_foods', e.target.value)} placeholder="e.g. cilantro, liver, very spicy food" className={TEXT_INPUT_CLASS} />
              </Question>
            )}
            {isVisible('preferred_proteins') && (
              <Question prompt={promptFor('preferred_proteins', 'Preferred proteins?')} hint={hintFor('preferred_proteins', 'Optional — select all that apply.')}>
                {optionsFor('preferred_proteins').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.preferred_proteins.includes(opt.value)} onClick={() => toggleIn('preferred_proteins', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('cooking_confidence') && (
              <Question prompt={promptFor('cooking_confidence', 'How confident are you cooking?')}>
                {optionsFor('cooking_confidence').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.cooking_confidence === opt.value} onClick={() => set('cooking_confidence', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('kitchen_access') && (
              <Question prompt={promptFor('kitchen_access', "What's your kitchen like?")}>
                {optionsFor('kitchen_access').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.kitchen_access === opt.value} onClick={() => set('kitchen_access', opt.value)} />
                ))}
              </Question>
            )}
          </>
        )}

        {step === 4 && (
          <>
            {isVisible('household_size') && (
              <Question prompt={promptFor('household_size', 'How many people are you cooking for?')} hint={hintFor('household_size', 'Optional.')}>
                <input type="number" inputMode="numeric" value={answers.household_size} onChange={(e) => set('household_size', e.target.value)} placeholder="e.g. 2" className={TEXT_INPUT_CLASS} />
              </Question>
            )}
            {isVisible('shopping_mode_preference') && (
              <Question prompt={promptFor('shopping_mode_preference', 'How do you prefer to shop?')}>
                {optionsFor('shopping_mode_preference').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.shopping_mode_preference === opt.value} onClick={() => set('shopping_mode_preference', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('cooking_days') && (
              <Question prompt={promptFor('cooking_days', 'Which days can you cook?')} hint={hintFor('cooking_days', 'Optional — select all that apply.')}>
                <div className="flex flex-wrap gap-2">
                  {optionsFor('cooking_days').map((opt) => (
                    <button key={opt.value} type="button" onClick={() => toggleIn('cooking_days', opt.value)} className={`rounded-full px-4 py-2 text-sm transition-colors ${answers.cooking_days.includes(opt.value) ? 'bg-[#6AB1AE] text-white font-semibold' : 'bg-[#fffff6] text-[#4F4234]'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Question>
            )}
            {isVisible('prep_days') && (
              <Question prompt={promptFor('prep_days', 'Which days can you meal prep?')} hint={hintFor('prep_days', 'Optional — select all that apply.')}>
                <div className="flex flex-wrap gap-2">
                  {optionsFor('prep_days').map((opt) => (
                    <button key={opt.value} type="button" onClick={() => toggleIn('prep_days', opt.value)} className={`rounded-full px-4 py-2 text-sm transition-colors ${answers.prep_days.includes(opt.value) ? 'bg-[#6AB1AE] text-white font-semibold' : 'bg-[#fffff6] text-[#4F4234]'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Question>
            )}
            {isVisible('leftovers_tolerance') && (
              <Question prompt={promptFor('leftovers_tolerance', 'How do you feel about leftovers?')}>
                {optionsFor('leftovers_tolerance').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.leftovers_tolerance === opt.value} onClick={() => set('leftovers_tolerance', opt.value)} />
                ))}
              </Question>
            )}
            {isVisible('budget_sensitivity') && (
              <Question prompt={promptFor('budget_sensitivity', 'How budget-sensitive are your groceries?')}>
                {optionsFor('budget_sensitivity').map((opt) => (
                  <OptionButton key={opt.value} optionId={opt.value} label={opt.label} isSelected={answers.budget_sensitivity === opt.value} onClick={() => set('budget_sensitivity', opt.value)} />
                ))}
              </Question>
            )}
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
              <button type="button" onClick={goBack} disabled={submitting} className="text-sm font-medium text-[#4F4234]/70 hover:text-[#4F4234] disabled:opacity-50">
                ← Back
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => void finish(true)} disabled={submitting} className="text-sm font-medium text-[#4F4234]/50 hover:text-[#4F4234] disabled:opacity-50">
              Skip for now
            </button>
          </div>

          <button type="button" onClick={goNext} disabled={!canContinue || submitting} className="rounded-full bg-[#001010] px-8 py-3 text-base font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlowView;
