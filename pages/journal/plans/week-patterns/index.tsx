'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { planService, type Plan, type PlanDay, type PlanWeekPattern } from '@/lib/plans';
import { countPatternMeals } from '@/lib/plans/reusableAuthoringHelpers';
import {
  assertContiguousDateKeys,
  CONTIGUOUS_PLAN_DAYS_ERROR,
} from '@/lib/plans/reusableContiguousDays';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const MAX_WIDTH = 'max-w-[750px]';

export default function WeekPatternsPage() {
  const router = useRouter();
  const [patterns, setPatterns] = useState<PlanWeekPattern[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedDayIds, setSelectedDayIds] = useState<string[]>([]);
  const [blankDayCount, setBlankDayCount] = useState('7');
  const [blankName, setBlankName] = useState('');

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [rows, plans] = await Promise.all([
        planService.listPlanWeekPatterns(),
        planService.list(),
      ]);
      setPatterns(rows);
      const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
      setPlan(active);
      if (active) {
        const detail = await planService.getDetail(active.id);
        setPlanDays(detail.days);
        setSelectedDayIds(detail.days.slice(0, 7).map((day) => day.id));
      }
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load week patterns.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreateBlank() {
    const dayCount = Number(blankDayCount);
    if (!Number.isInteger(dayCount) || dayCount < 1) {
      setError('Day count must be a positive integer.');
      return;
    }
    setBusyId('blank');
    setError(null);
    try {
      const pattern = await planService.savePlanWeekPattern({
        mode: 'blank',
        day_count: dayCount,
        name: blankName.trim() || null,
      });
      setBlankName('');
      await router.push(APP_ROUTE_BUILDERS.planWeekPattern(pattern.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateFromRange() {
    if (!plan || selectedDayIds.length === 0) return;
    setBusyId('create');
    setError(null);
    try {
      const selectedDays = planDays
        .filter((day) => selectedDayIds.includes(day.id))
        .sort((a, b) => a.date_local.localeCompare(b.date_local));
      assertContiguousDateKeys(selectedDays.map((day) => day.date_local));
      const pattern = await planService.savePlanWeekPattern({
        plan_id: plan.id,
        source_plan_day_ids: selectedDays.map((day) => day.id),
        name: newName.trim() || null,
      });
      setNewName('');
      await router.push(APP_ROUTE_BUILDERS.planWeekPattern(pattern.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed.';
      setError(message.includes(CONTIGUOUS_PLAN_DAYS_ERROR) ? CONTIGUOUS_PLAN_DAYS_ERROR : message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleDay(dayId: string) {
    setSelectedDayIds((current) =>
      current.includes(dayId) ? current.filter((id) => id !== dayId) : [...current, dayId],
    );
  }

  async function handleDuplicate(patternId: string) {
    setBusyId(patternId);
    try {
      const copy = await planService.duplicatePlanWeekPattern(patternId);
      setPatterns((prev) => [copy, ...prev.filter((row) => row.id !== copy.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(pattern: PlanWeekPattern) {
    if (!window.confirm(`Delete "${pattern.name}"? This does not change dated plans.`)) return;
    setBusyId(pattern.id);
    try {
      await planService.deletePlanWeekPattern(pattern.id);
      setPatterns((prev) => prev.filter((row) => row.id !== pattern.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-black pb-28">
      <StackedPageHero className="bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 pt-8 pb-10`}>
          <Link href={APP_ROUTES.plans} className="text-xs text-white/60 hover:text-white/80">
            ← Plans overview
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white antialiased">Week Patterns</h1>
          <p className="mt-2 text-sm text-white/70 antialiased">
            Reusable multi-day structures you can append onto contiguous plan days.
          </p>
        </div>
      </StackedPageHero>

      <StackedPageSection layer={1} className="bg-[#1A160F] pb-24">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 space-y-6`}>
          <section className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
            <p className="text-sm font-semibold text-white antialiased">Create blank pattern</p>
            <p className="text-[11px] text-white/45 antialiased">
              Start from empty days using your meal schedule slots, then compose each day from day
              templates.
            </p>
            <input
              value={blankName}
              onChange={(e) => setBlankName(e.target.value)}
              placeholder="Pattern name (optional)"
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
            />
            <input
              type="number"
              min={1}
              step={1}
              value={blankDayCount}
              onChange={(e) => setBlankDayCount(e.target.value)}
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
              placeholder="Number of days"
            />
            <button
              type="button"
              disabled={busyId === 'blank'}
              onClick={handleCreateBlank}
              className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {busyId === 'blank' ? 'Creating…' : 'Create blank pattern'}
            </button>
          </section>

          <section className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
            <p className="text-sm font-semibold text-white antialiased">Create from plan days</p>
            <p className="text-[11px] text-white/45 antialiased">
              Secondary shortcut: snapshot contiguous calendar days from your dated plan.
            </p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Pattern name (optional)"
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
            />
            <div className="flex flex-wrap gap-2">
              {planDays.map((day) => {
                const selected = selectedDayIds.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`rounded-full px-3 py-1 text-[11px] border ${
                      selected
                        ? 'border-denim-300 bg-denim-400/20 text-white'
                        : 'border-white/15 text-white/70'
                    }`}
                  >
                    {day.date_local}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={busyId === 'create' || !plan || selectedDayIds.length === 0}
              onClick={handleCreateFromRange}
              className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {busyId === 'create' ? 'Creating…' : 'Save from plan days'}
            </button>
          </section>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {loadState === 'loading' ? (
            <p className="text-sm text-white/60">Loading patterns…</p>
          ) : patterns.length === 0 ? (
            <p className="text-sm text-white/60">No week patterns yet.</p>
          ) : (
            <ul className="space-y-3">
              {patterns.map((pattern) => (
                <li
                  key={pattern.id}
                  className="rounded-2xl bg-white/[0.04] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={APP_ROUTE_BUILDERS.planWeekPattern(pattern.id)}
                      className="text-sm font-semibold text-white hover:text-denim-200 antialiased"
                    >
                      {pattern.name}
                    </Link>
                    <p className="text-[11px] text-white/45 antialiased">
                      {pattern.days.length} day{pattern.days.length === 1 ? '' : 's'} ·{' '}
                      {countPatternMeals(pattern)} meal
                      {countPatternMeals(pattern) === 1 ? '' : 's'} · {pattern.source_date_start} to{' '}
                      {pattern.source_date_end}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={APP_ROUTE_BUILDERS.planWeekPattern(pattern.id)}
                      className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === pattern.id}
                      onClick={() => handleDuplicate(pattern.id)}
                      className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80 disabled:opacity-40"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === pattern.id}
                      onClick={() => handleDelete(pattern)}
                      className="rounded-full border border-red-400/30 px-3 py-1 text-[11px] text-red-300 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </StackedPageSection>

      <JournalFooterNav />
    </div>
  );
}
