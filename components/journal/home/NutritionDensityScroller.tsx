/**
 * NutritionDensityScroller — /journal/home "Nutrition Density So Far Today"
 * horizontal metric scroller.
 *
 * Extracted verbatim from pages/journal/home.tsx (Packet 2B-B). Presentational
 * and prop-driven: the page owns the `useNDS()` fetch and passes `data`/`isLoading`
 * in. The module maps NDS readings → labeled factor cards, tracks scroll position
 * for the dot/arrow controls, and renders status text. No data fetching or auth here.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NDSData } from '@/lib/nds/useNDS';

type NDSStatus = 'Exceptional' | 'Strong' | 'Steady' | 'Building' | 'Support' | 'Watch' | 'Log meals' | 'Pending';

/** Empty-state glyph shown when there is no input yet (not a low score). */
const NO_INPUT = '–';

/**
 * App Copy / Universal Copy / Home: SECTION 3 — NDS INSIGHTS BAR.
 * Keyed by metric label so copy edits stay easy to revise.
 */
const READING_DEFINITIONS: Record<string, string> = {
  'Overall Score':
    "Your Nutrient Density Score summarizes the quality of today's food choices on a scale of 0–100. It combines whole foods, protein, fiber, plant variety, added sugar, omega balance, and nutrient coverage into a single score. As you log meals throughout the day, your score updates automatically.",
  'Whole Food Ratio':
    "Whole Food Ratio measures how much of today's intake comes from minimally processed whole foods. Meals built around foods closer to their natural form generally provide more nutrients and fewer additives. This percentage updates as foods are logged throughout the day.",
  'Protein Sufficiency':
    "Protein Sufficiency evaluates whether today's meals provide enough protein to support satiety, recovery, and daily function. It considers total protein, meal composition, and protein source quality. The score updates as additional meals are logged.",
  Fiber:
    'Fiber tracks your progress toward a supportive daily fiber intake. Fiber plays an important role in digestion, gut health, blood sugar regulation, and satiety. Your total increases as fiber-containing foods are logged throughout the day.',
  'Added Sugar Intake':
    'Added Sugar tracks how much sugar has been added to foods and beverages beyond what naturally occurs in whole foods. Lower amounts generally support overall dietary quality and nutrient density. This value updates automatically as meals are logged.',
  'Plant Variety':
    'Plant Variety measures the range of colorful plant foods consumed today. Different plant colors often provide different beneficial compounds and nutrients. Increasing color variety is one way to broaden nutritional exposure over time.',
  'Omega Balance':
    "Omega Balance evaluates the relationship between omega-3 and omega-6 fats in today's intake. A more balanced pattern is generally associated with higher dietary quality. This score updates as foods containing dietary fats are logged.",
  'Micronutrient Coverage':
    "Micronutrient Coverage estimates how well today's foods provide key vitamins and minerals. It considers nutrients such as magnesium, potassium, iron, folate, and several vitamins. Broader coverage generally reflects a more nutrient-dense day of eating.",
};

function getSubscoreStatus(score: number | null, hasLoggedNutrition: boolean): NDSStatus {
  if (!hasLoggedNutrition) return 'Log meals';
  if (score === null || Number.isNaN(score)) return 'Pending';
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Building';
  if (score >= 4) return 'Support';
  return 'Watch';
}

function getOverallStatus(score: number | null, hasLoggedNutrition: boolean): NDSStatus {
  if (!hasLoggedNutrition) return 'Log meals';
  if (score === null || Number.isNaN(score)) return 'Pending';
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Strong';
  if (score >= 70) return 'Steady';
  if (score >= 60) return 'Building';
  if (score >= 40) return 'Support';
  return 'Watch';
}

function formatCompactNumber(value: number, decimals = 1): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(decimals);
}

function formatReadingValue(
  value: number | null | undefined,
  hasInput: boolean,
  formatter: (value: number) => string,
): string {
  if (!hasInput) return NO_INPUT;
  if (value === null || value === undefined || Number.isNaN(value)) return NO_INPUT;
  return formatter(value);
}

export interface NutritionDensityScrollerProps {
  data: NDSData | null;
  isLoading: boolean;
}

