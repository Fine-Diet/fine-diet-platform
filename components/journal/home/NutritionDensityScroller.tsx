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

/** Empty-state glyph shown when there is no input yet (not a low score). */
const NO_INPUT = '–';

/**
 * Provisional, easy-to-revise help copy for each factor header. Surfaced as
 * tooltips (title attribute) so the labels are self-explanatory. Keyed by the
 * factor label so copy edits live in one place.
 */
const FACTOR_DEFINITIONS: Record<string, string> = {
  'Whole Food Ratio':
    "How much of today's intake comes from minimally processed whole foods.",
  'Protein Sufficiency':
    "Whether today's protein intake appears adequate for your needs.",
  Fiber: "Whether today's food choices provide meaningful fiber support.",
  'Added Sugar': 'Whether added sugar is staying in a supportive range.',
  'Phytonutrient Composition':
    'Variety and density of plant-based compounds from colorful whole foods.',
  'Omega Balance':
    'Whether fat sources appear balanced toward supportive omega patterns.',
  'Micronutrient Coverage':
    "Breadth of vitamin and mineral coverage from today's intake.",
};

const OVERALL_DEFINITION =
  'Your overall Nutrition Density score so far today, combining the factors to the right.';

function getSubscoreStatus(score: number | null, hasLoggedNutrition: boolean): NDSStatus {
  if (score === null || Number.isNaN(score)) return hasLoggedNutrition ? 'Logged' : 'Pending';
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Building';
  if (score >= 4) return 'Support';
  return 'Watch';
}

/**
 * Factor display value. When the day has no logged input we show `–` rather
 * than a computed status, so an empty day never looks like a low/"Watch"
 * score. When input exists, a true low score still resolves to `Watch`.
 */
function getFactorDisplay(score: number | null, hasInput: boolean): string {
  if (!hasInput) return NO_INPUT;
  return getSubscoreStatus(score, true);
}

export interface NutritionDensityScrollerProps {
  data: NDSData | null;
  isLoading: boolean;
}

export function NutritionDensityScroller({
  data,
  isLoading,
}: NutritionDensityScrollerProps) {
  const hasInput = Boolean((data?._meta?.intake_count ?? 0) > 0 || (data?._meta?.meal_count ?? 0) > 0);
  const overallScore = data ? Math.round(data.nds_score_100) : null;
  const factors: Array<{ label: string; score: number | null; help: string }> = [
    { label: 'Whole Food Ratio', score: data?.subscores_10.wfr ?? null, help: FACTOR_DEFINITIONS['Whole Food Ratio'] },
    { label: 'Protein Sufficiency', score: data?.subscores_10.ps ?? null, help: FACTOR_DEFINITIONS['Protein Sufficiency'] },
    { label: 'Fiber', score: data?.subscores_10.fp ?? null, help: FACTOR_DEFINITIONS['Fiber'] },
    { label: 'Added Sugar', score: data?.subscores_10.as ?? null, help: FACTOR_DEFINITIONS['Added Sugar'] },
    { label: 'Phytonutrient Composition', score: data?.subscores_10.pnd ?? null, help: FACTOR_DEFINITIONS['Phytonutrient Composition'] },
    { label: 'Omega Balance', score: data?.subscores_10.ob ?? null, help: FACTOR_DEFINITIONS['Omega Balance'] },
    { label: 'Micronutrient Coverage', score: data?.subscores_10.mnc ?? null, help: FACTOR_DEFINITIONS['Micronutrient Coverage'] },
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
    <section className="w-full max-w-[1000px] mx-auto">
      <div className="mb-3">
        <h2 className="text-xl font-semibold text-white antialiased">
          Nutrition Density So Far Today
        </h2>
        <p className="mt-1 text-xs text-white/45 antialiased">
          Hover or long-press a factor to see what it means. Factors show
          <span className="px-1 font-semibold text-white/70">{NO_INPUT}</span>
          until you log something today.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/25 bg-transparent">
        <div
          ref={scrollRef}
          onScroll={syncScrollState}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 py-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center text-white"
            title={OVERALL_DEFINITION}
          >
            <p className="whitespace-nowrap text-xs text-white/70 antialiased">
              Overall Score
            </p>
            <span className="mt-2 block whitespace-nowrap text-3xl font-semibold leading-none">
              {isLoading ? '...' : hasInput ? overallScore ?? NO_INPUT : NO_INPUT}
            </span>
          </div>
          {factors.map((factor) => (
            <div
              key={factor.label}
              className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center last:border-r-0"
              title={`${factor.label} — ${factor.help}`}
            >
              <p className="whitespace-nowrap text-xs text-white/70 antialiased">{factor.label}</p>
              <p className="mt-2 whitespace-nowrap text-3xl font-semibold leading-none text-white antialiased">
                {isLoading ? 'Pending' : getFactorDisplay(factor.score, hasInput)}
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
