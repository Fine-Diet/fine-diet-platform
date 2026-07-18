'use client';

import { useCallback, useEffect, useState } from 'react';

import { planService, type Plan, type PlanDay, type PlannedMeal } from '@/lib/plans';
import {
  buildInstantiateAppendBody,
  resolveAppendConfirmDecision,
} from '@/lib/plans/reusableAppendConfirm';
import { canApplyReusableSnapshot, reusableApplyDisabledReason } from '@/lib/plans/reusableApplyGuard';
import {
  collectPlanDayIdsForApplicationPlan,
  computeWeekPatternApplicationPlan,
  type WeekPatternApplicationMode,
} from '@/lib/plans/reusableWeekPatternApply';

async function loadActivePlanDetail(): Promise<{
  plan: Plan;
  planDays: PlanDay[];
  meals: PlannedMeal[];
}> {
  const plans = await planService.list();
  const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
  if (!active) throw new Error('No plan found.');
  const detail = await planService.getDetail(active.id);
  return { plan: active, planDays: detail.days, meals: detail.meals };
}

interface ApplyDayTemplatePanelProps {
  templateId: string;
  dirty?: boolean;
  saveBusy?: boolean;
  onApplied?: () => void | Promise<void>;
}

export function ApplyDayTemplatePanel({
  templateId,
  dirty = false,
  saveBusy = false,
  onApplied,
}: ApplyDayTemplatePanelProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [targetPlanDayId, setTargetPlanDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshTargetDetail = useCallback(async () => {
    const detail = await loadActivePlanDetail();
    setPlan(detail.plan);
    setPlanDays(detail.planDays);
    setMeals(detail.meals);
    setTargetPlanDayId((current) => {
      if (current && detail.planDays.some((day) => day.id === current)) return current;
      return detail.planDays[0]?.id ?? '';
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await loadActivePlanDetail();
        if (cancelled) return;
        setPlan(detail.plan);
        setPlanDays(detail.planDays);
        setMeals(detail.meals);
        setTargetPlanDayId(detail.planDays[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plan days.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyDisabledReason = reusableApplyDisabledReason({ dirty, saveBusy });
  const canApply = canApplyReusableSnapshot({ dirty, saveBusy });

  async function handleApply() {
    if (!plan || !targetPlanDayId || !canApply) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const targetHasMeals = meals.some((meal) => meal.plan_day_id === targetPlanDayId);
      const decision = resolveAppendConfirmDecision(
        targetHasMeals,
        targetHasMeals
          ? window.confirm(
              'This applies the template by appending meals to a day that already has planned meals. Continue?',
            )
          : false,
      );
      if (!decision.shouldProceed) return;

      await planService.instantiatePlanDayTemplate(
        templateId,
        buildInstantiateAppendBody(
          {
            plan_id: plan.id,
            target_plan_day_id: targetPlanDayId,
            apply_policy: 'append',
          },
          decision,
        ) as {
          plan_id: string;
          target_plan_day_id: string;
          apply_policy: 'append';
          allow_duplicate_append?: boolean;
        },
      );
      await refreshTargetDetail();
      setMessage('Template applied. Dated plan meals were appended without changing the template source.');
      await onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-white antialiased">Apply to a plan day</p>
        <p className="mt-0.5 text-[11px] text-white/45 antialiased">
          Creates fresh pending planned meals on the selected day. Existing dated plans are not rewritten.
        </p>
      </div>
      <select
        value={targetPlanDayId}
        onChange={(e) => setTargetPlanDayId(e.target.value)}
        disabled={busy || planDays.length === 0}
        className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
      >
        {planDays.map((day) => (
          <option key={day.id} value={day.id}>
            {day.date_local}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !targetPlanDayId || !canApply}
        onClick={handleApply}
        className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {busy ? 'Applying…' : 'Apply template'}
      </button>
      {applyDisabledReason ? (
        <p className="text-[11px] text-amber-200/90 antialiased">{applyDisabledReason}</p>
      ) : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
    </div>
  );
}

interface ApplyWeekPatternPanelProps {
  patternId: string;
  dirty?: boolean;
  saveBusy?: boolean;
  onApplied?: () => void | Promise<void>;
}

export function ApplyWeekPatternPanel({
  patternId,
  dirty = false,
  saveBusy = false,
  onApplied,
}: ApplyWeekPatternPanelProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [patternDayCount, setPatternDayCount] = useState(1);
  const [targetStartPlanDayId, setTargetStartPlanDayId] = useState('');
  const [applicationMode, setApplicationMode] = useState<WeekPatternApplicationMode>('once');
  const [repeatWeeks, setRepeatWeeks] = useState('1');
  const [untilDateLocal, setUntilDateLocal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshTargetDetail = useCallback(async () => {
    const detail = await loadActivePlanDetail();
    setPlan(detail.plan);
    setPlanDays(detail.planDays);
    setMeals(detail.meals);
    setTargetStartPlanDayId((current) => {
      if (current && detail.planDays.some((day) => day.id === current)) return current;
      return detail.planDays[0]?.id ?? '';
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [detail, pattern] = await Promise.all([
          loadActivePlanDetail(),
          planService.getPlanWeekPattern(patternId),
        ]);
        if (cancelled) return;
        setPlan(detail.plan);
        setPlanDays(detail.planDays);
        setMeals(detail.meals);
        setPatternDayCount(pattern.days.length);
        setTargetStartPlanDayId(detail.planDays[0]?.id ?? '');
        setUntilDateLocal(detail.planDays[detail.planDays.length - 1]?.date_local ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plan days.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patternId]);

  const applyDisabledReason = reusableApplyDisabledReason({ dirty, saveBusy });
  const canApply = canApplyReusableSnapshot({ dirty, saveBusy });

  async function handleApply() {
    if (!plan || !targetStartPlanDayId || !canApply) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const orderedDays = [...planDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
      const parsedRepeatWeeks = Number(repeatWeeks);
      const applicationPlan = computeWeekPatternApplicationPlan({
        orderedPlanDays: orderedDays,
        targetStartPlanDayId,
        patternDayCount,
        mode: applicationMode,
        repeatWeeks:
          applicationMode === 'repeat_weeks' && Number.isFinite(parsedRepeatWeeks)
            ? parsedRepeatWeeks
            : undefined,
        untilDateLocal: applicationMode === 'until_date' ? untilDateLocal : undefined,
      });
      if (!applicationPlan.plan) {
        throw new Error(applicationPlan.error ?? 'Could not plan pattern application.');
      }

      const spanIds = collectPlanDayIdsForApplicationPlan({
        orderedPlanDays: orderedDays,
        startPlanDayIds: applicationPlan.plan.startPlanDayIds,
        patternDayCount,
      });
      const targetHasMeals = meals.some((meal) => spanIds.includes(meal.plan_day_id));
      const decision = resolveAppendConfirmDecision(
        targetHasMeals,
        targetHasMeals
          ? window.confirm(
              applicationPlan.plan.spanCount > 1
                ? `This applies the pattern ${applicationPlan.plan.spanCount} times across days that may already have planned meals. Continue?`
                : 'This applies the pattern by appending meals to days that already have planned meals. Continue?',
            )
          : false,
      );
      if (!decision.shouldProceed) return;

      const result = await planService.instantiatePlanWeekPattern(
        patternId,
        buildInstantiateAppendBody(
          {
            plan_id: plan.id,
            target_start_plan_day_id: targetStartPlanDayId,
            apply_policy: 'append',
            application_mode: applicationMode,
            repeat_weeks:
              applicationMode === 'repeat_weeks' && Number.isFinite(parsedRepeatWeeks)
                ? parsedRepeatWeeks
                : undefined,
            until_date_local: applicationMode === 'until_date' ? untilDateLocal : undefined,
          },
          decision,
        ) as {
          plan_id: string;
          target_start_plan_day_id: string;
          apply_policy: 'append';
          allow_duplicate_append?: boolean;
          application_mode?: WeekPatternApplicationMode;
          repeat_weeks?: number;
          until_date_local?: string;
        },
      );
      await refreshTargetDetail();
      const applicationCount = result.application_count ?? 1;
      setMessage(
        applicationCount > 1
          ? `Week pattern applied ${applicationCount} times with append semantics.`
          : 'Week pattern applied with append semantics.',
      );
      await onApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-white antialiased">Apply to a plan week</p>
        <p className="mt-0.5 text-[11px] text-white/45 antialiased">
          Appends the pattern across contiguous plan days starting on the selected date.
        </p>
      </div>
      <select
        value={targetStartPlanDayId}
        onChange={(e) => setTargetStartPlanDayId(e.target.value)}
        disabled={busy || planDays.length === 0}
        className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
      >
        {planDays.map((day) => (
          <option key={day.id} value={day.id}>
            {day.date_local}
          </option>
        ))}
      </select>

      <div className="space-y-2">
        <label className="block text-[11px] uppercase tracking-wider text-white/40">
          Application
        </label>
        <select
          value={applicationMode}
          onChange={(e) => setApplicationMode(e.target.value as WeekPatternApplicationMode)}
          disabled={busy}
          className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
        >
          <option value="once">Once</option>
          <option value="repeat_weeks">Repeat for N pattern spans</option>
          <option value="until_date">Repeat through end date</option>
        </select>
        {applicationMode === 'repeat_weeks' ? (
          <input
            type="number"
            min={1}
            step={1}
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
            placeholder="Number of spans"
          />
        ) : null}
        {applicationMode === 'until_date' ? (
          <input
            type="date"
            value={untilDateLocal}
            onChange={(e) => setUntilDateLocal(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
          />
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy || !targetStartPlanDayId || !canApply}
        onClick={handleApply}
        className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {busy ? 'Applying…' : 'Apply pattern'}
      </button>
      {applyDisabledReason ? (
        <p className="text-[11px] text-amber-200/90 antialiased">{applyDisabledReason}</p>
      ) : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
    </div>
  );
}
