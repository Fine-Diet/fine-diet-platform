'use client';

/**
 * PlannedMealContextCard — Packet F + Packet 2.
 *
 * Surfaces planned meal(s) for the selected slot on Log, with independent
 * Log as planned / Adjust & log / Edit plan actions per meal.
 *
 * Explicit `plannedMealId` takes precedence over schedule-slot matching.
 * Planning-context failures never block ordinary food logging below.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService, type PlannedMeal } from '@/lib/plans';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';
import {
  collectPlannedMealsForScheduleSlotAcrossPlans,
} from '@/lib/plans/matchScheduleSlot';
import { PlannedMealAdjustComposer } from '@/components/journal/log/PlannedMealAdjustComposer';

export interface PlannedMealContextCardProps {
  mealSlot: ResolvedScheduleSlot | null;
  date: Date;
  time: string;
  /** Explicit planned meal from deep link — takes precedence over slot matching. */
  explicitPlannedMealId?: string | null;
  /** When true with explicitPlannedMealId, show the adjust composer. */
  adjustMode?: boolean;
  redirectTarget?: string;
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
      return 'Logged';
    case 'skipped':
      return 'Skipped';
    default:
      return 'Pending';
  }
}

interface PlannedMealRowProps {
  meal: PlannedMeal;
  mealSlot: ResolvedScheduleSlot | null;
  dateKey: string;
  time: string;
  redirectTarget: string;
  executingId: string | null;
  onExecute: (meal: PlannedMeal) => Promise<void>;
}

function PlannedMealRow({
  meal,
  mealSlot,
  dateKey,
  time,
  redirectTarget,
  executingId,
  onExecute,
}: PlannedMealRowProps) {
  const cal = formatCalories(meal);
  const isHandled = meal.execution_state === 'eaten' || meal.execution_state === 'skipped';
  const editHref = APP_ROUTE_BUILDERS.planDayWithPlan(dateKey, meal.plan_id);
  const adjustHref = APP_ROUTE_BUILDERS.logNewPlanned({
    date: dateKey,
    time,
    mealSlot: mealSlot?.key ?? null,
    plannedMealId: meal.id,
    redirect: redirectTarget,
  });

  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3 space-y-2">
      <div>
        <p className="truncate text-sm font-semibold text-brand-50">{meal.name?.trim() || 'Planned meal'}</p>
        <p className="text-xs text-white/45">
          {[cal, executionLabel(meal.execution_state)].filter(Boolean).join(' · ')}
        </p>
      </div>
      {isHandled ? (
        <p className="text-xs text-emerald-100/70">
          Already {meal.execution_state}. You can still log extra items below.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={executingId === meal.id}
            onClick={() => void onExecute(meal)}
            className="rounded-full bg-[#d7ecff] px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-60"
          >
            {executingId === meal.id ? 'Logging…' : 'Log as planned'}
          </button>
          <Link
            href={adjustHref}
            className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/75 hover:bg-white/[0.06]"
          >
            Adjust & log
          </Link>
          <Link
            href={editHref}
            className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/75 hover:bg-white/[0.06]"
          >
            Edit plan
          </Link>
        </div>
      )}
    </div>
  );
}

export function PlannedMealContextCard({
  mealSlot,
  date,
  time,
  explicitPlannedMealId = null,
  adjustMode = false,
  redirectTarget = '/app/log',
  onLogged,
}: PlannedMealContextCardProps) {
  const dateKey = toLocalDateKey(date);
  const slotKey = mealSlot?.key ?? null;

  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [idMismatch, setIdMismatch] = useState(false);

  useEffect(() => {
    if (!mealSlot && !explicitPlannedMealId) {
      setMeals([]);
      setIdMismatch(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setActionError(null);
    setIdMismatch(false);
    (async () => {
      try {
        if (explicitPlannedMealId) {
          const selected = await planService.getMeal(explicitPlannedMealId);
          if (!cancelled) {
            setMeals(selected ? [selected] : []);
            setIdMismatch(!selected);
          }
          return;
        }
        if (!mealSlot) {
          if (!cancelled) setMeals([]);
          return;
        }

        const plans = await planService.list();
        const candidates = plans.filter((p) => p.status === 'active');
        const planDays = await Promise.all(
          candidates.map(async (plan) => {
            try {
              const detail = await planService.getDayDetail(plan.id, dateKey);
              return { planId: plan.id, meals: detail.meals, slots: detail.slots };
            } catch {
              return null;
            }
          }),
        );
        const contexts = planDays.filter(
          (ctx): ctx is NonNullable<typeof ctx> => ctx != null,
        );
        const matched = collectPlannedMealsForScheduleSlotAcrossPlans(mealSlot, contexts);
        if (!cancelled) setMeals(matched);
      } catch {
        if (!cancelled) setMeals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mealSlot, slotKey, dateKey, explicitPlannedMealId]);

  const handleLogAsPlanned = useCallback(
    async (meal: PlannedMeal) => {
      setExecutingId(meal.id);
      setActionError(null);
      try {
        const result = await planService.executeMeal(
          meal.id,
          'eat',
          toOccurredAtIso(date, time),
        );
        setMeals((prev) => prev.map((m) => (m.id === meal.id ? result.meal : m)));
        onLogged?.();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Unable to log planned meal.');
      } finally {
        setExecutingId(null);
      }
    },
    [date, time, onLogged],
  );

  if (!mealSlot && !explicitPlannedMealId) return null;
  if (loading && meals.length === 0 && !idMismatch) return null;

  const adjustMeal = adjustMode && explicitPlannedMealId
    ? meals.find((m) => m.id === explicitPlannedMealId) ?? null
    : null;

  if (adjustMeal && adjustMeal.execution_state === 'pending') {
    return (
      <PlannedMealAdjustComposer
        plannedMeal={adjustMeal}
        dateKey={dateKey}
        time={time}
        redirectTarget={redirectTarget}
        onLogged={onLogged}
      />
    );
  }

  if (idMismatch) {
    return (
      <div className="px-6 pt-2">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-xs text-amber-100">
          The selected planned meal could not be found. You can still log food below.
        </div>
      </div>
    );
  }

  if (meals.length === 0) return null;

  return (
    <div className="px-6 pt-2">
      <div className="rounded-2xl border border-brand-200/40 bg-brand-900/60 p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-200/60">
          {meals.length === 1
            ? `Planned for ${mealSlot?.label ?? 'this slot'}`
            : `${meals.length} planned meals for ${mealSlot?.label ?? 'this slot'}`}
        </p>

        {actionError && (
          <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {actionError}
          </p>
        )}

        <div className="space-y-2">
          {meals.map((meal) => (
            <PlannedMealRow
              key={meal.id}
              meal={meal}
              mealSlot={mealSlot}
              dateKey={dateKey}
              time={time}
              redirectTarget={redirectTarget}
              executingId={executingId}
              onExecute={handleLogAsPlanned}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default PlannedMealContextCard;
