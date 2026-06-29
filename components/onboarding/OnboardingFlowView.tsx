'use client';

/**
 * OnboardingFlowView — the reusable Journal onboarding UI.
 *
 * Renders the exact same warm, full-screen, five-step flow that the live
 * `/app/onboarding` route uses, but with persistence factored out so the same
 * component can drive the admin-only preview without mutating `people.metadata`.
 *
 * Contract:
 *   - The view owns answer + step state. It never touches the network.
 *   - `onMarkStarted` is fired once on the first answer interaction. Live
 *     routes use it to POST `onboarding_started_at`; preview routes leave it
 *     undefined (no-op).
 *   - `onFinish(answers, { skipRemaining })` is called on last-step Next or
 *     "Skip for now". Live routes POST the profile patch + redirect. Preview
 *     routes set a local `completed` flag and re-render with `completed`.
 *     May throw / reject to surface an error inline.
 *   - When `completed` is true the view renders a non-persistent
 *     preview-complete screen (only used by the preview route).
 *
 * The live route remains responsible for the pre-render profile fetch and the
 * completed-user redirect to `/app`; this component starts at "ready".
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
import { MEAL_SLOT_DEFAULT_LABELS } from '@/lib/plans/types';

export interface OnboardingFlowViewProps {
  initialAnswers?: OnboardingAnswers;
  initialStep?: number;
  /** When true, render a non-persistent preview-complete screen. */
  completed?: boolean;
  /** Live-only: fire-and-forget POST of onboarding_started_at. */
  onMarkStarted?: () => void;
  /**
   * Called when the user finishes (last-step Next or "Skip for now").
   * Live: POST /api/journal/profile + redirect. Preview: set completed.
   * May return a Promise; while pending the view shows a saving state and
   * disables nav. Throw to surface an error message inline.
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
            This is the non-persistent completion state editors see after finishing the
            onboarding preview. No profile data was written.
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
              {MEAL_SLOT_OPTION_KEYS.map((key) => (
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
              {MEAL_SLOT_OPTION_KEYS.map((key) => (
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
                disabled={submitting}
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
              disabled={submitting}
              className="text-sm font-medium text-[#4F4234]/50 hover:text-[#4F4234] disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue || submitting}
            className="rounded-full bg-[#001010] px-8 py-3 text-base font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlowView;
