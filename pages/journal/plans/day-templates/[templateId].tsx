'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ApplyDayTemplatePanel } from '@/components/journal/plans/reusable/ApplyReusablePanel';
import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import { useSerializedReusableSave } from '@/components/journal/plans/reusable/useSerializedReusableSave';
import { planService, type PlanDayTemplate } from '@/lib/plans';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const MAX_WIDTH = 'max-w-[750px]';

export default function DayTemplateDetailPage() {
  const router = useRouter();
  const templateId = typeof router.query.templateId === 'string' ? router.query.templateId : '';
  const [savedTemplate, setSavedTemplate] = useState<PlanDayTemplate | null>(null);
  const [draftTemplate, setDraftTemplate] = useState<PlanDayTemplate | null>(null);
  const [name, setName] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const saveTemplate = useCallback(
    async (next: PlanDayTemplate) =>
      planService.updatePlanDayTemplate(templateId, {
        name: next.name,
        slots: next.slots,
        unassigned_meals: next.unassigned_meals,
      }),
    [templateId],
  );

  const { busy: saveBusy, error: saveError, savedMessage, save, clearMessages } =
    useSerializedReusableSave(saveTemplate);

  const refresh = useCallback(async () => {
    if (!templateId) return;
    setLoadState('loading');
    setLoadError(null);
    clearMessages();
    try {
      const row = await planService.getPlanDayTemplate(templateId);
      setSavedTemplate(row);
      setDraftTemplate(row);
      setName(row.name);
      setLoadState('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load template.');
      setLoadState('error');
    }
  }, [clearMessages, templateId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dirty = useMemo(() => {
    if (!savedTemplate || !draftTemplate) return false;
    return JSON.stringify(savedTemplate) !== JSON.stringify(draftTemplate);
  }, [draftTemplate, savedTemplate]);

  async function handleSaveTemplate() {
    if (!draftTemplate) return;
    const saved = await save({ ...draftTemplate, name: name.trim() || draftTemplate.name });
    if (saved) {
      setSavedTemplate(saved);
      setDraftTemplate(saved);
      setName(saved.name);
    }
  }

  async function handleRename() {
    if (!draftTemplate) return;
    const saved = await save({ ...draftTemplate, name: name.trim() || draftTemplate.name });
    if (saved) {
      setSavedTemplate(saved);
      setDraftTemplate(saved);
      setName(saved.name);
    }
  }

  async function handleDuplicate() {
    setActionBusy(true);
    try {
      const copy = await planService.duplicatePlanDayTemplate(templateId);
      await router.push(`${APP_ROUTES.plansDayTemplates}/${copy.id}`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Duplicate failed.');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!savedTemplate) return;
    if (!window.confirm(`Delete "${savedTemplate.name}"? This does not change dated plans.`)) return;
    setActionBusy(true);
    try {
      await planService.deletePlanDayTemplate(templateId);
      await router.push(APP_ROUTES.plansDayTemplates);
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
          <Link href={APP_ROUTES.plansDayTemplates} className="text-xs text-white/60 hover:text-white/80">
            ← Day Templates
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white antialiased">
            {draftTemplate?.name ?? 'Day template'}
          </h1>
          {draftTemplate ? (
            <p className="mt-2 text-sm text-white/70 antialiased">
              {draftTemplate.slots.length} slots · {countTemplateMeals(draftTemplate)} meals · append-only apply
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

          {draftTemplate ? (
            <>
              <section className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
                <label className="block text-[11px] uppercase tracking-wider text-white/40">
                  Template name
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
                    onClick={handleSaveTemplate}
                    className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                  >
                    {saveBusy ? 'Saving…' : 'Save template'}
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

              <TemplateDayEditor
                template={draftTemplate}
                busy={busy}
                onChange={(next) => {
                  clearMessages();
                  setDraftTemplate(next);
                }}
              />

              <ApplyDayTemplatePanel templateId={draftTemplate.id} />
            </>
          ) : null}
        </div>
      </StackedPageSection>

      <JournalFooterNav />
    </div>
  );
}
