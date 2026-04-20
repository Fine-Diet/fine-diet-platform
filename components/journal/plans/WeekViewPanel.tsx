'use client';

/**
 * WeekViewPanel
 *
 * The Plans week workbench. Top-level layout for /journal/plans:
 *   - Profile defaults banner
 *   - Projected NDS strip (per-day tappable cells)
 *   - Generate / regenerate actions
 *   - Inline day list showing slot summaries
 *
 * Execution is delegated to the parent page which owns state, data
 * fetching, and API calls.
 */

import Link from 'next/link';
import type { Plan, PlanDay, PlanSlot, PlannedMeal, PlanInputSnapshot } from '@/lib/plans';
import { ProjectedNDSStrip } from './ProjectedNDSStrip';
import { ProfileDefaultsBanner } from './ProfileDefaultsBanner';

interface WeekViewPanelProps {
  plan: Plan | null;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
  snapshot: PlanInputSnapshot | null;
  canGenerate: boolean;
  missingReasons: string[];
  onGenerate: () => void;
  generating: boolean;
}

function mealCountByDay(days: PlanDay[], meals: PlannedMeal[]): Record<string, number> {
  const dayIdToDate = new Map(days.map((d) => [d.id, d.date_local]));
  const counts: Record<string, number> = {};
  for (const m of meals) {
    const date = dayIdToDate.get(m.plan_day_id);
    if (!date) continue;
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return counts;
}

export function WeekViewPanel({
  plan,
  days,
  slots,
  meals,
  snapshot,
  canGenerate,
  missingReasons,
  onGenerate,
  generating,
}: WeekViewPanelProps) {
  const mealsPerDay = mealCountByDay(days, meals);
  void slots; // future: per-day slot counts when empty slots are allowed

  return (
    <div className="space-y-5">
      <ProfileDefaultsBanner
        snapshot={snapshot}
        canGenerate={canGenerate}
        missingReasons={missingReasons}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          className="flex-1 py-3 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors text-sm font-semibold text-denim-200 antialiased"
        >
          {generating
            ? 'Generating…'
            : plan
              ? 'Regenerate week'
              : 'Generate a week'}
        </button>
        {plan && (
          <Link
            href={`/journal/plans/day/${days[0]?.date_local ?? ''}?planId=${plan.id}`}
            className="px-4 py-3 rounded-full bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-sm text-white/80 antialiased"
          >
            Open day
          </Link>
        )}
      </div>

      {plan && (
        <ProjectedNDSStrip
          planId={plan.id}
          days={days}
          mealCountByDay={mealsPerDay}
        />
      )}

      {plan && (
        <div className="rounded-2xl bg-white/[0.04] p-5">
          <p className="text-sm font-semibold text-white antialiased">
            {plan.title ?? 'Your plan'}
          </p>
          <p className="text-xs text-white/40 antialiased mt-0.5">
            {plan.plan_shape} · {plan.status} · starts {plan.start_date}
          </p>
          <p className="text-xs text-white/50 antialiased mt-3">
            Each day carries projected NDS and per-meal scoring. Tap a day
            above to edit slots or swap meals.
          </p>
        </div>
      )}

      {!plan && (
        <div className="rounded-2xl bg-white/[0.04] p-5">
          <p className="text-sm text-white/70 antialiased">
            No active plan. Generate one above to see projected NDS,
            editable slots, and meal-level scoring.
          </p>
        </div>
      )}
    </div>
  );
}
