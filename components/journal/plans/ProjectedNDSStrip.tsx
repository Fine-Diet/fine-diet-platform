'use client';

/**
 * ProjectedNDSStrip
 *
 * Top strip on the Plans week view. Renders projected daily NDS (0-100)
 * for up to 7 days with a small confidence dot and meal count. Tappable
 * cells navigate to the per-day view.
 *
 * Projected NDS visibility is treated as core (packet AC 10), so no
 * entitlement gate is applied here. The more detailed NDS subscore
 * drilldown remains behind feature:plans-nds-breakdown (not used here).
 */

import Link from 'next/link';
import type { PlanDay } from '@/lib/plans';

interface ProjectedNDSStripProps {
  planId: string;
  days: PlanDay[];
  mealCountByDay: Record<string, number>;
}

function formatWeekdayShort(dateLocal: string): string {
  // Parse as local date by splitting so we don't slip timezone.
  const [y, m, d] = dateLocal.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function confidenceDotClass(conf: PlanDay['projection_confidence']): string {
  if (conf === 'high') return 'bg-denim-400';
  if (conf === 'medium') return 'bg-amber-400';
  return 'bg-white/30';
}

function scoreLabel(score: number | null): string {
  if (score === null || Number.isNaN(score)) return '—';
  return String(Math.round(score));
}

export function ProjectedNDSStrip({ planId, days, mealCountByDay }: ProjectedNDSStripProps) {
  if (days.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5 text-sm text-white/50 antialiased">
        No plan days yet. Generate a week to see projected NDS here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-4">
      <div className="grid grid-cols-7 gap-2">
        {days.slice(0, 7).map((day) => {
          const score = day.projected_nds_100;
          const mealCount = mealCountByDay[day.date_local] ?? 0;
          return (
            <Link
              key={day.id}
              href={`/journal/plans/day/${day.date_local}?planId=${planId}`}
              className="flex flex-col items-center rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors py-2.5 px-1.5 min-w-0"
            >
              <span className="text-[10px] text-white/40 antialiased leading-none mb-1">
                {formatWeekdayShort(day.date_local)}
              </span>
              <span className="text-lg font-semibold text-white antialiased leading-none">
                {scoreLabel(score)}
              </span>
              <span className="text-[10px] text-white/40 antialiased leading-none mt-1">
                NDS/100
              </span>
              <div className="flex items-center gap-1.5 mt-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${confidenceDotClass(day.projection_confidence)}`}
                  aria-label={`projection confidence ${day.projection_confidence ?? 'unknown'}`}
                />
                <span className="text-[10px] text-white/40 antialiased leading-none">
                  {mealCount} meal{mealCount === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-[11px] text-white/30 antialiased mt-3 px-1">
        Projected NDS is estimated from planned meals. Tap a day to edit
        slots and see meal-level scoring.
      </p>
    </div>
  );
}