export function NutritionDensityScroller({
  data,
  isLoading,
}: NutritionDensityScrollerProps) {
  // Fresh recomputes include intake/meal diagnostics. Cached responses currently
  // do not, so use a non-zero stored score as the stable fallback signal that
  // the day has logged nutrition.
  const hasInput = Boolean(
    (data?._meta?.intake_count ?? 0) > 0 ||
    (data?._meta?.meal_count ?? 0) > 0 ||
    (data?.nds_score_100 ?? 0) > 0
  );
  const overallScore = data ? Math.round(data.nds_score_100) : null;
  const readings = data?.readings;
  const valueOrLoading = (value: string) => (isLoading ? '...' : value);
  const labelOrLoading = (label: NDSStatus) => (isLoading ? 'Pending' : label);
  const score10 = (score: number) => `${formatCompactNumber(score)}/10`;

  const cards: Array<{ label: string; value: string; status: NDSStatus; help: string }> = [
    {
      label: 'Overall Score',
      value: valueOrLoading(formatReadingValue(overallScore, hasInput, (v) => String(Math.round(v)))),
      status: labelOrLoading(getOverallStatus(overallScore, hasInput)),
      help: READING_DEFINITIONS['Overall Score'],
    },
    {
      label: 'Whole Food Ratio',
      value: valueOrLoading(formatReadingValue(readings?.wfr_percent, hasInput, (v) => `${Math.round(v)}%`)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.wfr ?? null, hasInput)),
      help: READING_DEFINITIONS['Whole Food Ratio'],
    },
    {
      label: 'Protein Sufficiency',
      value: valueOrLoading(formatReadingValue(readings?.protein_score_10 ?? data?.subscores_10.ps, hasInput, score10)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.ps ?? null, hasInput)),
      help: READING_DEFINITIONS['Protein Sufficiency'],
    },
    {
      label: 'Fiber',
      value: valueOrLoading(formatReadingValue(readings?.fiber_g, hasInput, (v) => `${formatCompactNumber(v)}g`)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.fp ?? null, hasInput)),
      help: READING_DEFINITIONS['Fiber'],
    },
    {
      label: 'Added Sugar Intake',
      value: valueOrLoading(formatReadingValue(readings?.added_sugar_g, hasInput, (v) => `${formatCompactNumber(v)}g`)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.as ?? null, hasInput)),
      help: READING_DEFINITIONS['Added Sugar Intake'],
    },
    {
      label: 'Plant Variety',
      value: valueOrLoading(formatReadingValue(readings?.plant_variety_score_10 ?? data?.subscores_10.pnd, hasInput, score10)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.pnd ?? null, hasInput)),
      help: READING_DEFINITIONS['Plant Variety'],
    },
    {
      label: 'Omega Balance',
      value: valueOrLoading(formatReadingValue(readings?.omega_balance_score_10 ?? data?.subscores_10.ob, hasInput, score10)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.ob ?? null, hasInput)),
      help: READING_DEFINITIONS['Omega Balance'],
    },
    {
      label: 'Micronutrient Coverage',
      value: valueOrLoading(formatReadingValue(readings?.micronutrient_coverage_score_10 ?? data?.subscores_10.mnc, hasInput, score10)),
      status: labelOrLoading(getSubscoreStatus(data?.subscores_10.mnc ?? null, hasInput)),
      help: READING_DEFINITIONS['Micronutrient Coverage'],
    },
  ];

  const total = cards.length;
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
          Log meals to reveal today&apos;s nutrition signals.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/25 bg-transparent">
        <div
          ref={scrollRef}
          onScroll={syncScrollState}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 py-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card) => (
            <div
              key={card.label}
              className="flex w-44 shrink-0 snap-start flex-col items-center justify-center border-r border-white/25 px-5 py-6 text-center last:border-r-0"
              title={`${card.label} — ${card.help}`}
            >
              <p className="whitespace-nowrap text-xs text-white/70 antialiased">{card.label}</p>
              <p className="mt-2 whitespace-nowrap text-3xl font-semibold leading-none text-white antialiased">
                {card.value}
              </p>
              <p className="mt-2 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.18em] text-white/45 antialiased">
                {card.status}
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
