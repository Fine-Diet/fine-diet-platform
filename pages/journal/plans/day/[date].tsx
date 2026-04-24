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
  const [day, setDay] = useState<PlanDay | null>(null);
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
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
    const [detail, dayRes, snapRes] = await Promise.all([
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
    ]);
    setPlan(detail.plan);
    setDay(dayRes.day);
    setSlots(dayRes.slots);
    setMeals(dayRes.meals);
    setEatOutEvents(dayRes.eat_out_events ?? []);
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
    setEditingMealId(meal.id);
  }, []);

  const handleAdd = useCallback((slot: PlanSlot) => {
    setEditingMealId(null);
    setCreatingSlotId(slot.id);
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

  const creatingSlot = useMemo(
    () => slots.find((s) => s.id === creatingSlotId) ?? null,
    [slots, creatingSlotId],
  );

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
                onAdd={handleAdd}
                onEditTime={handleEditTime}
                busy={busy}
                readinessMap={readinessMap}
                groceryHref={`/journal/plans/grocery/${plan.id}?date=${date}`}
                onExecute={handleExecute}
                dayDate={typeof date === 'string' ? date : undefined}
              />

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
