'use client';

/**
 * PlannedMealContextCard — Packet F Work 4.
 *
 * Surfaces the planned meal (if any) for the currently selected meal slot while
 * logging on the Log → "Log new" food tab, and offers actions to act on it.
 *
 * Self-contained: it owns its own fetch (active plan → day detail → match the
 * planned meal to the selected schedule slot) so wiring it into the large log
 * page is a single render with a few props. It never mutates the log page's
 * own state beyond the optional `onLogged` callback.
 *
 * Backend support note (execution states):
 *   The persisted plan execution vocabulary is only `pending | eaten | skipped`
 *   (see lib/plans/types.ts → PlannedMealExecutionState and
 *   scripts/sql/addPlannedMealExecutionState.sql). Packet F also references
 *   `followed | modified | replaced | unplanned`, which have NO backend support
 *   today. Safest MVP behavior implemented here:
 *     - "Log as planned"  → fully wired (executeMeal 'eat' → eaten + journal row)
 *     - "Edit then log"    → deep-links to the plan day editor (edit, then log)
 *     - "Change meal / Ate out" → deep-links to the plan eat-out builder
 *   The latter two are framed as planning actions (not silent consumption
 *   writes) because no "modified"/"replaced" execution state can be recorded.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService, type PlannedMeal } from '@/lib/plans';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';
import { findMealForScheduleSlot } from '@/lib/plans/matchScheduleSlot';

export interface PlannedMealContextCardProps {
  /** The currently selected meal slot in the log composer. */
  mealSlot: ResolvedScheduleSlot | null;
  /** The log entry date (local). */
  date: Date;
  /** The selected time of day, "HH:mm". */
  time: string;
  /** Called after a planned meal is successfully logged, so the page can refresh. */
  onLogged?: () => void;
}

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toOccurredAtIso(date: Date, time: string): string {
  const [hh, mm] = time.split(':').map(Number);
  const occurred = new Date(date.getTime());
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    occurred.setHours(hh, mm, 0, 0);
  }
  return occurred.toISOString();
}

function formatCalories(meal: PlannedMeal): string | null {
  const totals = (meal.payload as { totals?: { calories?: number } }).totals;
  if (typeof totals?.calories === 'number' && totals.calories > 0) {
    return `${Math.round(totals.calories)} cal`;
  }
  const derived = meal.meal_derived_data as { meal_calories?: number } | undefined;
  if (typeof derived?.meal_calories === 'number' && derived.meal_calories > 0) {
    return `${Math.round(derived.meal_calories)} cal`;
  }
  return null;
}

function executionLabel(state: PlannedMeal['execution_state']): string {
  switch (state) {
    case 'eaten':
      return 'Logged as planned';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Planned';
  }
}

export function PlannedMealContextCard({
  mealSlot,
  date,
  time,
  onLogged,
}: PlannedMealContextCardProps) {
  const dateKey = toLocalDateKey(date);
  const slotKey = mealSlot?.key ?? null;

  const [meal, setMeal] = useState<PlannedMeal | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!mealSlot) {
      setMeal(null);
      setPlanId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setActionError(null);
    (async () => {
      try {
        const plans = await planService.list();
        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        if (!active) {
          if (!cancelled) {
            setMeal(null);
            setPlanId(null);
          }
          return;
        }
        const detail = await planService.getDayDetail(active.id, dateKey);
        const matched = findMealForScheduleSlot(mealSlot, detail.meals, detail.slots);
        if (!cancelled) {
          setPlanId(active.id);
          setMeal(matched);
        }
      } catch {
        // Planning context is non-critical to logging — fail silently and
        // render nothing rather than blocking the log composer.
        if (!cancelled) {
          setMeal(null);
          setPlanId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mealSlot, slotKey, dateKey]);

  const handleLogAsPlanned = useCallback(async () => {
    if (!meal || executing) return;
    setExecuting(true);
    setActionError(null);
    try {
      const result = await planService.executeMeal(meal.id, 'eat', toOccurredAtIso(date, time));
      setMeal(result.meal);
      onLogged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to log planned meal.');
    } finally {
      setExecuting(false);
    }
  }, [meal, executing, date, time, onLogged]);

  // Nothing planned for this slot (or still resolving the first time): render
  // nothing so the composer is unchanged for unplanned slots.
  if (!mealSlot) return null;
  if (loading && !meal) return null;
  if (!meal) return null;

  const cal = formatCalories(meal);
  const isHandled = meal.execution_state === 'eaten' || meal.execution_state === 'skipped';
  const editHref = `${APP_ROUTE_BUILDERS.planDay(dateKey)}${planId ? `?planId=${planId}` : ''}`;
  const changeHref = `${APP_ROUTE_BUILDERS.planEatOut(meal.id)}`;

  return (
    <div className="px-6 pt-2">
      <div className="rounded-2xl border border-brand-200/40 bg-brand-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-200/60 antialiased">
              Planned for {mealSlot.label}
            </p>
            <p className="mt-1 truncate text-base font-semibold text-brand-50 antialiased">
              {meal.name?.trim() || 'Planned meal'}
            </p>
            <p className="mt-0.5 text-xs text-white/45 antialiased">
              {[cal, executionLabel(meal.execution_state)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {actionError && (
          <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100 antialiased">
            {actionError}
          </p>
        )}

        {isHandled ? (
          <p className="mt-3 text-xs text-emerald-100/70 antialiased">
            This planned meal is already {meal.execution_state}. You can still log
            extra items below.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleLogAsPlanned()}
              disabled={executing}
              className="rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-60"
            >
              {executing ? 'Logging...' : 'Log as planned'}
            </button>
            <Link
              href={editHref}
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Edit then log
            </Link>
            <Link
              href={changeHref}
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Change meal / Ate out
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlannedMealContextCard;
