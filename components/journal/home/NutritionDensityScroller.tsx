/**
 * NutritionDensityScroller — /journal/home "Nutrition Density So Far Today"
 * horizontal metric scroller.
 *
 * Extracted verbatim from pages/journal/home.tsx (Packet 2B-B). Presentational
 * and prop-driven: the page owns the `useNDS()` fetch and passes `data`/`isLoading`
 * in. The module maps subscores → labeled factor cards, tracks scroll position for
 * the dot/arrow controls, and renders status text. No data fetching or auth here.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NDSData } from '@/lib/nds/useNDS';

type NDSStatus = 'Strong' | 'Building' | 'Support' | 'Watch' | 'Logged' | 'Pending';

function getSubscoreStatus(score: number | null, hasLoggedNutrition: boolean): NDSStatus {
  if (score === null || Number.isNaN(score)) return hasLoggedNutrition ? 'Logged' : 'Pending';
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Building';
  if (score >= 4) return 'Support';
  return 'Watch';
}

export interface NutritionDensityScrollerProps {
  data: NDSData | null;
  isLoading: boolean;
}

export function NutritionDensityScroller({
  data,
  isLoading,
}: NutritionDensityScrollerProps) {
  const hasLoggedNutrition = Boolean((data?._meta?.intake_count ?? 0) > 0 || (data?._meta?.meal_count ?? 0) > 0);
  const overallScore = data ? Math.round(data.nds_score_100) : null;
  const factors: Array<{ label: string; score: number | null }> = [
    { label: 'Whole Food Ratio', score: data?.subscores_10.wfr ?? null },
    { label: 'Protein Sufficiency', score: data?.subscores_10.ps ?? null },
    { label: 'Fiber', score: data?.subscores_10.fp ?? null },
    { label: 'Added Sugar', score: data?.subscores_10.as ?? null },
    { label: 'Phytonutrient Composition', score: data?.subscores_10.pnd ?? null },
    { label: 'Omega Balance', score: data?.subscores_10.ob ?? null },
    { label: 'Micronutrient Coverage', score: data?.subscores_10.mnc ?? null },
  ];

  const total = factors.length + 1;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Track scroll position → active block + edge state for the arrow controls.
  const syncScrollState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const maxScroll = container.scrollWidth - container.clientWidth;
    setCanScrollLeft(container.scrollLeft > 4);
    setCanScrollRight(container.scrollLeft < maxScroll - 4);
    const firstCard = container.children[0] as HTMLElement | undefined;
    const cardWidth = firstCard?.offsetWidth ?? 176;
    setActiveIndex(Math.min(total - 1, Math.round(container.scrollLeft / cardWidth)));
  }, [total]);

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState, isLoading]);

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(index, total - 1));
    const card = container.children[clamped] as HTMLElement | undefined;
    if (!card) return;
    container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
  }, [total]);

  return (
    <section className="w-full max-w-[750px] mx-auto">
      <div className="mb-3">
        <h2 className="text-xl font-semibold text-white antialiased">
          Nutrition Density So Far Today
        </h2>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/25 bg-transparent">
        <div
          ref={scrollRef}
          onScroll={syncScrollState}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 py-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center text-white">
            <p className="whitespace-nowrap text-xs text-white/70 antialiased">
              Overall Score
            </p>
            <span className="mt-2 block whitespace-nowrap text-3xl font-semibold leading-none">
              {isLoading ? '...' : overallScore ?? 'n/a'}
            </span>
          </div>
          {factors.map((factor) => (
            <div
              key={factor.label}
              className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center last:border-r-0"
              title={`${factor.label}: ${getSubscoreStatus(factor.score, hasLoggedNutrition)}`}
            >
              <p className="whitespace-nowrap text-xs text-white/70 antialiased">{factor.label}</p>
              <p className="mt-2 whitespace-nowrap text-3xl font-semibold leading-none text-white antialiased">
                {isLoading ? 'Pending' : getSubscoreStatus(factor.score, hasLoggedNutrition)}
              </p>
            </div>
          ))}
        </div>
      </div>
      {total > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={!canScrollLeft}
            aria-label="Previous metric"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex justify-center gap-2">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to metric ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/55'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={!canScrollRight}
            aria-label="Next metric"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}

export default NutritionDensityScroller;
