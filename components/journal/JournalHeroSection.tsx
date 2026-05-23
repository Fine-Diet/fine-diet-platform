'use client';

import { useEffect, useState, ReactNode } from 'react';
import Image from 'next/image';
import { NutritionDensityGauge } from './NutritionDensityGauge';

interface JournalHeroSectionProps {
  score: number | null;
  dateLabel: string;
  onPrevDay: () => void;
  onNextDay: () => void;
  canGoNext: boolean;
  /** Block sections to render inside the hero area */
  children?: ReactNode;
  /** Optional background images; falls back to home hero images */
  backgroundDesktop?: string;
  backgroundMobile?: string;
  /** Daily calorie intake (consumed so far) */
  dailyIntake?: number;
  /** Daily calorie goal */
  dailyGoal?: number;
  /** Whether the score is loading */
  scoreLoading?: boolean;
  /** Label for the score gauge */
  scoreLabel?: string;
}

// Simple media query hook
const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);

    if (mediaQuery.matches !== matches) {
      setMatches(mediaQuery.matches);
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateMatch);
    } else {
      mediaQuery.addListener(updateMatch);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateMatch);
      } else {
        mediaQuery.removeListener(updateMatch);
      }
    };
  }, [matches, query]);

  return matches;
};

export function JournalHeroSection({
  score,
  dateLabel,
  onPrevDay,
  onNextDay,
  canGoNext,
  children,
  backgroundDesktop = '/images/home/hero-desktop.jpg',
  backgroundMobile = '/images/home/hero-mobile.jpg',
  dailyIntake = 0,
  dailyGoal = 2500,
  scoreLoading = false,
  scoreLabel = 'Nutrition Density',
}: JournalHeroSectionProps) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const backgroundImage = isMobile ? backgroundMobile : backgroundDesktop;
  return (
    <section className="relative isolate overflow-hidden rounded-b-[2rem]">
      {/* Background image layer */}
      <div className="absolute inset-0">
        <Image
          src={backgroundImage}
          alt="Journal background"
          fill
          priority
          className="object-cover"
          sizes="85vw"
        />
        {/* Overlay gradient - darker at top and bottom for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-brand-900/45 to-brand-900/95" />
        {/* Blur overlay — sm blur across entire hero so background image is never in focus */}
        <div className="absolute inset-0 backdrop-blur-[10px] pointer-events-none" aria-hidden />
      </div>

      {/* Content layer */}
      <div className="relative flex flex-col pt-4 pb-8">
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

        {/* Daily Intake summary bar */}
        <div className="w-full px-4 pb-5 max-w-[650px] mx-auto">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              {/* Left label — no wrap */}
              <span className="shrink-0 text-sm font-semibold text-brand-50 whitespace-nowrap">
                Daily Intake
              </span>

              {/* Middle — progress bar with marker */}
              <div className="flex-1 relative">
                {/* Track */}
                <div className="h-[3px] bg-white/20 rounded-full" />
                {/* Filled portion */}
                <div
                  className="absolute top-0 left-0 h-[3px] bg-brand-50/60 rounded-full"
                  style={{ width: `${Math.min((dailyIntake / dailyGoal) * 100, 100)}%` }}
                />
                {/* Marker circle + percentage label */}
                <div
                  className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                  style={{ left: `${Math.min((dailyIntake / dailyGoal) * 100, 100)}%` }}
                >
                  <div className="w-3 h-3 rounded-full bg-brand-50 -mt-[4.5px]" />
                  <span className="text-xs font-semibold text-brand-50 mt-1 whitespace-nowrap">
                    {Math.round((dailyIntake / dailyGoal) * 100)}%
                  </span>
                </div>
              </div>

              {/* Right label — no wrap (calories rounded to whole number) */}
              <span className="shrink-0 text-sm font-semibold text-brand-50 whitespace-nowrap">
                {Math.round(dailyIntake)}/{dailyGoal} cal
              </span>
            </div>
          </div>
        </div>

        {/* Block sections (Morning/Midday/Evening) */}
        {children && (
          <div className="px-4 space-y-3 max-w-[650px] mx-auto w-full">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
