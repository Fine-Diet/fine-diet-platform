'use client';

import { useEffect, useState } from 'react';

import { planService, type Plan, type PlanDay, type PlannedMeal } from '@/lib/plans';

interface ApplyDayTemplatePanelProps {
  templateId: string;
  onApplied?: () => void | Promise<void>;
}

export function ApplyDayTemplatePanel({ templateId, onApplied }: ApplyDayTemplatePanelProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [targetPlanDayId, setTargetPlanDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plans = await planService.list();
        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        if (!active || cancelled) return;
        setPlan(active);
        const detail = await planService.getDetail(active.id);
        if (cancelled) return;
        setPlanDays(detail.days);
        setMeals(detail.meals);
        setTargetPlanDayId(detail.days[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plan days.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleApply() {
    if (!plan || !targetPlanDayId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const targetHasMeals = meals.some((meal) => meal.plan_day_id === targetPlanDayId);
      const allowDuplicateAppend = targetHasMeals
        ? window.confirm(
            'This applies the template by appending meals to a day that already has planned meals. Continue?',
          )
        : true;
      if (!allowDuplicateAppend) return;
      await planService.instantiatePlanDayTemplate(templateId, {
        plan_id: plan.id,
        target_plan_day_id: targetPlanDayId,
        apply_policy: 'append',
        allow_duplicate_append: allowDuplicateAppend,
      });
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
        disabled={busy || !targetPlanDayId}
        onClick={handleApply}
        className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {busy ? 'Applying…' : 'Apply template'}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
    </div>
  );
}

interface ApplyWeekPatternPanelProps {
  patternId: string;
  onApplied?: () => void | Promise<void>;
}

export function ApplyWeekPatternPanel({ patternId, onApplied }: ApplyWeekPatternPanelProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [targetStartPlanDayId, setTargetStartPlanDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plans = await planService.list();
        const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
        if (!active || cancelled) return;
        setPlan(active);
        const detail = await planService.getDetail(active.id);
        if (cancelled) return;
        setPlanDays(detail.days);
        setMeals(detail.meals);
        setTargetStartPlanDayId(detail.days[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plan days.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleApply() {
    if (!plan || !targetStartPlanDayId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const pattern = await planService.getPlanWeekPattern(patternId);
      const orderedDays = [...planDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
      const startIndex = orderedDays.findIndex((day) => day.id === targetStartPlanDayId);
      const spanIds =
        startIndex >= 0
          ? orderedDays.slice(startIndex, startIndex + pattern.days.length).map((day) => day.id)
          : [];
      const targetHasMeals = meals.some((meal) => spanIds.includes(meal.plan_day_id));
      const allowDuplicateAppend = targetHasMeals
        ? window.confirm(
            'This applies the pattern by appending meals to days that already have planned meals. Continue?',
          )
        : true;
      if (!allowDuplicateAppend) return;
      await planService.instantiatePlanWeekPattern(patternId, {
        plan_id: plan.id,
        target_start_plan_day_id: targetStartPlanDayId,
        apply_policy: 'append',
        allow_duplicate_append: allowDuplicateAppend,
      });
      setMessage('Week pattern applied with append semantics.');
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
      <button
        type="button"
        disabled={busy || !targetStartPlanDayId}
        onClick={handleApply}
        className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {busy ? 'Applying…' : 'Apply pattern'}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
    </div>
  );
}
