'use client';

import { ReactNode } from 'react';
import { NutritionDensityGauge } from './NutritionDensityGauge';

type MacroSummaryItem = {
  label: 'Protein' | 'Carbs' | 'Fat';
  value: number;
  goal: number;
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
}: JournalHeroSectionProps) {
  const hasGoal = !goalsLoading && typeof dailyGoal === 'number' && dailyGoal > 0;
  const intakePercent = hasGoal ? Math.min((dailyIntake / dailyGoal) * 100, 100) : 0;
  const goalLabel = goalsLoading ? '—' : dailyGoal != null ? String(dailyGoal) : '—';

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-900 to-brand-500">
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

        <div className="w-full max-w-[650px] mx-auto px-8 pb-5">
          {macroSummary.length > 0 && (
            <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-lg border-[2px] border-brand-50/15">
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
                    of {Math.round(macro.goal)}g
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Daily Intake summary bar */}
          <div className="flex items-center gap-3">
            <span className="shrink-0 text-sm font-semibold text-brand-50 whitespace-nowrap">
              Daily Intake
            </span>

            <div className="flex-1 relative">
              <div className="h-[2px] bg-brand-50/20 rounded-full" />
              <div
                className="absolute top-0 left-0 h-[3px] bg-brand-50/60 rounded-full"
                style={{ width: `${intakePercent}%` }}
              />
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${intakePercent}%` }}
              >
                <div className="w-[3px] h-4 rounded-[2px] bg-denim-500 -mt-[6.5px]" />
                <span className="text-xs font-semibold text-brand-50 mt-1 whitespace-nowrap">
                  {hasGoal ? `${Math.round(intakePercent)}%` : '—'}
                </span>
              </div>
            </div>

            <span className="shrink-0 text-sm font-regular text-brand-50 whitespace-nowrap">
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
