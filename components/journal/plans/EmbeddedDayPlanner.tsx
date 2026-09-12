'use client';

import { useEffect, useMemo, useState } from 'react';

import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import {
  dayPlanDraftSignature,
  loadDayPlanDraft,
  saveDayPlanDraft,
} from '@/lib/plans/dayPlanDraftStore';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplate } from '@/lib/plans';

type DraftSource = 'blank' | 'dated' | 'reusable';

export interface EmbeddedDayPlannerProps {
  dateLocal: string;
  blankTemplate: PlanDayTemplate;
  datedTemplate: PlanDayTemplate | null;
  templates: PlanDayTemplate[];
  busy: boolean;
  onApplyReusable: (templateId: string, dateLocal: string) => Promise<void> | void;
  onCreateAndApply: (draft: PlanDayTemplate, dateLocal: string) => Promise<void> | void;
  onSaveDated: (draft: PlanDayTemplate, dateLocal: string) => Promise<void> | void;
  onApplied: () => void;
}

function dateLabel(dateLocal: string): string {
  const [year, month, day] = dateLocal.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function EmbeddedDayPlanner({
  dateLocal,
  blankTemplate,
  datedTemplate,
  templates,
  busy,
  onApplyReusable,
  onCreateAndApply,
  onSaveDated,
  onApplied,
}: EmbeddedDayPlannerProps) {
  const initial = datedTemplate ?? blankTemplate;
  const [baseline, setBaseline] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [source, setSource] = useState<DraftSource>(datedTemplate ? 'dated' : 'blank');
  const [query, setQuery] = useState('');
  const draftStorageId = `week-date:${dateLocal}`;

  useEffect(() => {
    const next = datedTemplate ?? blankTemplate;
    const restored =
      typeof window === 'undefined'
        ? null
        : loadDayPlanDraft(
            window.localStorage,
            next.person_id,
            draftStorageId,
            next.updated_at || null,
          );
    setBaseline(next);
    setDraft(restored ?? next);
    setSource(datedTemplate ? 'dated' : 'blank');
    setQuery('');
  }, [
    blankTemplate,
    dateLocal,
    datedTemplate,
    draftStorageId,
  ]);

  const dirty = dayPlanDraftSignature(draft) !== dayPlanDraftSignature(baseline);

  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return;
    saveDayPlanDraft(
      window.localStorage,
      draft.person_id,
      draftStorageId,
      baseline.updated_at || null,
      draft,
    );
  }, [baseline.updated_at, dirty, draft, draftStorageId]);

  const matchingTemplates = useMemo(
    () =>
      templates.filter((template) =>
        template.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query, templates],
  );

  function replaceDraft(next: PlanDayTemplate, nextSource: DraftSource) {
    if (dirty && !window.confirm('Replace the current unsaved Day Plan draft?')) return;
    setBaseline(next);
    setDraft(next);
    setSource(nextSource);
  }

  async function saveOrApply() {
    if (source === 'dated') {
      await onSaveDated(draft, dateLocal);
    } else if (source === 'reusable' && !dirty && draft.id) {
      await onApplyReusable(draft.id, dateLocal);
    } else {
      await onCreateAndApply(draft, dateLocal);
    }
    onApplied();
  }

  const actionLabel =
    source === 'dated'
      ? 'Save Day'
      : source === 'reusable' && !dirty
        ? 'Apply Day Plan'
        : source === 'reusable'
          ? 'Make a copy & apply'
          : 'Save & apply';

  return (
    <div data-testid="embedded-day-planner" className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
          Planning {dateLabel(dateLocal)}
        </p>
        <p className="mt-1 text-sm text-white/65">
          This date is selected automatically. Nothing changes until you use {actionLabel}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-white/10 py-3">
        <input
          aria-label="Day Plan name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className="mr-auto min-w-44 flex-1 border-0 bg-transparent px-2 py-2 text-sm font-semibold outline-none focus:bg-white/[0.04]"
        />
        <button
          type="button"
          onClick={() => replaceDraft(blankTemplate, 'blank')}
          className="rounded-full border border-white/15 px-3 py-2 text-xs hover:bg-white/10"
        >
          New
        </button>
      </div>

      <details className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
        <summary className="cursor-pointer text-sm font-semibold">Open a reusable Day Plan</summary>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Day Plans"
          className="mt-4 w-full rounded-full border border-white/15 bg-white/[0.06] px-4 py-3 text-sm outline-none"
        />
        <ul className="mt-2 max-h-48 divide-y divide-white/10 overflow-y-auto">
          {matchingTemplates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => replaceDraft(template, 'reusable')}
                className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left hover:bg-white/[0.04]"
              >
                <span>
                  <span className="block text-sm font-medium">{template.name}</span>
                  <span className="text-[11px] text-white/45">
                    {template.slots.length} occasions · {countTemplateMeals(template)} Meals
                  </span>
                </span>
                <span aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      </details>

      <TemplateDayEditor template={draft} busy={busy} onChange={setDraft} />

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 bg-[#29231d]/95 py-4 backdrop-blur">
        <p className="text-xs text-white/45">
          {countTemplateMeals(draft)} Meal{countTemplateMeals(draft) === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          disabled={busy || (source === 'dated' && !dirty)}
          onClick={() => void saveOrApply()}
          className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-35"
        >
          {busy ? 'Saving…' : actionLabel}
        </button>
      </div>
    </div>
  );
}
