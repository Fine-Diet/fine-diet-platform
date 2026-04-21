'use client';

/**
 * /journal/plans — Plans week workbench (Phase 2)
 *
 * Replaces the pre-Phase-2 summary dashboard. Shows the active plan's
 * projected week, profile defaults banner, and generate/regenerate
 * actions. The summary modules from the old dashboard have been folded
 * into /journal/home where relevant.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { WeekViewPanel } from '@/components/journal/plans/WeekViewPanel';
import ActiveProgramChip from '@/components/journal/programs/ActiveProgramChip';
import {
  planService,
  type Plan,
  type PlanDay,
  type PlanSlot,
  type PlannedMeal,
  type PlanInputSnapshot,
  type PlanDisplayPrefs,
  type ScheduleConflict,
} from '@/lib/plans';

function todayLocalKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function deriveMissingReasons(snapshot: PlanInputSnapshot | null): {
  canGenerate: boolean;
  reasons: string[];
} {
  if (!snapshot) return { canGenerate: false, reasons: ['Profile not loaded yet.'] };
  const reasons: string[] = [];
  if (snapshot.body.age_years === null) {
    reasons.push('Add your date of birth in Profile.');
  } else if (snapshot.body.age_years < 18) {
    reasons.push('Plans are currently 18+.');
  }
  if (snapshot.body.weight_kg === null) {
    reasons.push('Add your current weight in Profile.');
  }
  if (snapshot.body.height_cm === null) {
    reasons.push('Add your height in Profile.');
  }
  if (snapshot.body.sex === null) {
    reasons.push('Set your biological sex in Profile.');
  }
  return { canGenerate: reasons.length === 0, reasons };
}

export default function JournalPlansIndexPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDay[]>([]);
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<PlanInputSnapshot | null>(null);
  const [display, setDisplay] = useState<PlanDisplayPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Always prefer the LIVE snapshot for banner/gate decisions so profile
  // edits (DOB, height, weight, units) are reflected immediately. Fall
  // back to the plan's frozen snapshot only if the live fetch fails.
  const snapshot: PlanInputSnapshot | null = useMemo(() => {
    if (liveSnapshot) return liveSnapshot;
    return (plan?.input_snapshot_json as PlanInputSnapshot | undefined) ?? null;
  }, [liveSnapshot, plan]);
  const { canGenerate, reasons } = useMemo(
    () => deriveMissingReasons(snapshot),
    [snapshot],
  );
  const conflicts: ScheduleConflict[] = useMemo(
    () => snapshot?.schedule_snapshot?.conflicts ?? [],
    [snapshot],
  );
  const [busy, setBusy] = useState(false);

  async function handleApplyConflict(c: ScheduleConflict) {
    if (!liveSnapshot?.schedule_snapshot) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await planService.applyScheduleSuggestion(
        liveSnapshot.schedule_snapshot.profile_schedule,
        c,
      );
      // Refetch the live snapshot so the resolver reruns with the new
      // schedule and conflicts recompute. Profile truth is the source.
      const next = await planService.getLiveSnapshot();
      setLiveSnapshot(next.snapshot);
      setDisplay(next.display);
      // Log the mutated schedule for debugging; UI is driven by snapshot.
      void updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply suggestion.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        // Fetch live snapshot + plans list in parallel. Banner should
        // render real profile values even before/without an active plan.
        const [snapRes, list] = await Promise.all([
          planService.getLiveSnapshot().catch(() => null),
          planService.list(),
        ]);
        if (snapRes) {
          setLiveSnapshot(snapRes.snapshot);
          setDisplay(snapRes.display);
        }
        const active = list.find((p) => p.status === 'active') ?? list[0] ?? null;
        if (!active) {
          setLoading(false);
          return;
        }
        const detail = await planService.getDetail(active.id);
        setPlan(detail.plan);
        setDays(detail.days);
        setSlots(detail.slots);
        setMeals(detail.meals);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plans.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const detail = await planService.generate({
        plan_shape: 'week',
        start_date: todayLocalKey(),
      });
      setPlan(detail.plan);
      setDays(detail.days);
      setSlots(detail.slots);
      setMeals(detail.meals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="w-full max-w-[650px] mx-auto px-5 pt-14 pb-2">
          <h1 className="text-2xl font-semibold antialiased">Plans</h1>
          <p className="text-sm text-white/50 antialiased mt-0.5">
            Forward-looking execution workbench. Projected NDS, editable
            slots, AI-backed swaps.
          </p>
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-4">
          <ActiveProgramChip detailHref="/journal/programs" />
        </div>

        <div className="w-full max-w-[650px] mx-auto px-5 mt-6">
          {loading ? (
            <div className="rounded-2xl bg-white/[0.04] p-5 animate-pulse">
              <div className="h-4 w-32 bg-white/[0.06] rounded mb-3" />
              <div className="h-3 w-48 bg-white/[0.06] rounded" />
            </div>
          ) : (
            <WeekViewPanel
              plan={plan}
              days={days}
              slots={slots}
              meals={meals}
              snapshot={snapshot}
              display={display}
              canGenerate={canGenerate}
              missingReasons={reasons}
              onGenerate={handleGenerate}
              generating={generating}
              conflicts={conflicts}
              onApplyConflict={handleApplyConflict}
              busy={busy}
            />
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
