'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { ApplyDayTemplatePanel } from '@/components/journal/plans/reusable/ApplyReusablePanel';
import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import { planService, type PlanDayTemplate } from '@/lib/plans';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

const MAX_WIDTH = 'max-w-[750px]';

export default function DayTemplateDetailPage() {
  const router = useRouter();
  const templateId = typeof router.query.templateId === 'string' ? router.query.templateId : '';
  const [template, setTemplate] = useState<PlanDayTemplate | null>(null);
  const [name, setName] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!templateId) return;
    setLoadState('loading');
    setError(null);
    try {
      const row = await planService.getPlanDayTemplate(templateId);
      setTemplate(row);
      setName(row.name);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load template.');
      setLoadState('error');
    }
  }, [templateId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persist(next: PlanDayTemplate, nextName?: string) {
    setBusy(true);
    setError(null);
    setSavedMessage(null);
    try {
      const saved = await planService.updatePlanDayTemplate(templateId, {
        name: nextName ?? next.name,
        slots: next.slots,
        unassigned_meals: next.unassigned_meals,
      });
      setTemplate(saved);
      setName(saved.name);
      setSavedMessage('Template saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!template) return;
    await persist(template, name);
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const copy = await planService.duplicatePlanDayTemplate(templateId);
      await router.push(`${APP_ROUTES.plansDayTemplates}/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!template) return;
    if (!window.confirm(`Delete "${template.name}"? This does not change dated plans.`)) return;
    setBusy(true);
    try {
      await planService.deletePlanDayTemplate(templateId);
      await router.push(APP_ROUTES.plansDayTemplates);
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
          <Link href={APP_ROUTES.plansDayTemplates} className="text-xs text-white/60 hover:text-white/80">
            ← Day Templates
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white antialiased">
            {template?.name ?? 'Day template'}
          </h1>
          {template ? (
            <p className="mt-2 text-sm text-white/70 antialiased">
              {template.slots.length} slots · {countTemplateMeals(template)} meals · append-only apply
            </p>
          ) : null}
        </div>
      </StackedPageHero>

      <StackedPageSection layer={1} className="bg-[#1A160F] pb-24">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 space-y-6`}>
          {loadState === 'loading' ? (
            <p className="text-sm text-white/60">Loading…</p>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {savedMessage ? <p className="text-sm text-emerald-300">{savedMessage}</p> : null}

          {template ? (
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
                template={template}
                busy={busy}
                onChange={(next) => {
                  setTemplate(next);
                  void persist(next);
                }}
              />

              <ApplyDayTemplatePanel templateId={template.id} />
            </>
          ) : null}
        </div>
      </StackedPageSection>

      <JournalFooterNav />
    </div>
  );
}
