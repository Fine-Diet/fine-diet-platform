'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { planService, type PlanDayTemplate } from '@/lib/plans';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const MAX_WIDTH = 'max-w-[750px]';

export default function DayTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const rows = await planService.listPlanDayTemplates();
      setTemplates(rows);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load day templates.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreateBlank() {
    setBusyId('create');
    setError(null);
    try {
      const template = await planService.savePlanDayTemplate({
        mode: 'blank',
        name: newName.trim() || null,
      });
      setNewName('');
      await router.push(APP_ROUTE_BUILDERS.planDayTemplate(template.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(templateId: string) {
    setBusyId(templateId);
    try {
      const copy = await planService.duplicatePlanDayTemplate(templateId);
      setTemplates((prev) => [copy, ...prev.filter((row) => row.id !== copy.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(template: PlanDayTemplate) {
    if (!window.confirm(`Delete "${template.name}"? This does not change dated plans.`)) return;
    setBusyId(template.id);
    try {
      await planService.deletePlanDayTemplate(template.id);
      setTemplates((prev) => prev.filter((row) => row.id !== template.id));
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
          <h1 className="mt-4 text-3xl font-semibold text-white antialiased">Day Templates</h1>
          <p className="mt-2 text-sm text-white/70 antialiased">
            Reusable single-day structures you can apply to dated plans without rewriting history.
          </p>
        </div>
      </StackedPageHero>

      <StackedPageSection layer={1} className="bg-[#1A160F] pb-24">
        <div className={`mx-auto w-full ${MAX_WIDTH} px-4 space-y-6`}>
          <section className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
            <p className="text-sm font-semibold text-white antialiased">Create a template</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Template name (optional)"
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
            />
            <button
              type="button"
              disabled={busyId === 'create'}
              onClick={handleCreateBlank}
              className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {busyId === 'create' ? 'Creating…' : 'Create blank template'}
            </button>
          </section>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {loadState === 'loading' ? (
            <p className="text-sm text-white/60">Loading templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-white/60">No day templates yet.</p>
          ) : (
            <ul className="space-y-3">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="rounded-2xl bg-white/[0.04] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Link
                      href={APP_ROUTE_BUILDERS.planDayTemplate(template.id)}
                      className="text-sm font-semibold text-white hover:text-denim-200 antialiased"
                    >
                      {template.name}
                    </Link>
                    <p className="text-[11px] text-white/45 antialiased">
                      {template.slots.length} slot{template.slots.length === 1 ? '' : 's'} ·{' '}
                      {countTemplateMeals(template)} meal
                      {countTemplateMeals(template) === 1 ? '' : 's'} · source {template.source_date_local}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={APP_ROUTE_BUILDERS.planDayTemplate(template.id)}
                      className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() => handleDuplicate(template.id)}
                      className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/80 disabled:opacity-40"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === template.id}
                      onClick={() => handleDelete(template)}
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
