'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ApplyWeekPatternPanel } from '@/components/journal/plans/reusable/ApplyReusablePanel';
import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import { WeekPatternDayControls } from '@/components/journal/plans/reusable/WeekPatternDayControls';
import { useSerializedReusableSave } from '@/components/journal/plans/reusable/useSerializedReusableSave';
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
  const [savedPattern, setSavedPattern] = useState<PlanWeekPattern | null>(null);
  const [draftPattern, setDraftPattern] = useState<PlanWeekPattern | null>(null);
  const [name, setName] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const savePattern = useCallback(
    async (next: PlanWeekPattern) =>
      planService.updatePlanWeekPattern(patternId, {
        name: next.name,
        days: next.days,
      }),
    [patternId],
  );

  const { busy: saveBusy, error: saveError, savedMessage, save, clearMessages } =
    useSerializedReusableSave(savePattern);

  const refresh = useCallback(async () => {
    if (!patternId) return;
    setLoadState('loading');
    setLoadError(null);
    clearMessages();
    try {
      const row = await planService.getPlanWeekPattern(patternId);
      setSavedPattern(row);
      setDraftPattern(row);
      setName(row.name);
      setLoadState('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load pattern.');
      setLoadState('error');
    }
  }, [clearMessages, patternId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dirty = useMemo(() => {
    if (!savedPattern || !draftPattern) return false;
    return JSON.stringify(savedPattern) !== JSON.stringify(draftPattern);
  }, [draftPattern, savedPattern]);

  async function handleSavePattern() {
    if (!draftPattern) return;
    const saved = await save({ ...draftPattern, name: name.trim() || draftPattern.name });
    if (saved) {
      setSavedPattern(saved);
      setDraftPattern(saved);
      setName(saved.name);
    }
  }

  async function handleRename() {
    if (!draftPattern) return;
    const saved = await save({ ...draftPattern, name: name.trim() || draftPattern.name });
    if (saved) {
      setSavedPattern(saved);
      setDraftPattern(saved);
      setName(saved.name);
    }
  }

  async function handleDuplicate() {
    setActionBusy(true);
    try {
      const copy = await planService.duplicatePlanWeekPattern(patternId);
      await router.push(`${APP_ROUTES.plansWeekPatterns}/${copy.id}`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Duplicate failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!savedPattern) return;
    if (!window.confirm(`Delete "${savedPattern.name}"? This does not change dated plans.`)) return;
    setActionBusy(true);
    try {
      await planService.deletePlanWeekPattern(patternId);
      await router.push(APP_ROUTES.plansWeekPatterns);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setActionBusy(false);
    }
  }

  const busy = saveBusy || actionBusy;

  return (
    <div className="min-h-screen bg-black pb-28">
      <StackedPageHero className="bg-gradient-to-b from-neutral-900 to-brand-700 to-80%">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 pt-8 pb-10`}>
          <Link href={APP_ROUTES.plansWeekPatterns} className="text-xs text-white/60 hover:text-white/80">
            ← Week Patterns
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white antialiased">
            {draftPattern?.name ?? 'Week pattern'}
          </h1>
          {draftPattern ? (
            <p className="mt-2 text-sm text-white/70 antialiased">
              {draftPattern.days.length} days · {countPatternMeals(draftPattern)} meals · append-only apply
              {dirty ? ' · unsaved changes' : ''}
            </p>
          ) : null}
        </div>
      </StackedPageHero>

      <StackedPageSection layer={1} className="bg-[#1A160F] pb-24">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 space-y-6`}>
          {loadState === 'loading' ? <p className="text-sm text-white/60">Loading…</p> : null}
          {loadError ? <p className="text-sm text-red-300">{loadError}</p> : null}
          {saveError ? <p className="text-sm text-red-300">{saveError}</p> : null}
          {savedMessage ? <p className="text-sm text-emerald-300">{savedMessage}</p> : null}

          {draftPattern ? (
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
                    disabled={busy || !dirty}
                    onClick={handleSavePattern}
                    className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {saveBusy ? 'Saving…' : 'Save pattern'}
                  </button>
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

              {draftPattern.days.map((day, dayIndex) => (
                <section key={`${day.source_plan_day_id}-${day.day_offset}`} className="space-y-3">
                  <h2 className="text-lg font-semibold text-white antialiased">
                    Day {day.day_offset + 1} · {day.source_date_local}
                  </h2>
                  <WeekPatternDayControls
                    pattern={draftPattern}
                    dayIndex={dayIndex}
                    busy={busy}
                    onReplaceDay={(nextDay) => {
                      clearMessages();
                      setDraftPattern((current) => {
                        if (!current) return current;
                        return {
                          ...current,
                          days: current.days.map((existing, index) =>
                            index === dayIndex ? nextDay : existing,
                          ),
                        };
                      });
                    }}
                  />
                  <TemplateDayEditor
                    template={dayAsEditableTemplate(draftPattern, dayIndex)}
                    busy={busy}
                    onChange={(nextTemplate) => {
                      clearMessages();
                      setDraftPattern((current) => {
                        if (!current) return current;
                        return {
                          ...current,
                          days: current.days.map((existing, index) =>
                            index === dayIndex
                              ? {
                                  ...existing,
                                  slots: nextTemplate.slots,
                                  unassigned_meals: nextTemplate.unassigned_meals,
                                }
                              : existing,
                          ),
                        };
                      });
                    }}
                  />
                </section>
              ))}

              <ApplyWeekPatternPanel
                patternId={draftPattern.id}
                dirty={dirty}
                saveBusy={saveBusy}
              />
            </>
          ) : null}
        </div>
      </StackedPageSection>

      <JournalFooterNav />
    </div>
  );
}
