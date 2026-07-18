'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { planService, type Plan, type PlanDay, type PlanDayTemplate } from '@/lib/plans';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';

const MAX_WIDTH = 'max-w-[750px]';

type CreateMode = 'blank' | 'from_plan_day';

export default function DayTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planDays, setPlanDays] = useState<PlanDay[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>('blank');
  const [selectedPlanDayId, setSelectedPlanDayId] = useState('');
  const [includeMeals, setIncludeMeals] = useState(true);

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [rows, plans] = await Promise.all([
        planService.listPlanDayTemplates(),
        planService.list(),
      ]);
      setTemplates(rows);
      const active = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
      setPlan(active);
      if (active) {
        const detail = await planService.getDetail(active.id);
        setPlanDays(detail.days);
        setSelectedPlanDayId(detail.days[0]?.id ?? '');
      }
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load day templates.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    setBusyId('create');
    setError(null);
    try {
      const template =
        createMode === 'blank'
          ? await planService.savePlanDayTemplate({
              mode: 'blank',
              name: newName.trim() || null,
            })
          : await planService.savePlanDayTemplate({
              plan_id: plan!.id,
              plan_day_id: selectedPlanDayId,
              name: newName.trim() || null,
              include_meals: includeMeals,
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

  const createDisabled =
    busyId === 'create' ||
    (createMode === 'from_plan_day' && (!plan || !selectedPlanDayId || planDays.length === 0));

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

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCreateMode('blank')}
                className={`rounded-full px-3 py-1 text-[11px] border ${
                  createMode === 'blank'
                    ? 'border-denim-300 bg-denim-400/20 text-white'
                    : 'border-white/15 text-white/70'
                }`}
              >
                Blank template
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('from_plan_day')}
                disabled={!plan || planDays.length === 0}
                className={`rounded-full px-3 py-1 text-[11px] border disabled:opacity-40 ${
                  createMode === 'from_plan_day'
                    ? 'border-denim-300 bg-denim-400/20 text-white'
                    : 'border-white/15 text-white/70'
                }`}
              >
                From plan day
              </button>
            </div>

            {createMode === 'from_plan_day' ? (
              <>
                <select
                  value={selectedPlanDayId}
                  onChange={(e) => setSelectedPlanDayId(e.target.value)}
                  disabled={planDays.length === 0}
                  className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
                >
                  {planDays.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.date_local}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-white/70 antialiased">
                  <input
                    type="checkbox"
                    checked={includeMeals}
                    onChange={(e) => setIncludeMeals(e.target.checked)}
                  />
                  Include planned meals (uncheck for structure-only snapshot)
                </label>
              </>
            ) : (
              <p className="text-[11px] text-white/45 antialiased">
                Blank templates start from your profile meal schedule slots with no meals.
              </p>
            )}

            <button
              type="button"
              disabled={createDisabled}
              onClick={handleCreate}
              className="rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {busyId === 'create'
                ? 'Creating…'
                : createMode === 'blank'
                  ? 'Create blank template'
                  : 'Create from plan day'}
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
