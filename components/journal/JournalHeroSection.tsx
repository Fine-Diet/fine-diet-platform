'use client';

import { ReactNode, useState } from 'react';
import { NutritionDensityGauge } from './NutritionDensityGauge';
import { NutritionTargetsSetupCard } from './NutritionTargetsSetupCard';

type MacroSummaryItem = {
  label: 'Protein' | 'Carbs' | 'Fat';
  value: number;
  /** null when the user has not confirmed a macro target — render "of —", never a fabricated default. */
  goal: number | null;
};

interface JournalHeroSectionProps {
  score: number | null;
  dateLabel: string;
  onPrevDay: () => void;
  onNextDay: () => void;
  canGoNext: boolean;
  /** Block sections to render inside the hero area */
  children?: ReactNode;
  /** Daily calorie intake (consumed so far) */
  dailyIntake?: number;
  /** Daily calorie goal from user profile */
  dailyGoal?: number;
  /** Whether profile goals are still loading */
  goalsLoading?: boolean;
  /** Macro totals for the day summary widget */
  macroSummary?: MacroSummaryItem[];
  /** Whether the score is loading */
  scoreLoading?: boolean;
  /** Label for the score gauge */
  scoreLabel?: string;
  /** Nutrition Targets v1 — show the unset-target setup card (Log home, no confirmed target yet). */
  showNutritionTargetsSetup?: boolean;
  onOpenNutritionTargetsSetup?: () => void;
}

export function JournalHeroSection({
  score,
  dateLabel,
  onPrevDay,
  onNextDay,
  canGoNext,
  children,
  dailyIntake = 0,
  dailyGoal,
  goalsLoading = false,
  macroSummary = [],
  scoreLoading = false,
  scoreLabel = 'Nutrition Density',
  showNutritionTargetsSetup = false,
  onOpenNutritionTargetsSetup,
}: JournalHeroSectionProps) {
  const [intakePercentPinned, setIntakePercentPinned] = useState(false);
  const [intakePercentHovered, setIntakePercentHovered] = useState(false);
  const showIntakePercent = intakePercentPinned || intakePercentHovered;

  const hasGoal = !goalsLoading && typeof dailyGoal === 'number' && dailyGoal > 0;
  const intakePercentValue = hasGoal ? (dailyIntake / dailyGoal) * 100 : 0;
  const barFillPercent = Math.min(intakePercentValue, 100);
  const goalLabel = goalsLoading ? '—' : dailyGoal != null ? String(dailyGoal) : '—';

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
      <div className="relative flex flex-col pt-4 pb-14">
        {/* Date navigation header — lives below the app top nav supplied by AppShell */}
        <header className="w-full">
          <div className="relative w-full max-w-[650px] mx-auto px-4 py-3 flex items-center justify-center">
            {/* Left Chevron */}
            <button
              onClick={onPrevDay}
              className="absolute left-4 p-2 -ml-2 text-white/70 hover:text-white transition-colors active:opacity-70"
              aria-label="Previous day"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Date Label */}
            <h1
              className="text-sm font-semibold text-white/90 text-center antialiased"
              style={{
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
                letterSpacing: '0.02em',
              }}
            >
              {dateLabel}
            </h1>

            {/* Right Chevron */}
            <button
              onClick={onNextDay}
              disabled={!canGoNext}
              className={`absolute right-4 p-2 -mr-2 text-white/70 hover:text-white transition-colors active:opacity-70 ${
                !canGoNext ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              aria-label="Next day"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </header>

        {/* Score gauge — 100% of container width, max 500px, same side margin as blocks (px-4) */}
        <div className="w-full max-w-[560px] mx-auto px-2 py-0">
          <NutritionDensityGauge value={score} isLoading={scoreLoading} label={scoreLabel} />
        </div>

        <div className="w-full max-w-[650px] mx-auto px-8 pb-5 mt-[10px]">
          {showNutritionTargetsSetup && onOpenNutritionTargetsSetup && (
            <NutritionTargetsSetupCard onSetUp={onOpenNutritionTargetsSetup} />
          )}

          {macroSummary.length > 0 && (
            <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-lg border-[1.5px] border-brand-300">
              {macroSummary.map((macro, index) => (
                <div
                  key={macro.label}
                  className={`px-4 py-4 text-center ${index > 0 ? 'border-l-2 border-brand-50/15' : ''}`}
                >
                  <p className="text-lg font-semibold text-brand-50/60 antialiased">{macro.label}</p>
                  <p className="mt-.5 text-5xl font-regular leading-none text-brand-50 antialiased">
                    {Math.round(macro.value)}
                  </p>
                  <p className="mt-.5 text-sm font-semibold text-brand-50/50 antialiased">
                    of {macro.goal != null ? `${Math.round(macro.goal)}g` : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Daily Intake summary bar */}
          <div className="flex items-center gap-3 mt-[25px]">
            <span className="shrink-0 text-sm font-semibold text-brand-50 whitespace-nowrap ml-[1%] md:mr-[8%]">
              Daily Intake
            </span>

            <button
              type="button"
              className="flex-1 relative cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-50/40 before:absolute before:-inset-x-2 before:-top-6 before:-bottom-6 before:content-['']"
              aria-label={
                hasGoal
                  ? `Daily intake ${Math.round(dailyIntake)} of ${Math.round(dailyGoal!)} calories, ${Math.round(intakePercentValue)} percent of goal`
                  : 'Daily intake progress'
              }
              onMouseEnter={() => setIntakePercentHovered(true)}
              onMouseLeave={() => setIntakePercentHovered(false)}
              onClick={() => setIntakePercentPinned((pinned) => !pinned)}
            >
              <div className="h-[2px] bg-brand-50/20 rounded-full" />
              <div
                className="absolute top-0 left-0 h-[1.5px] bg-brand-300 rounded-full"
                style={{ width: `${barFillPercent}%` }}
              />
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
                style={{ left: `${barFillPercent}%` }}
              >
                <div className="w-[3px] h-4 rounded-[2px] bg-denim-500 -mt-[6.5px]" />
                <span
                  className={`text-xs font-semibold text-brand-50 mt-1 whitespace-nowrap transition-opacity duration-150 ${
                    showIntakePercent ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden={!showIntakePercent}
                >
                  {hasGoal ? `${Math.round(intakePercentValue)}%` : '—'}
                </span>
              </div>
            </button>

            <span className="md:ml-[8%] ml-[1%] shrink-0 text-sm font-regular text-brand-50 whitespace-nowrap">
            {`${Math.round(dailyIntake)}/${goalLabel} `}
              <span className="shrink-0 text-sm pl:1 font-regular text-brand-50/50 whitespace-nowrap">
              cal
              </span>
            </span>
          </div>
        </div>

        {children && <div className="px-4 space-y-3 max-w-[650px] mx-auto w-full">{children}</div>}
      </div>
    </section>
  );
}
