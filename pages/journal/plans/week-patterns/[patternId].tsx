'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ApplyWeekPatternPanel } from '@/components/journal/plans/reusable/ApplyReusablePanel';
import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import { planService, type PlanDayTemplate, type PlanWeekPattern } from '@/lib/plans';
import { countPatternMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const MAX_WIDTH = 'max-w-[750px]';

function dayAsEditableTemplate(pattern: PlanWeekPattern, dayIndex: number): PlanDayTemplate {
  const day = pattern.days[dayIndex]!;
  return {
    id: pattern.id,
    person_id: pattern.person_id,
    name: pattern.name,
    scope: 'day',
    source_plan_id: pattern.source_plan_id,
    source_plan_day_id: day.source_plan_day_id,
    source_date_local: day.source_date_local,
    slots: day.slots,
    unassigned_meals: day.unassigned_meals,
    apply_policy: 'append',
    created_at: pattern.created_at,
    updated_at: pattern.updated_at,
  };
}

export default function WeekPatternDetailPage() {
  const router = useRouter();
  const patternId = typeof router.query.patternId === 'string' ? router.query.patternId : '';
  const [pattern, setPattern] = useState<PlanWeekPattern | null>(null);
  const [name, setName] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!patternId) return;
    setLoadState('loading');
    setError(null);
    try {
      const row = await planService.getPlanWeekPattern(patternId);
      setPattern(row);
      setName(row.name);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pattern.');
      setLoadState('error');
    }
  }, [patternId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persist(next: PlanWeekPattern, nextName?: string) {
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const saved = await planService.updatePlanWeekPattern(patternId, {
        name: nextName ?? next.name,
        days: next.days,
      });
      setPattern(saved);
      setName(saved.name);
      setSavedMessage('Pattern saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!pattern) return;
    await persist(pattern, name);
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const copy = await planService.duplicatePlanWeekPattern(patternId);
      await router.push(`${APP_ROUTES.plansWeekPatterns}/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!pattern) return;
    if (!window.confirm(`Delete "${pattern.name}"? This does not change dated plans.`)) return;
    setBusy(true);
    try {
      await planService.deletePlanWeekPattern(patternId);
      await router.push(APP_ROUTES.plansWeekPatterns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-black pb-28">
      <StackedPageHero className="bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 pt-8 pb-10`}>
          <Link href={APP_ROUTES.plansWeekPatterns} className="text-xs text-white/60 hover:text-white/80">
            ← Week Patterns
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white antialiased">
            {pattern?.name ?? 'Week pattern'}
          </h1>
          {pattern ? (
            <p className="mt-2 text-sm text-white/70 antialiased">
              {pattern.days.length} days · {countPatternMeals(pattern)} meals · append-only apply
            </p>
          ) : null}
        </div>
      </StackedPageHero>

      <StackedPageSection layer={1} className="bg-[#1A160F] pb-24">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 space-y-6`}>
          {loadState === 'loading' ? <p className="text-sm text-white/60">Loading…</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {savedMessage ? <p className="text-sm text-emerald-300">{savedMessage}</p> : null}

          {pattern ? (
            <>
              <section className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
                <label className="block text-[11px] uppercase tracking-wider text-white/40">
                  Pattern name
                </label>
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRename}
                    className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    Rename
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDuplicate}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDelete}
                    className="rounded-full border border-red-400/30 px-3 py-1 text-[11px] text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </section>

              {pattern.days.map((day, dayIndex) => (
                <section key={`${day.source_plan_day_id}-${day.day_offset}`} className="space-y-3">
                  <h2 className="text-lg font-semibold text-white antialiased">
                    Day {day.day_offset + 1} · {day.source_date_local}
                  </h2>
                  <TemplateDayEditor
                    template={dayAsEditableTemplate(pattern, dayIndex)}
                    busy={busy}
                    onChange={(nextTemplate) => {
                      const nextDays = pattern.days.map((existing, index) =>
                        index === dayIndex
                          ? {
                              ...existing,
                              slots: nextTemplate.slots,
                              unassigned_meals: nextTemplate.unassigned_meals,
                            }
                          : existing,
                      );
                      const nextPattern = { ...pattern, days: nextDays };
                      setPattern(nextPattern);
                      void persist(nextPattern);
                    }}
                  />
                </section>
              ))}

              <ApplyWeekPatternPanel patternId={pattern.id} />
            </>
          ) : null}
        </div>
      </StackedPageSection>

      <JournalFooterNav />
    </div>
  );
}
