'use client';

/**
 * /journal/plans/day/[date] — Plans day view (Phase 2)
 *
 * Edits planned meals for a single plan_day. Supports:
 *   - Inline edit via SlotEditor (name/type/totals → recomputes NDS on
 *     the server)
 *   - Regenerate via AI (returns top + alternates; accept top = PATCH
 *     meals/:id with ai_replacement)
 *   - Remove meal
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { DayView } from '@/components/journal/plans/DayView';
import { SlotEditor } from '@/components/journal/plans/SlotEditor';
import { ScheduleConflictBanner } from '@/components/journal/plans/ScheduleConflictBanner';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanSlot,
  type PlannedMeal,
  type PlanDayTemplate,
  type PlanWeekPattern,
  type PlanInputSnapshot,
  type ScheduleConflict,
  type PlannedEatOutEvent,
  type MealReadinessResult,
} from '@/lib/plans';
import type {
  AiSubstitutionResponse,
} from '@/lib/plans/validators';

export default function JournalPlanDayPage() {
  const router = useRouter();
  const { date, planId } = router.query as { date?: string; planId?: string };

  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [planSlots, setPlanSlots] = useState<PlanSlot[]>([]);
  const [day, setDay] = useState<PlanDay | null>(null);
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [allPlanMeals, setAllPlanMeals] = useState<PlannedMeal[]>([]);
  const [eatOutEvents, setEatOutEvents] = useState<PlannedEatOutEvent[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<PlanInputSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readinessMap, setReadinessMap] = useState<Record<string, MealReadinessResult> | undefined>(undefined);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [creatingSlotId, setCreatingSlotId] = useState<string | null>(null);
  const [regenResult, setRegenResult] = useState<{
    mealId: string;
    top: AiSubstitutionResponse;
    alternates: AiSubstitutionResponse[];
  } | null>(null);
  const [movingMealId, setMovingMealId] = useState<string | null>(null);
  const [moveTargetSlotId, setMoveTargetSlotId] = useState<string>('');
  const [copyingMealId, setCopyingMealId] = useState<string | null>(null);
  const [copyTargetSlotId, setCopyTargetSlotId] = useState<string>('');
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateTargetDayId, setTemplateTargetDayId] = useState('');
  const [weekPatterns, setWeekPatterns] = useState<PlanWeekPattern[]>([]);
  const [weekPatternName, setWeekPatternName] = useState('');
  const [selectedWeekPatternId, setSelectedWeekPatternId] = useState('');
  const [weekPatternTargetStartDayId, setWeekPatternTargetStartDayId] = useState('');

  const fetchedRef = useRef(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const regenRef = useRef<HTMLDivElement | null>(null);

  // Scroll the inline editor / regen result into view when either opens.
  // Without this, users click Edit or Regenerate and the new UI renders
  // below the fold on the day page, making it look like "nothing happened".
  useEffect(() => {
    if ((editingMealId || creatingSlotId) && editorRef.current) {
      editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingMealId, creatingSlotId]);
  useEffect(() => {
    if (regenResult && regenRef.current) {
      regenRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [regenResult]);

  const resolvedPlanId = useMemo(() => {
    if (typeof planId === 'string' && planId.length > 0) return planId;
    return null;
  }, [planId]);

  const refresh = useCallback(async () => {
    if (!resolvedPlanId || !date) return;
    const [detail, dayRes, snapRes, templateRes, weekPatternRes] = await Promise.all([
      planService.getDetail(resolvedPlanId),
      fetch(
        `/api/journal/plans/${resolvedPlanId}/days/${date}`,
        { credentials: 'include' },
      ).then((r) => {
        if (!r.ok) throw new Error(`Failed to load day: ${r.status}`);
        return r.json() as Promise<{
          day: PlanDay;
          slots: PlanSlot[];
          meals: PlannedMeal[];
          eat_out_events?: PlannedEatOutEvent[];
        }>;
      }),
      planService.getLiveSnapshot().catch(() => null),
      planService.listPlanDayTemplates().catch(() => []),
      planService.listPlanWeekPatterns().catch(() => []),
    ]);
    setPlan(detail.plan);
    setPlanDays(detail.days);
    setPlanSlots(detail.slots);
    setAllPlanMeals(detail.meals);
    setDay(dayRes.day);
    setSlots(dayRes.slots);
    setMeals(dayRes.meals);
    setEatOutEvents(dayRes.eat_out_events ?? []);
    setTemplates(templateRes);
    setWeekPatterns(weekPatternRes);
    setTemplateTargetDayId((current) => current || dayRes.day.id);
    setWeekPatternTargetStartDayId((current) => current || dayRes.day.id);
    if (snapRes) setLiveSnapshot(snapRes.snapshot);

    // Packet 38 — Fetch readiness in parallel with the main load.
    // Fire and forget: readiness is a non-blocking secondary signal.
    // If no grocery list exists the response has has_list:false and
    // readiness:{}, so no badge is shown (honest absence of signal).
    const mealIds = (dayRes.meals ?? []).map((m: PlannedMeal) => m.id);
    if (mealIds.length > 0) {
      planService.getMealReadiness(resolvedPlanId, date, mealIds)
        .then(({ readiness }) => setReadinessMap(readiness))
        .catch(() => {/* silently ignore — readiness is a non-critical enhancement */});
    } else {
      setReadinessMap(undefined);
    }
  }, [resolvedPlanId, date]);

  useEffect(() => {
    if (fetchedRef.current) return;
    if (!resolvedPlanId || !date) return;
    fetchedRef.current = true;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load day.');
      } finally {
        setLoading(false);
      }
    })();
  }, [resolvedPlanId, date, refresh]);

  const handleRegenerate = useCallback(
    async (meal: PlannedMeal) => {
      setBusy(true);
      setError(null);
      try {
        const res = await planService.regenerateSlot({ planned_meal_id: meal.id });
        setRegenResult({ mealId: meal.id, top: res.top, alternates: res.alternates });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Regenerate failed.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleAcceptRegen = useCallback(
    async (mealId: string, sub: AiSubstitutionResponse) => {
      setBusy(true);
      setError(null);
      try {
        await planService.replaceMeal(mealId, sub.replacement_meal);
        setRegenResult(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Replace failed.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleEdit = useCallback((meal: PlannedMeal) => {
    setCreatingSlotId(null);
    setMovingMealId(null);
    setCopyingMealId(null);
    setEditingMealId(meal.id);
  }, []);

  const handleAdd = useCallback((slot: PlanSlot) => {
    setEditingMealId(null);
    setMovingMealId(null);
    setCopyingMealId(null);
    setCreatingSlotId(slot.id);
  }, []);

  const handleMove = useCallback((meal: PlannedMeal) => {
    setEditingMealId(null);
    setCreatingSlotId(null);
    setCopyingMealId(null);
    setRegenResult(null);
    setMovingMealId(meal.id);
    setMoveTargetSlotId(meal.plan_slot_id ?? '');
  }, []);

  const handleCopy = useCallback((meal: PlannedMeal) => {
    setEditingMealId(null);
    setCreatingSlotId(null);
    setMovingMealId(null);
    setRegenResult(null);
    setCopyingMealId(meal.id);
    setCopyTargetSlotId('');
  }, []);

  const handleEditTime = useCallback(
    async (slot: PlanSlot, target_time: string | null) => {
      setBusy(true);
      setError(null);
      try {
        await planService.updateSlot(slot.id, { target_time });
        setSlots((prev) =>
          prev.map((s) => (s.id === slot.id ? { ...s, target_time } : s)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Time update failed.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleApplyConflict = useCallback(
    async (c: ScheduleConflict) => {
      if (!liveSnapshot?.schedule_snapshot) return;
      setBusy(true);
      setError(null);
      try {
        await planService.applyScheduleSuggestion(
          liveSnapshot.schedule_snapshot.profile_schedule,
          c,
        );
        const next = await planService.getLiveSnapshot();
        setLiveSnapshot(next.snapshot);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply suggestion.');
      } finally {
        setBusy(false);
      }
    },
    [liveSnapshot],
  );

  const handleRemove = useCallback(
    async (meal: PlannedMeal) => {
      setBusy(true);
      setError(null);
      try {
        await planService.deleteMeal(meal.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Remove failed.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleConfirmMove = useCallback(
    async () => {
      if (!movingMealId || !moveTargetSlotId) return;
      const targetSlot = planSlots.find((s) => s.id === moveTargetSlotId);
      if (!targetSlot) {
        setError('Choose a destination slot.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await planService.moveMeal(movingMealId, {
          target_plan_day_id: targetSlot.plan_day_id,
          target_plan_slot_id: targetSlot.id,
        });
        const targetDay = planDays.find((d) => d.id === targetSlot.plan_day_id);
        if (targetDay && targetDay.date_local !== date && plan) {
          await router.push(`/journal/plans/day/${targetDay.date_local}?planId=${plan.id}`);
          return;
        }
        setMovingMealId(null);
        setMoveTargetSlotId('');
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Move failed.');
      } finally {
        setBusy(false);
      }
    },
    [date, movingMealId, moveTargetSlotId, plan, planDays, planSlots, refresh, router],
  );

  const handleConfirmCopy = useCallback(
    async () => {
      if (!copyingMealId || !copyTargetSlotId) return;
      const targetSlot = planSlots.find((s) => s.id === copyTargetSlotId);
      if (!targetSlot) {
        setError('Choose a destination slot.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await planService.copyMeal(copyingMealId, {
          target_plan_day_id: targetSlot.plan_day_id,
          target_plan_slot_id: targetSlot.id,
        });
        const targetDay = planDays.find((d) => d.id === targetSlot.plan_day_id);
        if (targetDay && targetDay.date_local !== date && plan) {
          await router.push(`/journal/plans/day/${targetDay.date_local}?planId=${plan.id}`);
          return;
        }
        setCopyingMealId(null);
        setCopyTargetSlotId('');
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Copy failed.');
      } finally {
        setBusy(false);
      }
    },
    [copyingMealId, copyTargetSlotId, date, plan, planDays, planSlots, refresh, router],
  );

  const handleSaveDayTemplate = useCallback(
    async () => {
      if (!plan || !day) return;
      setBusy(true);
      setError(null);
      try {
        const template = await planService.savePlanDayTemplate({
          plan_id: plan.id,
          plan_day_id: day.id,
          name: templateName,
        });
        setTemplates((prev) => [template, ...prev.filter((t) => t.id !== template.id)]);
        setSelectedTemplateId(template.id);
        setTemplateName('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save template failed.');
      } finally {
        setBusy(false);
      }
    },
    [day, plan, templateName],
  );

  const handleInstantiateTemplate = useCallback(
    async () => {
      const effectiveTargetDayId = templateTargetDayId || day?.id || '';
      if (!plan || !selectedTemplateId || !effectiveTargetDayId) return;
      setBusy(true);
      setError(null);
      try {
        const targetHasMeals = allPlanMeals.some(
          (meal) => meal.plan_day_id === effectiveTargetDayId,
        );
        const allowDuplicateAppend = targetHasMeals
          ? window.confirm(
              'This applies the template by appending meals to a day that already has planned meals. Continue?',
            )
          : true;
        if (!allowDuplicateAppend) return;
        await planService.instantiatePlanDayTemplate(selectedTemplateId, {
          plan_id: plan.id,
          target_plan_day_id: effectiveTargetDayId,
          apply_policy: 'append',
          allow_duplicate_append: allowDuplicateAppend,
        });
        const targetDay = planDays.find((d) => d.id === effectiveTargetDayId);
        if (targetDay && targetDay.date_local !== date) {
          await router.push(`/journal/plans/day/${targetDay.date_local}?planId=${plan.id}`);
          return;
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Apply template failed.');
      } finally {
        setBusy(false);
      }
    },
    [allPlanMeals, date, day, plan, planDays, refresh, router, selectedTemplateId, templateTargetDayId],
  );

  const handleSaveWeekPattern = useCallback(
    async () => {
      if (!plan || planDays.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        const sourcePlanDayIds = [...planDays]
          .sort((a, b) => a.date_local.localeCompare(b.date_local))
          .map((planDay) => planDay.id);
        const pattern = await planService.savePlanWeekPattern({
          plan_id: plan.id,
          source_plan_day_ids: sourcePlanDayIds,
          name: weekPatternName,
        });
        setWeekPatterns((prev) => [pattern, ...prev.filter((p) => p.id !== pattern.id)]);
        setSelectedWeekPatternId(pattern.id);
        setWeekPatternName('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save week pattern failed.');
      } finally {
        setBusy(false);
      }
    },
    [plan, planDays, weekPatternName],
  );

  const handleInstantiateWeekPattern = useCallback(
    async () => {
      const effectiveTargetDayId = weekPatternTargetStartDayId || day?.id || '';
      const pattern = weekPatterns.find((p) => p.id === selectedWeekPatternId) ?? null;
      if (!plan || !pattern || !effectiveTargetDayId) return;

      const sortedDays = [...planDays].sort((a, b) => a.date_local.localeCompare(b.date_local));
      const startIndex = sortedDays.findIndex((planDay) => planDay.id === effectiveTargetDayId);
      if (startIndex < 0) {
        setError('Choose a target start day.');
        return;
      }
      if (startIndex + pattern.days.length > sortedDays.length) {
        setError('This plan does not have enough contiguous days for that pattern.');
        return;
      }
      const targetDays = sortedDays.slice(startIndex, startIndex + pattern.days.length);
      const targetDayIds = new Set(targetDays.map((planDay) => planDay.id));
      const existingMealCount = allPlanMeals.filter((meal) =>
        targetDayIds.has(meal.plan_day_id),
      ).length;
      const allowDuplicateAppend = existingMealCount > 0
        ? window.confirm(
            `This will append ${pattern.name} across ${targetDays.length} day(s). ` +
            `The target span already has ${existingMealCount} planned meal(s). Continue?`,
          )
        : true;
      if (!allowDuplicateAppend) return;

      setBusy(true);
      setError(null);
      try {
        await planService.instantiatePlanWeekPattern(pattern.id, {
          plan_id: plan.id,
          target_start_plan_day_id: effectiveTargetDayId,
          apply_policy: 'append',
          allow_duplicate_append: allowDuplicateAppend,
        });
        const firstTargetDay = targetDays[0];
        if (firstTargetDay && firstTargetDay.date_local !== date) {
          await router.push(`/journal/plans/day/${firstTargetDay.date_local}?planId=${plan.id}`);
          return;
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Apply week pattern failed.');
      } finally {
        setBusy(false);
      }
    },
    [
      allPlanMeals,
      date,
      day,
      plan,
      planDays,
      refresh,
      router,
      selectedWeekPatternId,
      weekPatternTargetStartDayId,
      weekPatterns,
    ],
  );

  const handleExecute = useCallback(
    async (meal: PlannedMeal, action: 'eat' | 'skip' | 'undo') => {
      setBusy(true);
      setError(null);
      try {
        // Provide occurred_at as noon on the plan day so the journal
        // entry lands on the correct date regardless of server timezone.
        const occurred_at = action === 'eat' && date
          ? `${date}T12:00:00.000Z`
          : undefined;
        await planService.executeMeal(meal.id, action, occurred_at);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setBusy(false);
      }
    },
    [refresh, date],
  );

  const handleSaveEdit = useCallback(
    async (meal: PlannedMeal, patch: {
      name: string;
      meal_type: PlannedMeal['meal_type'];
      payload: PlannedMeal['payload'];
    }) => {
      setBusy(true);
      setError(null);
      try {
        await planService.updateMeal(meal.id, patch);
        setEditingMealId(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleSaveCreate = useCallback(
    async (
      slot: PlanSlot,
      patch: {
        name: string;
        meal_type: PlannedMeal['meal_type'];
        payload: PlannedMeal['payload'];
      },
    ) => {
      if (!plan || !day) return;
      setBusy(true);
      setError(null);
      try {
        await planService.createMeal({
          plan_id: plan.id,
          plan_day_id: day.id,
          plan_slot_id: slot.id,
          name: patch.name,
          meal_type: patch.meal_type,
          payload: patch.payload,
        });
        setCreatingSlotId(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Add failed.');
      } finally {
        setBusy(false);
      }
    },
    [plan, day, refresh],
  );

  const editingMeal = useMemo(
    () => meals.find((m) => m.id === editingMealId) ?? null,
    [meals, editingMealId],
  );

  const movingMeal = useMemo(
    () => meals.find((m) => m.id === movingMealId) ?? null,
    [meals, movingMealId],
  );

  const copyingMeal = useMemo(
    () => meals.find((m) => m.id === copyingMealId) ?? null,
    [meals, copyingMealId],
  );

  const creatingSlot = useMemo(
    () => slots.find((s) => s.id === creatingSlotId) ?? null,
    [slots, creatingSlotId],
  );

  const moveSlotOptions = useMemo(() => {
    const dayById = new Map(planDays.map((d) => [d.id, d]));
    return [...planSlots]
      .sort((a, b) => {
        const da = dayById.get(a.plan_day_id)?.date_local ?? '';
        const db = dayById.get(b.plan_day_id)?.date_local ?? '';
        if (da !== db) return da.localeCompare(db);
        return a.slot_ordinal - b.slot_ordinal;
      })
      .map((slot) => {
        const slotDay = dayById.get(slot.plan_day_id);
        const label = slot.slot_label ??
          (slot.slot_block
            ? slot.slot_block.charAt(0).toUpperCase() + slot.slot_block.slice(1)
            : `Slot ${slot.slot_ordinal + 1}`);
        return {
          slot,
          label: `${slotDay?.date_local ?? 'Unknown day'} · ${label}${slot.target_time ? ` · ${slot.target_time}` : ''}`,
        };
      });
  }, [planDays, planSlots]);

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <Link
            href="/journal/plans"
            className="text-xs text-white/50 hover:text-white/80 antialiased"
          >
            ← Week view
          </Link>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6">
          {loading ? (
            <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
              <div className="h-4 w-32 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-48 bg-white/[0.06] rounded" />
            </div>
          ) : day && plan ? (
            <>
              {liveSnapshot?.schedule_snapshot?.conflicts &&
                liveSnapshot.schedule_snapshot.conflicts.length > 0 && (
                  <div className="mb-4">
                    <ScheduleConflictBanner
                      conflicts={liveSnapshot.schedule_snapshot.conflicts}
                      onApply={handleApplyConflict}
                      busy={busy}
                    />
                  </div>
                )}
              <DayView
                day={day}
                slots={slots}
                meals={meals}
                eatOutEvents={eatOutEvents}
                editingMealId={editingMealId}
                creatingSlotId={creatingSlotId}
                onRegenerate={handleRegenerate}
                onEdit={handleEdit}
                onRemove={handleRemove}
                onMove={handleMove}
                onCopy={handleCopy}
                onAdd={handleAdd}
                onEditTime={handleEditTime}
                busy={busy}
                readinessMap={readinessMap}
                groceryHref={`/journal/plans/grocery/${plan.id}?date=${date}`}
                onExecute={handleExecute}
                dayDate={typeof date === 'string' ? date : undefined}
              />

              <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white antialiased">
                    Day templates
                  </p>
                  <p className="text-[11px] text-white/45 antialiased mt-0.5">
                    Save this day as reusable structure, including unassigned meals.
                    Templates append fresh pending meals when applied.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder={`Template from ${day.date_local}`}
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
                  />
                  <button
                    type="button"
                    disabled={busy || meals.length === 0}
                    onClick={handleSaveDayTemplate}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-xs font-medium text-denim-200 antialiased transition-colors"
                  >
                    Save day
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={busy || templates.length === 0}
                    className="rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-xs text-white antialiased focus:outline-none focus:border-denim-400"
                  >
                    <option value="">Choose template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.source_date_local}
                      </option>
                    ))}
                  </select>
                  <select
                    value={templateTargetDayId || day.id}
                    onChange={(e) => setTemplateTargetDayId(e.target.value)}
                    disabled={busy || templates.length === 0}
                    className="rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-xs text-white antialiased focus:outline-none focus:border-denim-400"
                  >
                    {planDays.map((planDay) => (
                      <option key={planDay.id} value={planDay.id}>
                        {planDay.date_local}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !selectedTemplateId}
                    onClick={handleInstantiateTemplate}
                    className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] disabled:bg-white/[0.04] disabled:text-white/30 text-xs font-medium text-white/75 antialiased transition-colors"
                  >
                    Append
                  </button>
                </div>

                {templates.length === 0 && (
                  <p className="text-[10px] text-white/30 antialiased">
                    No saved day templates yet.
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white antialiased">
                    Week patterns
                  </p>
                  <p className="text-[11px] text-white/45 antialiased mt-0.5">
                    Save the current plan range as a reusable multi-day pattern.
                    Applying a pattern appends fresh pending meals across contiguous days.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={weekPatternName}
                    onChange={(e) => setWeekPatternName(e.target.value)}
                    placeholder={
                      planDays.length > 0
                        ? `Pattern ${planDays[0]?.date_local} to ${planDays[planDays.length - 1]?.date_local}`
                        : 'Week pattern'
                    }
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
                  />
                  <button
                    type="button"
                    disabled={busy || planDays.length === 0 || allPlanMeals.length === 0}
                    onClick={handleSaveWeekPattern}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-xs font-medium text-denim-200 antialiased transition-colors"
                  >
                    Save pattern
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <select
                    value={selectedWeekPatternId}
                    onChange={(e) => setSelectedWeekPatternId(e.target.value)}
                    disabled={busy || weekPatterns.length === 0}
                    className="rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-xs text-white antialiased focus:outline-none focus:border-denim-400"
                  >
                    <option value="">Choose pattern</option>
                    {weekPatterns.map((pattern) => (
                      <option key={pattern.id} value={pattern.id}>
                        {pattern.name} · {pattern.days.length} day{pattern.days.length === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                  <select
                    value={weekPatternTargetStartDayId || day.id}
                    onChange={(e) => setWeekPatternTargetStartDayId(e.target.value)}
                    disabled={busy || weekPatterns.length === 0}
                    className="rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-xs text-white antialiased focus:outline-none focus:border-denim-400"
                  >
                    {planDays.map((planDay) => (
                      <option key={planDay.id} value={planDay.id}>
                        Start {planDay.date_local}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !selectedWeekPatternId}
                    onClick={handleInstantiateWeekPattern}
                    className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.10] disabled:bg-white/[0.04] disabled:text-white/30 text-xs font-medium text-white/75 antialiased transition-colors"
                  >
                    Append range
                  </button>
                </div>

                {weekPatterns.length === 0 && (
                  <p className="text-[10px] text-white/30 antialiased">
                    No saved week patterns yet.
                  </p>
                )}
              </div>

              {/* Packet 37 — Shopping list entry point. Only shown when
                  there are planned meals on this day; avoids a misleading
                  link to an empty grocery list on days with no meals. */}
              {meals.length > 0 && (
                <div className="mt-4">
                  <Link
                    href={`/journal/plans/grocery/${plan.id}?date=${date}`}
                    className="flex items-center justify-between w-full rounded-2xl bg-white/[0.04] hover:bg-white/[0.06] transition-colors px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white antialiased">
                        Shopping list
                      </p>
                      <p className="text-[11px] text-white/40 antialiased mt-0.5">
                        Grocery items from today&apos;s planned meals
                      </p>
                    </div>
                    <span className="text-white/30 text-sm">→</span>
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-white/[0.04] p-5">
              <p className="text-sm text-white/60 antialiased">
                Day not found. Open a plan from the{' '}
                <Link href="/journal/plans" className="text-denim-400">week view</Link>.
              </p>
            </div>
          )}

          {editingMeal && (
            <div ref={editorRef} className="mt-4">
              <SlotEditor
                meal={editingMeal}
                onSave={(patch) => handleSaveEdit(editingMeal, patch)}
                onCancel={() => setEditingMealId(null)}
                busy={busy}
              />
            </div>
          )}

          {creatingSlot && (
            <div ref={editorRef} className="mt-4">
              <SlotEditor
                mode="create"
                slot={creatingSlot}
                onSave={(patch) => handleSaveCreate(creatingSlot, patch)}
                onCancel={() => setCreatingSlotId(null)}
                busy={busy}
              />
            </div>
          )}

          {movingMeal && (
            <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-white antialiased">
                  Move planned meal
                </p>
                <p className="text-xs text-white/45 antialiased mt-0.5">
                  Move {movingMeal.name ?? 'this meal'} to another slot. Its identity and provenance stay intact.
                </p>
              </div>
              <select
                value={moveTargetSlotId}
                onChange={(e) => setMoveTargetSlotId(e.target.value)}
                disabled={busy}
                className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
              >
                <option value="">Choose destination</option>
                {moveSlotOptions.map(({ slot, label }) => (
                  <option key={slot.id} value={slot.id}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !moveTargetSlotId}
                  onClick={handleConfirmMove}
                  className="px-3 py-1.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-xs font-medium text-denim-200 antialiased transition-colors"
                >
                  Move meal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMovingMealId(null);
                    setMoveTargetSlotId('');
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] disabled:text-white/30 text-xs font-medium text-white/60 antialiased transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {copyingMeal && (
            <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-white antialiased">
                  Copy planned meal
                </p>
                <p className="text-xs text-white/45 antialiased mt-0.5">
                  Copy {copyingMeal.name ?? 'this meal'} to another slot as a new pending meal. Source history stays unchanged.
                </p>
              </div>
              <select
                value={copyTargetSlotId}
                onChange={(e) => setCopyTargetSlotId(e.target.value)}
                disabled={busy}
                className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
              >
                <option value="">Choose destination</option>
                {moveSlotOptions.map(({ slot, label }) => (
                  <option key={slot.id} value={slot.id}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !copyTargetSlotId}
                  onClick={handleConfirmCopy}
                  className="px-3 py-1.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-xs font-medium text-denim-200 antialiased transition-colors"
                >
                  Copy meal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCopyingMealId(null);
                    setCopyTargetSlotId('');
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] disabled:text-white/30 text-xs font-medium text-white/60 antialiased transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {regenResult && (
            <div
              ref={regenRef}
              className="mt-4 rounded-2xl bg-white/[0.04] p-4 space-y-3"
            >
              <p className="text-sm font-semibold text-white antialiased">
                Suggested swaps
              </p>
              <div className="space-y-2">
                {[regenResult.top, ...regenResult.alternates].map((sub, i) => (
                  <div
                    key={sub.replacement_meal.name + i}
                    className="rounded-xl bg-white/[0.04] p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white antialiased truncate">
                        {sub.replacement_meal.name}
                      </p>
                      <p className="text-[11px] text-white/50 antialiased mt-0.5">
                        ΔNDS{' '}
                        {sub.nds_delta.delta_nds_100_estimate !== null
                          ? sub.nds_delta.delta_nds_100_estimate.toFixed(1)
                          : '—'}{' '}
                        · PS {sub.replacement_meal.protein_score_10?.toFixed(1) ?? '—'}/10
                        · {sub.replacement_meal.nds_confidence} confidence
                      </p>
                      {sub.rationale_md && (
                        <p className="text-[11px] text-white/40 antialiased mt-1">
                          {sub.rationale_md}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAcceptRegen(regenResult.mealId, sub)}
                      className="shrink-0 px-3 py-1.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-xs font-medium text-denim-200 antialiased transition-colors"
                    >
                      {i === 0 ? 'Use top' : 'Use'}
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRegenResult(null)}
                className="text-xs text-white/50 hover:text-white/80 antialiased"
              >
                Dismiss
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-xs text-red-200 antialiased">{error}</p>
            </div>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
