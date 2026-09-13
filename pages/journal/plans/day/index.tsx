'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import {
  clearDayPlanDraft,
  dayPlanDraftSignature,
  loadDayPlanDraft,
  normalizeDayPlanName,
  saveDayPlanDraft,
  UNNAMED_DAY_PLAN,
} from '@/lib/plans/dayPlanDraftStore';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { planService, type PlanDayTemplate } from '@/lib/plans';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

function localId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function draftFromSeed(personId: string, slots: PlanDayTemplate['slots']): PlanDayTemplate {
  return {
    id: '',
    person_id: personId,
    name: UNNAMED_DAY_PLAN,
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: localId('day'),
    source_date_local: '',
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
  };
}

export default function DayPlanDesignerPage() {
  const router = useRouter();
  const requestedId =
    typeof router.query.dayPlanId === 'string'
      ? router.query.dayPlanId
      : typeof router.query.templateId === 'string'
        ? router.query.templateId
        : null;
  const [baseline, setBaseline] = useState<PlanDayTemplate | null>(null);
  const [draft, setDraft] = useState<PlanDayTemplate | null>(null);
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [viewOpen, setViewOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDate, setApplyDate] = useState('');

  const dirty = useMemo(
    () => Boolean(draft && baseline && dayPlanDraftSignature(draft) !== dayPlanDraftSignature(baseline)),
    [baseline, draft],
  );

  const loadDesigner = useCallback(async (dayPlanId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [rows, selected] = await Promise.all([
        planService.listPlanDayTemplates(),
        dayPlanId ? planService.getPlanDayTemplate(dayPlanId) : null,
      ]);
      setTemplates(rows);
      let next: PlanDayTemplate;
      if (selected) {
        next = selected;
      } else {
        const seed = await planService.getPlanDayDraftSeed();
        next = draftFromSeed(seed.person_id, seed.slots);
      }
      const restored =
        typeof window !== 'undefined'
          ? loadDayPlanDraft(window.localStorage, next.person_id, next.id || null, next.updated_at || null)
          : null;
      setBaseline(next);
      setDraft(restored ?? next);
      setLibraryOpen(!dayPlanId && router.asPath.includes('/day-templates'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the Day Plan designer.');
    } finally {
      setLoading(false);
    }
  }, [router.asPath]);

  useEffect(() => {
    if (!router.isReady) return;
    void loadDesigner(requestedId);
  }, [loadDesigner, requestedId, router.isReady]);

  useEffect(() => {
    if (!draft || !baseline || typeof window === 'undefined') return;
    if (dirty) {
      saveDayPlanDraft(
        window.localStorage,
        draft.person_id,
        draft.id || null,
        baseline.updated_at || null,
        draft,
      );
    } else {
      clearDayPlanDraft(window.localStorage, draft.person_id, draft.id || null);
    }
  }, [baseline, dirty, draft]);

  function canReplaceDraft(): boolean {
    return !dirty || window.confirm('Replace the current unsaved Day Plan draft?');
  }

  async function startNew() {
    if (!canReplaceDraft()) return;
    setLibraryOpen(false);
    setMessage(null);
    await router.push(APP_ROUTES.plansDay, undefined, { shallow: true });
    await loadDesigner(null);
  }

  async function openTemplate(template: PlanDayTemplate) {
    if (!canReplaceDraft()) return;
    setLibraryOpen(false);
    await router.push(APP_ROUTE_BUILDERS.planDayDesigner(template.id), undefined, { shallow: true });
  }

  async function saveDraft() {
    if (!draft || !dirty) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const name = normalizeDayPlanName(draft.name);
      const saved = draft.id
        ? await planService.updatePlanDayTemplate(draft.id, {
            name,
            slots: draft.slots,
            unassigned_meals: draft.unassigned_meals,
          })
        : await planService.savePlanDayTemplate({
            mode: 'draft',
            name,
            slots: draft.slots,
            unassigned_meals: draft.unassigned_meals,
          });
      clearDayPlanDraft(window.localStorage, draft.person_id, draft.id || null);
      setBaseline(saved);
      setDraft(saved);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage('Day Plan saved.');
      if (!draft.id) {
        await router.replace(APP_ROUTE_BUILDERS.planDayDesigner(saved.id), undefined, { shallow: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this Day Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function makeCopy() {
    if (!draft?.id || dirty) return;
    setBusy(true);
    setError(null);
    try {
      const copy = await planService.duplicatePlanDayTemplate(draft.id);
      setTemplates((current) => [copy, ...current]);
      await router.push(APP_ROUTE_BUILDERS.planDayDesigner(copy.id), undefined, { shallow: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy this Day Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function applyToDate() {
    if (!draft?.id || dirty || !applyDate) return;
    if (!window.confirm(`Apply "${draft.name}" to ${applyDate}? This will create dated planning state.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await planService.instantiatePlanDayTemplate(draft.id, {
        target_date_local: applyDate,
        apply_policy: 'append',
      });
      setApplyOpen(false);
      setMessage(`Applied to ${applyDate}.`);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not apply this Day Plan.';
      if (/already has meals|confirm append/i.test(text)) {
        const confirmed = window.confirm(`${text} Append this Day Plan anyway?`);
        if (confirmed) {
          await planService.instantiatePlanDayTemplate(draft.id, {
            target_date_local: applyDate,
            apply_policy: 'append',
            allow_duplicate_append: true,
          });
          setApplyOpen(false);
          setMessage(`Applied to ${applyDate}.`);
        }
      } else {
        setError(text);
      }
    } finally {
      setBusy(false);
    }
  }

  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(libraryQuery.trim().toLowerCase()),
  );
  const plannedCount = draft?.slots.filter((slot) => (slot.meals ?? []).length > 0).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="flex-1 overflow-x-hidden pb-32">
        <div className="min-h-screen bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
            <header className="mb-8">
              <div className="flex items-start gap-2 text-sm font-semibold text-white/80">
                <Link href={APP_ROUTES.plans}>Plans</Link>
                <span className="text-white/30">›</span>
                <div className="group relative focus-within:z-30">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-current="page"
                    aria-expanded={viewOpen}
                    onClick={() => setViewOpen((open) => !open)}
                    className="rounded-md px-1 hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                  >
                    Day <span aria-hidden>⌄</span>
                  </button>
                  <div
                    role="menu"
                    aria-label="Plans view"
                    className={`${viewOpen ? 'visible opacity-100' : 'invisible opacity-0'} absolute left-0 top-7 z-30 min-w-36 rounded-xl border border-white/15 bg-[#29231d] p-1 shadow-2xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100`}
                  >
                    <Link role="menuitem" aria-current="page" href={APP_ROUTES.plansDay} className="block rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15 focus:bg-white/15">Day</Link>
                    <Link role="menuitem" href={APP_ROUTES.plansWeek} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10">Week</Link>
                    <Link role="menuitem" href={APP_ROUTES.plansMonth} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10 focus:bg-white/10">Month</Link>
                  </div>
                </div>
              </div>
              <h1 className="mt-5 text-4xl font-light tracking-tight sm:text-5xl">Plan For Consistency</h1>
            </header>

            {loading ? <p className="py-12 text-sm text-white/55">Preparing your Day Plan…</p> : null}
            {draft ? (
              <>
                <section className="mb-6 flex flex-wrap items-center gap-2 border-y border-white/15 py-3">
                  <input
                    aria-label="Day Plan name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="mr-auto min-w-48 flex-1 border-0 bg-transparent px-2 py-2 text-base font-semibold outline-none placeholder:text-white/30 focus:bg-white/[0.04]"
                    placeholder={UNNAMED_DAY_PLAN}
                  />
                  <button type="button" onClick={() => setLibraryOpen(true)} className="rounded-full border border-white/15 px-3 py-2 text-xs hover:bg-white/10">Open</button>
                  <button type="button" onClick={() => void startNew()} className="rounded-full border border-white/15 px-3 py-2 text-xs hover:bg-white/10">New</button>
                  <button type="button" disabled={!draft.id || dirty || busy} onClick={() => void makeCopy()} className="rounded-full border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-35">Make a copy</button>
                  <button type="button" disabled={!draft.id || dirty || busy} onClick={() => setApplyOpen(true)} className="rounded-full border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-35">Apply to a date</button>
                </section>

                <TemplateDayEditor template={draft} busy={busy} onChange={setDraft} />

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-white/15 py-4">
                  <div className="text-xs text-white/50">
                    Planned {plannedCount} of {draft.slots.length} · {countTemplateMeals(draft)} Meal{countTemplateMeals(draft) === 1 ? '' : 's'}
                  </div>
                  <button type="button" disabled={!dirty || busy} onClick={() => void saveDraft()} className="rounded-full bg-[#d7ecff] px-6 py-2 text-sm font-semibold text-black disabled:opacity-35">
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            ) : null}
            {error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
            {message ? <p className="mt-4 text-sm text-emerald-200">{message}</p> : null}
          </div>
        </div>
      </main>

      {libraryOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="day-plan-library-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 sm:p-6">
          <section className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-[#29231d] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
              <h2 id="day-plan-library-title" className="text-xl font-semibold">Day Plans Library</h2>
              <button type="button" aria-label="Close Day Plans Library" onClick={() => setLibraryOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10">×</button>
            </div>
            <div className="p-5 sm:p-7">
              <input type="search" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search Day Plans" className="w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-[#d7ecff]/60" />
              <ul className="mt-5 max-h-[55vh] divide-y divide-white/10 overflow-y-auto">
                {filteredTemplates.map((template) => (
                  <li key={template.id}>
                    <button type="button" onClick={() => void openTemplate(template)} className="flex w-full items-center justify-between gap-4 px-2 py-4 text-left hover:bg-white/[0.04]">
                      <span><span className="block font-medium">{template.name}</span><span className="mt-1 block text-xs text-white/45">{template.slots.length} occasions · {countTemplateMeals(template)} Meals</span></span>
                      <span aria-hidden className="text-white/35">→</span>
                    </button>
                  </li>
                ))}
              </ul>
              {filteredTemplates.length === 0 ? <p className="py-10 text-center text-sm text-white/45">No matching Day Plans.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {applyOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="apply-day-plan-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#29231d] p-6">
            <h2 id="apply-day-plan-title" className="text-xl font-semibold">Apply to a date</h2>
            <p className="mt-2 text-sm text-white/55">Choose the calendar date where this saved Day Plan should be placed.</p>
            <input type="date" value={applyDate} onChange={(event) => setApplyDate(event.target.value)} className="mt-5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 [color-scheme:dark]" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setApplyOpen(false)} className="rounded-full px-4 py-2 text-sm text-white/60 hover:bg-white/10">Cancel</button>
              <button type="button" disabled={!applyDate || busy} onClick={() => void applyToDate()} className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-40">Apply</button>
            </div>
          </section>
        </div>
      ) : null}

      <JournalFooterNav />
    </div>
  );
}
