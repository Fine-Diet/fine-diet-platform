'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { NutritionDensityGauge } from './NutritionDensityGauge';

interface JournalHeroSectionProps {
  score: number;
  dateLabel: string;
  onPrevDay: () => void;
  onNextDay: () => void;
  canGoNext: boolean;
  /** Optional background images; falls back to home hero images */
  backgroundDesktop?: string;
  backgroundMobile?: string;
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
  backgroundDesktop = '/images/home/hero-desktop.jpg',
  backgroundMobile = '/images/home/hero-mobile.jpg',
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
          sizes="100vw"
        />
        {/* Overlay gradient - darker at top and bottom for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/50" />
      </div>

      {/* Content layer */}
      <div className="relative flex flex-col min-h-[45vh] sm:min-h-[50vh]">
        {/* Date navigation header */}
        <header className="sticky top-0 z-30 w-full">
          <div className="relative w-full px-4 py-6 flex items-center justify-center">
            {/* Left Chevron */}
            <button
              onClick={onPrevDay}
              className="absolute left-4 p-2 -ml-2 text-white/80 hover:text-white transition-colors active:opacity-70"
              aria-label="Previous day"
            >
              <svg
                className="w-6 h-6"
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
              className="text-lg font-medium text-white/90 text-center"
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
              className={`absolute right-4 p-2 -mr-2 text-white/80 hover:text-white transition-colors active:opacity-70 ${
                !canGoNext ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              aria-label="Next day"
            >
              <svg
                className="w-6 h-6"
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

        {/* Score gauge - centered */}
        <div className="flex-1 flex items-center justify-center px-6 pb-8">
          <NutritionDensityGauge value={score} size={260} />
        </div>
      </div>
    </section>
  );
}
