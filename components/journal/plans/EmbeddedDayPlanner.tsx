'use client';

import { useEffect, useMemo, useState } from 'react';

import { TemplateDayEditor } from '@/components/journal/plans/reusable/TemplateDayEditor';
import {
  clearDayPlanDraft,
  dayPlanDraftSignature,
  loadDayPlanDraftSession,
  saveDayPlanDraftSession,
} from '@/lib/plans/dayPlanDraftStore';
import {
  embeddedDayEditorSessionKey,
  embeddedDayPlanDraftId,
  type CreateAndApplyResult,
  type DayActionOutcome,
} from '@/lib/plans/dayPlanActions';
import { countTemplateMeals } from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplate } from '@/lib/plans';

type DraftSource = 'blank' | 'dated' | 'reusable';

export interface EmbeddedDayPlannerProps {
  dateLocal: string;
  blankTemplate: PlanDayTemplate;
  datedTemplate: PlanDayTemplate | null;
  templates: PlanDayTemplate[];
  busy: boolean;
  draftContext?: 'week' | 'month';
  hideInlineLibrary?: boolean;
  pendingLibrarySelection?: PlanDayTemplate | null;
  onPendingLibrarySelectionHandled?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onApplyReusable: (templateId: string, dateLocal: string) => Promise<DayActionOutcome>;
  onCreateAndApply: (
    draft: PlanDayTemplate,
    dateLocal: string,
    existingSavedTemplateId?: string | null,
  ) => Promise<CreateAndApplyResult>;
  onSaveDated: (draft: PlanDayTemplate, dateLocal: string) => Promise<DayActionOutcome>;
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
  draftContext = 'week',
  hideInlineLibrary = false,
  pendingLibrarySelection = null,
  onPendingLibrarySelectionHandled,
  onDirtyChange,
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingSavedTemplateId, setPendingSavedTemplateId] = useState<string | null>(null);
  const [pendingSavedSnapshot, setPendingSavedSnapshot] = useState<PlanDayTemplate | null>(null);
  const draftStorageId = embeddedDayPlanDraftId(draftContext, dateLocal);
  const sessionKey = embeddedDayEditorSessionKey({
    personId: blankTemplate.person_id,
    dateLocal,
    context: draftContext,
  });
  const datedFreshnessKey = datedTemplate
    ? `${datedTemplate.source_plan_day_id}:${datedTemplate.updated_at}`
    : 'none';

  useEffect(() => {
    const next = datedTemplate ?? blankTemplate;
    const inferredSource: DraftSource = datedTemplate ? 'dated' : 'blank';
    const restored =
      typeof window === 'undefined'
        ? null
        : loadDayPlanDraftSession(
            window.localStorage,
            next.person_id,
            draftStorageId,
            next,
            inferredSource,
            {
              datedTemplate,
              reusableTemplates: templates,
            },
          );
    setBaseline(restored?.baseline ?? next);
    setDraft(restored?.draft ?? next);
    setSource(restored?.source ?? inferredSource);
    setQuery('');
    setActionError(restored?.actionError ?? null);
    setPendingSavedTemplateId(restored?.pendingSavedTemplateId ?? null);
    setPendingSavedSnapshot(restored?.pendingSavedSnapshot ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blankTemplate/datedTemplate/templates object churn must not reinitialize.
  }, [sessionKey, draftStorageId, datedFreshnessKey]);

  useEffect(() => {
    if (!pendingLibrarySelection) return;
    replaceDraft(pendingLibrarySelection, 'reusable');
    onPendingLibrarySelectionHandled?.();
  }, [pendingLibrarySelection, onPendingLibrarySelectionHandled]);

  const dirty = dayPlanDraftSignature(draft) !== dayPlanDraftSignature(baseline);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const inferredSource: DraftSource = datedTemplate ? 'dated' : 'blank';
    if (!dirty && !pendingSavedTemplateId && source === inferredSource && !actionError) {
      return;
    }
    saveDayPlanDraftSession(
      window.localStorage,
      draft.person_id,
      draftStorageId,
      {
        draft,
        baseline,
        source,
        pendingSavedTemplateId,
        pendingSavedSnapshot,
        actionError,
      },
    );
  }, [
    actionError,
    baseline,
    datedTemplate,
    dirty,
    draft,
    draftStorageId,
    pendingSavedSnapshot,
    pendingSavedTemplateId,
    source,
  ]);

  const matchingTemplates = useMemo(
    () =>
      templates.filter((template) =>
        template.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query, templates],
  );

  function replaceDraft(next: PlanDayTemplate, nextSource: DraftSource) {
    if (dirty && !window.confirm('Replace the current unsaved Day Plan draft?')) return false;
    setBaseline(next);
    setDraft(next);
    setSource(nextSource);
    setPendingSavedTemplateId(null);
    setPendingSavedSnapshot(null);
    setActionError(null);
    return true;
  }

  function adoptSavedIdentity(saved: PlanDayTemplate, savedTemplateId: string) {
    setPendingSavedTemplateId(savedTemplateId);
    setPendingSavedSnapshot(saved);
    setBaseline(saved);
    setDraft(saved);
    setSource('reusable');
  }

  async function saveOrApply() {
    setActionError(null);
    try {
      let succeeded = false;
      if (source === 'dated') {
        const outcome = await onSaveDated(draft, dateLocal);
        succeeded = outcome === 'applied';
      } else if (pendingSavedTemplateId && !dirty) {
        const outcome = await onApplyReusable(pendingSavedTemplateId, dateLocal);
        if (outcome === 'applied') {
          succeeded = true;
          setPendingSavedTemplateId(null);
          setPendingSavedSnapshot(null);
        }
      } else if (source === 'reusable' && !dirty && draft.id && !pendingSavedTemplateId) {
        const outcome = await onApplyReusable(draft.id, dateLocal);
        succeeded = outcome === 'applied';
      } else {
        const retryId =
          pendingSavedTemplateId && !dirty ? pendingSavedTemplateId : null;
        const result = await onCreateAndApply(draft, dateLocal, retryId);
        if (result.applyError) {
          setActionError(result.applyError);
        }
        if (result.outcome === 'applied') {
          succeeded = true;
          setPendingSavedTemplateId(null);
          setPendingSavedSnapshot(null);
        } else if (result.savedTemplateId) {
          const saved =
            result.savedTemplate ??
            pendingSavedSnapshot ??
            ({ ...draft, id: result.savedTemplateId } as PlanDayTemplate);
          adoptSavedIdentity(saved, result.savedTemplateId);
        }
      }
      if (succeeded) {
        if (typeof window !== 'undefined') {
          clearDayPlanDraft(window.localStorage, draft.person_id, draftStorageId);
        }
        onApplied();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save this Day Plan.');
    }
  }

  const actionLabel =
    pendingSavedTemplateId && !dirty
      ? 'Apply Day Plan'
      : source === 'dated'
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
        {pendingSavedTemplateId ? (
          <p className="mt-2 text-xs text-amber-200/90">
            Day Plan saved. Apply it to this date when you are ready.
          </p>
        ) : null}
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

      {!hideInlineLibrary ? (
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
      ) : null}

      <TemplateDayEditor template={draft} busy={busy} onChange={setDraft} />

      {actionError ? (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {actionError}
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 bg-[#29231d]/95 py-4 backdrop-blur">
        <p className="text-xs text-white/45">
          {countTemplateMeals(draft)} Meal{countTemplateMeals(draft) === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          disabled={busy || (source === 'dated' && !dirty && !pendingSavedTemplateId)}
          onClick={() => void saveOrApply()}
          className="rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black disabled:opacity-35"
        >
          {busy ? 'Saving…' : actionLabel}
        </button>
      </div>
    </div>
  );
}
