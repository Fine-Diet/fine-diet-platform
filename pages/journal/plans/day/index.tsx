'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { PlanContextModal } from '@/components/journal/plans/PlanContextModal';
import { PlanLibraryBrowser } from '@/components/journal/plans/PlanLibraryBrowser';
import { PlansViewSwitcher } from '@/components/journal/plans/PlansViewSwitcher';
import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import {
  clearDayPlanDraft,
  copyDayPlanName,
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
    description: null,
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
  const [rhythmSlots, setRhythmSlots] = useState<PlanDayTemplate['slots']>([]);
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDate, setApplyDate] = useState('');
  const [saveChoiceOpen, setSaveChoiceOpen] = useState(false);
  const [draftRestoredNotice, setDraftRestoredNotice] = useState(false);
  const libraryOpenerRef = useRef<HTMLButtonElement>(null);
  const loadSeq = useRef(0);

  const dirty = useMemo(
    () => Boolean(draft && baseline && dayPlanDraftSignature(draft) !== dayPlanDraftSignature(baseline)),
    [baseline, draft],
  );

  const loadDesigner = useCallback(async (dayPlanId: string | null) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const [rows, selected, seed] = await Promise.all([
        planService.listPlanDayTemplates(),
        dayPlanId ? planService.getPlanDayTemplate(dayPlanId) : null,
        planService.getPlanDayDraftSeed(),
      ]);
      if (seq !== loadSeq.current) return;
      setTemplates(rows);
      setRhythmSlots(seed.slots);
      const next: PlanDayTemplate = selected
        ? selected
        : draftFromSeed(seed.person_id, seed.slots);
      const restored =
        typeof window !== 'undefined'
          ? loadDayPlanDraft(window.localStorage, next.person_id, next.id || null, next.updated_at || null)
          : null;
      const restoredDirty = Boolean(
        next.id &&
          restored &&
          dayPlanDraftSignature(restored) !== dayPlanDraftSignature(next),
      );
      setBaseline(next);
      setDraft(restoredDirty && restored ? restored : next);
      setDraftRestoredNotice(restoredDirty);
      if (!restored && typeof window !== 'undefined') {
        clearDayPlanDraft(window.localStorage, next.person_id, next.id || null);
      }
      setLibraryOpen(!dayPlanId && router.asPath.includes('/day-templates'));
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : 'Could not load the Day Plan designer.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
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
    setDraftRestoredNotice(false);
    setSaveChoiceOpen(false);
    await router.push(APP_ROUTES.plansDay, undefined, { shallow: true });
    await loadDesigner(null);
  }

  async function openTemplate(template: PlanDayTemplate) {
    if (!canReplaceDraft()) return;
    setLibraryOpen(false);
    setMessage(null);
    setError(null);
    const restored =
      typeof window !== 'undefined'
        ? loadDayPlanDraft(
            window.localStorage,
            template.person_id,
            template.id,
            template.updated_at || null,
          )
        : null;
    const restoredDirty = Boolean(
      restored && dayPlanDraftSignature(restored) !== dayPlanDraftSignature(template),
    );
    setBaseline(template);
    setDraft(restoredDirty && restored ? restored : template);
    setDraftRestoredNotice(restoredDirty);
    setSaveChoiceOpen(false);
    await router.push(APP_ROUTE_BUILDERS.planDayDesigner(template.id), undefined, { shallow: true });
  }

  function discardRestoredDraft() {
    if (!baseline || !draft) return;
    clearDayPlanDraft(window.localStorage, draft.person_id, draft.id || null);
    setDraft(baseline);
    setDraftRestoredNotice(false);
    setSaveChoiceOpen(false);
    setError(null);
    setMessage(null);
  }

  function requestSave() {
    if (!draft || !dirty) return;
    if (draft.id) {
      setSaveChoiceOpen(true);
      return;
    }
    void saveDraft();
  }

  async function saveDraft() {
    if (!draft || !dirty || draft.id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const name = normalizeDayPlanName(draft.name);
      const saved = await planService.savePlanDayTemplate({
        mode: 'draft',
        name,
        description: draft.description,
        slots: draft.slots,
        unassigned_meals: draft.unassigned_meals,
      });
      clearDayPlanDraft(window.localStorage, draft.person_id, null);
      setBaseline(saved);
      setDraft(saved);
      setDraftRestoredNotice(false);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage('Day Plan saved.');
      await router.replace(APP_ROUTE_BUILDERS.planDayDesigner(saved.id), undefined, { shallow: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this Day Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    if (!draft?.id || !dirty) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await planService.updatePlanDayTemplate(draft.id, {
        name: normalizeDayPlanName(draft.name),
        description: draft.description,
        slots: draft.slots,
        unassigned_meals: draft.unassigned_meals,
      });
      clearDayPlanDraft(window.localStorage, draft.person_id, draft.id);
      setBaseline(saved);
      setDraft(saved);
      setDraftRestoredNotice(false);
      setSaveChoiceOpen(false);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage('Day Plan saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this Day Plan.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAsCopy() {
    if (!draft?.id || !dirty) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await planService.savePlanDayTemplate({
        mode: 'draft',
        name: copyDayPlanName(draft.name),
        description: draft.description,
        slots: draft.slots,
        unassigned_meals: draft.unassigned_meals,
      });
      clearDayPlanDraft(window.localStorage, draft.person_id, draft.id);
      clearDayPlanDraft(window.localStorage, saved.person_id, saved.id);
      setBaseline(saved);
      setDraft(saved);
      setDraftRestoredNotice(false);
      setSaveChoiceOpen(false);
      setTemplates((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setMessage('Day Plan copy saved.');
      await router.replace(APP_ROUTE_BUILDERS.planDayDesigner(saved.id), undefined, { shallow: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save a copy of this Day Plan.');
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
      setTemplates((current) => [copy, ...current.filter((row) => row.id !== copy.id)]);
      setBaseline(copy);
      setDraft(copy);
      setDraftRestoredNotice(false);
      setSaveChoiceOpen(false);
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

  const libraryItems = templates.map((template) => ({
    id: template.id,
    title: template.name,
    description: template.description,
    metadata: `${template.slots.length} occasions · ${countTemplateMeals(template)} Meals`,
    updatedAt: template.updated_at,
    onSelect: () => void openTemplate(template),
  }));
  const plannedCount = draft?.slots.filter((slot) => (slot.meals ?? []).length > 0).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <main className="flex-1 overflow-x-hidden bg-[#463c2f] pb-4">
        <div className="min-h-screen bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]">
          <div className="mx-auto w-full max-w-[950px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
            <header className="mb-0">
              <PlansViewSwitcher currentView="day" />
              <h1 className="text-[2.5rem] font-regular tracking-tight sm:text-[2.75rem]">Plan For Consistency</h1>
            </header>

            {loading ? <p className="py-12 text-sm text-white/55">Preparing your Day Plan…</p> : null}
            {draft ? (
              <>
                <section className="mb-0 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Day Plan name"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      className="mr-auto min-w-48 flex-1 border-0 bg-transparent px-2 py-2 text-base font-regular outline-none placeholder:text-white/30 focus:bg-white/[0.04]"
                      placeholder={UNNAMED_DAY_PLAN}
                    />
                    <button
                      ref={libraryOpenerRef}
                      type="button"
                      onClick={() => setLibraryOpen(true)}
                      className="font-semibold px-3 py-2 text-xs hover:underline decoration-2 underline-offset-[5px]"
                    >
                      Open
                    </button>
                  <button type="button" onClick={() => void startNew()} className="font-semibold px-3 py-2 text-xs hover:underline decoration-2 underline-offset-[5px]">New</button>
                  <button type="button" disabled={!draft.id || dirty || busy} onClick={() => void makeCopy()} className="font-semibold px-3 py-2 text-xs hover:underline decoration-2 underline-offset-[5px] disabled:opacity-35">Make a copy</button>
                  <button type="button" disabled={!draft.id || dirty || busy} onClick={() => setApplyOpen(true)} className="font-semibold px-3 py-2 text-xs hover:underline decoration-2 underline-offset-[5px] disabled:opacity-35">Apply to a date</button>
                  </div>
                  <textarea
                    aria-label="Day Plan description"
                    value={draft.description ?? ''}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        description: event.target.value.trim() ? event.target.value : null,
                      })
                    }
                    placeholder="Add a description"
                    className="mt-1 h-[30px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm text-white/70 outline-none placeholder:text-white/30 focus:bg-white/[0.04]"
                  />
                </section>

                <TemplateDayEditor
                  template={draft}
                  rhythmSlots={rhythmSlots}
                  busy={busy}
                  onChange={setDraft}
                />

                {draftRestoredNotice ? (
                  <div
                    role="status"
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white/70"
                  >
                    <p>Unsaved changes from your last session were restored.</p>
                    <button
                      type="button"
                      onClick={discardRestoredDraft}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                    >
                      Discard changes
                    </button>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 py-4">
                  <div className="text-xs text-white/50">
                    Planned {plannedCount} of {draft.slots.length} · {countTemplateMeals(draft)} Meal{countTemplateMeals(draft) === 1 ? '' : 's'}
                  </div>
                  <button type="button" disabled={!dirty || busy} onClick={() => void requestSave()} className="rounded-full bg-[#d7ecff] px-6 py-2 text-sm font-semibold text-black disabled:opacity-35">
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
        <PlanContextModal
          dialogLabel="Day Plans Library"
          titleId="day-plan-library-title"
          closeLabel="Close Day Plans Library"
          libraryTabLabel="Day Plans Library"
          onClose={() => setLibraryOpen(false)}
          returnFocusRef={libraryOpenerRef}
          libraryPanel={
            <PlanLibraryBrowser
              query={libraryQuery}
              onQueryChange={setLibraryQuery}
              items={libraryItems}
              emptyMessage="No matching Day Plans."
            />
          }
        />
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

      {saveChoiceOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="save-day-plan-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#29231d] p-6">
            <h2 id="save-day-plan-title" className="text-xl font-semibold">Save Day Plan</h2>
            <p className="mt-2 text-sm text-white/55">Save these changes to this Day Plan, or create a new copy?</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setSaveChoiceOpen(false)} className="rounded-full px-4 py-2 text-sm text-white/60 hover:bg-white/10">Cancel</button>
              <button type="button" disabled={busy} onClick={() => void saveAsCopy()} className="rounded-full px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-40">Save as a copy</button>
              <button type="button" disabled={busy} onClick={() => void saveChanges()} className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-40">Save changes</button>
            </div>
          </section>
        </div>
      ) : null}

      <JournalFooterNav />
    </div>
  );
}
