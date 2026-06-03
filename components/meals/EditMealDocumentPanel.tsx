'use client';

/**
 * Meal Object Foundation — Packet 12: Review / Edit a MealDocument.
 *
 * A lightweight panel for safely reviewing and editing a reusable Meal Library
 * item (especially needs_review imports) via the P12 endpoint:
 *
 *   PATCH /api/journal/meals/documents/[id]
 *
 * SCOPE / SAFETY (P12):
 *   - Edits the saved SOURCE document going forward. It does NOT change meals
 *     already logged — logged entries snapshot their own meal_group. The panel
 *     states this explicitly.
 *   - Only the safe field surface is editable here (title/description/prep
 *     notes/serving label/yield, per-component display name/quantity/unit/prep
 *     note/needs_review, step text, and a confirm toggle). No food re-matching.
 *   - The fetch uses `credentials: 'include'`; person identity is NEVER sent —
 *     it is derived server-side. The server is the source of truth for
 *     validation, deterministic recompute, and conservative review_state.
 *   - Only changed fields are sent, so a metadata-only edit never triggers a
 *     server-side nutrition recompute.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type {
  MealComponent,
  MealDocument,
  MealReviewState,
  MealStep,
} from '@/lib/meals/types';

interface ComponentDraft {
  component_id: string;
  name: string;
  quantity: string;
  unit: string;
  preparation_note: string;
  needs_review: boolean;
}

interface StepDraft {
  step_number: number;
  instruction: string;
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface PatchComponentEdit {
  component_id: string;
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  preparation_note?: string | null;
  needs_review?: boolean;
}

interface EditPatch {
  title?: string;
  description?: string | null;
  prep_notes?: string | null;
  serving_label?: string | null;
  recipe_yield_servings?: number | null;
  review_state?: MealReviewState;
  components?: PatchComponentEdit[];
  steps?: { step_number: number; instruction: string }[];
}

/** Trim a free-text field; empty string ⇒ null (clears the field server-side). */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function componentToDraft(c: MealComponent): ComponentDraft {
  return {
    component_id: c.component_id,
    name: c.name ?? '',
    quantity: c.quantity != null ? String(c.quantity) : '',
    unit: c.unit ?? '',
    preparation_note: c.preparation_note ?? '',
    needs_review: Boolean(c.needs_review),
  };
}

function stepsToDrafts(steps: MealStep[] | undefined): StepDraft[] {
  return [...(steps ?? [])]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => ({ step_number: s.step_number, instruction: s.instruction }));
}

export function EditMealDocumentPanel({
  document,
  kindLabel,
  onClose,
  onSaved,
}: {
  document: MealDocument;
  kindLabel: string;
  onClose: () => void;
  /** Called with the persisted document so the parent can refresh its caches. */
  onSaved: (updated: MealDocument) => void;
}) {
  const isRecipe = document.kind === 'recipe';

  const [title, setTitle] = useState(document.title ?? '');
  const [description, setDescription] = useState(document.description ?? '');
  const [prepNotes, setPrepNotes] = useState(document.prep_notes ?? '');
  const [servingLabel, setServingLabel] = useState(document.serving_label ?? '');
  const [yieldServings, setYieldServings] = useState(
    document.recipe_yield_servings != null ? String(document.recipe_yield_servings) : '',
  );
  const [components, setComponents] = useState<ComponentDraft[]>(() =>
    document.components.map(componentToDraft),
  );
  const [steps, setSteps] = useState<StepDraft[]>(() => stepsToDrafts(document.steps));
  const [markConfirmed, setMarkConfirmed] = useState(document.review_state === 'confirmed');

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downgraded, setDowngraded] = useState(false);

  const titleId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const titleValid = title.trim().length > 0;
  const yieldValid =
    yieldServings.trim() === '' || (Number.isFinite(Number(yieldServings)) && Number(yieldServings) > 0);
  const componentsValid = components.every(
    (c) => c.quantity.trim() === '' || (Number.isFinite(Number(c.quantity)) && Number(c.quantity) > 0),
  );
  const formValid = titleValid && yieldValid && componentsValid;

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'saving') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const updateComponent = useCallback(
    (id: string, patch: Partial<ComponentDraft>) => {
      setComponents((prev) =>
        prev.map((c) => (c.component_id === id ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const updateStep = useCallback((stepNumber: number, instruction: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.step_number === stepNumber ? { ...s, instruction } : s)),
    );
  }, []);

  /** Build a minimal patch of only the fields that actually changed. */
  const buildPatch = useCallback((): EditPatch => {
    const patch: EditPatch = {};

    if (title.trim() !== (document.title ?? '')) patch.title = title.trim();
    if (textOrNull(description) !== (document.description ?? null)) {
      patch.description = textOrNull(description);
    }
    if (textOrNull(prepNotes) !== (document.prep_notes ?? null)) {
      patch.prep_notes = textOrNull(prepNotes);
    }
    if (textOrNull(servingLabel) !== (document.serving_label ?? null)) {
      patch.serving_label = textOrNull(servingLabel);
    }

    if (isRecipe) {
      const nextYield = yieldServings.trim() === '' ? null : Number(yieldServings);
      if (nextYield !== (document.recipe_yield_servings ?? null)) {
        patch.recipe_yield_servings = nextYield;
      }
    }

    // Components — sparse list of only the components that changed.
    const original = new Map(document.components.map((c) => [c.component_id, c]));
    const changedComponents: PatchComponentEdit[] = [];
    for (const draft of components) {
      const src = original.get(draft.component_id);
      if (!src) continue;
      const edit: PatchComponentEdit = { component_id: draft.component_id };
      let changed = false;
      if (draft.name.trim() !== (src.name ?? '') && draft.name.trim().length > 0) {
        edit.name = draft.name.trim();
        changed = true;
      }
      const nextQty = draft.quantity.trim() === '' ? null : Number(draft.quantity);
      if (nextQty !== (src.quantity ?? null)) {
        edit.quantity = nextQty;
        changed = true;
      }
      const nextUnit = textOrNull(draft.unit);
      if (nextUnit !== (src.unit ?? null)) {
        edit.unit = nextUnit;
        changed = true;
      }
      const nextPrep = textOrNull(draft.preparation_note);
      if (nextPrep !== (src.preparation_note ?? null)) {
        edit.preparation_note = nextPrep;
        changed = true;
      }
      if (draft.needs_review !== Boolean(src.needs_review)) {
        edit.needs_review = draft.needs_review;
        changed = true;
      }
      if (changed) changedComponents.push(edit);
    }
    if (changedComponents.length > 0) patch.components = changedComponents;

    // Steps — send the full ordered list when any instruction text changed.
    const originalSteps = stepsToDrafts(document.steps);
    const stepsChanged =
      steps.length !== originalSteps.length ||
      steps.some((s, idx) => s.instruction.trim() !== (originalSteps[idx]?.instruction ?? ''));
    if (stepsChanged) {
      patch.steps = steps
        .map((s, idx) => ({ step_number: idx + 1, instruction: s.instruction.trim() }))
        .filter((s) => s.instruction.length > 0);
    }

    // Review state — only when the confirm toggle moved.
    const wasConfirmed = document.review_state === 'confirmed';
    if (markConfirmed !== wasConfirmed) {
      patch.review_state = markConfirmed ? 'confirmed' : 'needs_review';
    }

    return patch;
  }, [
    title,
    description,
    prepNotes,
    servingLabel,
    yieldServings,
    components,
    steps,
    markConfirmed,
    document,
    isRecipe,
  ]);

  const hasChanges = useMemo(
    () => Object.keys(buildPatch()).length > 0,
    [buildPatch],
  );

  const handleSave = useCallback(async () => {
    if (!formValid) {
      setError('Please fix the highlighted fields before saving.');
      setStatus('error');
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('saving');
    setError(null);
    setDowngraded(false);

    try {
      const res = await fetch(`/api/journal/meals/documents/${document.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `Could not save changes (${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON error body — keep the status-code message.
        }
        throw new Error(message);
      }

      const body = (await res.json()) as {
        document: MealDocument;
        review_state_downgraded?: boolean;
      };
      if (controller.signal.aborted) return;
      setDowngraded(Boolean(body.review_state_downgraded));
      setStatus('success');
      onSaved(body.document);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not save changes.');
      setStatus('error');
    }
  }, [formValid, buildPatch, document.id, onClose, onSaved]);

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50';
  const labelClass =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => {
        if (status !== 'saving') onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-white/[0.08] bg-[#1c1611] shadow-large outline-none sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-brand-50 antialiased">
              Edit {kindLabel.toLowerCase()}
            </h2>
            <p className="mt-0.5 truncate text-sm text-white/55 antialiased">
              {document.title || 'Untitled'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'saving'}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-full p-1.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {status === 'success' ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-500/15">
              <svg className="h-6 w-6 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="mt-4 text-base font-semibold text-brand-50 antialiased">Changes saved</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-white/55 antialiased">
              {downgraded
                ? "Saved, but this item still needs review before it can be confirmed."
                : 'Your saved library item is updated. Past logged meals are unchanged.'}
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs leading-relaxed text-white/55 antialiased">
                Editing updates this saved {kindLabel.toLowerCase()} going forward. It does
                not change meals you have already logged — those stay as recorded.
              </div>

              {/* Basics */}
              <div className="space-y-4">
                <label className="block">
                  <span className={labelClass}>Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    aria-invalid={!titleValid}
                    className={`${inputClass} ${titleValid ? '' : 'border-red-400/50 focus:border-red-400/70'}`}
                  />
                  {!titleValid && (
                    <span className="mt-1.5 block text-xs text-red-300 antialiased">
                      Title is required.
                    </span>
                  )}
                </label>

                <label className="block">
                  <span className={labelClass}>Description <span className="text-white/30">(optional)</span></span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Serving label <span className="text-white/30">(optional)</span></span>
                    <input
                      type="text"
                      value={servingLabel}
                      onChange={(e) => setServingLabel(e.target.value)}
                      placeholder="e.g. per bowl"
                      className={inputClass}
                    />
                  </label>
                  {isRecipe && (
                    <label className="block">
                      <span className={labelClass}>Yield (servings)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={yieldServings}
                        onChange={(e) => setYieldServings(e.target.value)}
                        aria-invalid={!yieldValid}
                        className={`${inputClass} ${yieldValid ? '' : 'border-red-400/50 focus:border-red-400/70'}`}
                      />
                      {!yieldValid && (
                        <span className="mt-1.5 block text-xs text-red-300 antialiased">
                          Must be a number greater than 0, or blank.
                        </span>
                      )}
                    </label>
                  )}
                </div>

                <label className="block">
                  <span className={labelClass}>Prep notes <span className="text-white/30">(optional)</span></span>
                  <textarea
                    value={prepNotes}
                    onChange={(e) => setPrepNotes(e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </label>
              </div>

              {/* Components */}
              {components.length > 0 && (
                <div>
                  <p className={labelClass}>
                    {isRecipe ? 'Ingredients' : 'Components'}
                  </p>
                  <div className="space-y-3">
                    {components.map((c) => {
                      const qtyValid =
                        c.quantity.trim() === '' ||
                        (Number.isFinite(Number(c.quantity)) && Number(c.quantity) > 0);
                      return (
                        <div
                          key={c.component_id}
                          className="rounded-xl border border-white/10 bg-white/[0.025] p-3"
                        >
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => updateComponent(c.component_id, { name: e.target.value })}
                            placeholder="Name"
                            className={`${inputClass} mb-2`}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="any"
                              value={c.quantity}
                              onChange={(e) => updateComponent(c.component_id, { quantity: e.target.value })}
                              placeholder="Qty"
                              aria-invalid={!qtyValid}
                              className={`${inputClass} ${qtyValid ? '' : 'border-red-400/50 focus:border-red-400/70'}`}
                            />
                            <input
                              type="text"
                              value={c.unit}
                              onChange={(e) => updateComponent(c.component_id, { unit: e.target.value })}
                              placeholder="Unit"
                              className={inputClass}
                            />
                          </div>
                          <input
                            type="text"
                            value={c.preparation_note}
                            onChange={(e) =>
                              updateComponent(c.component_id, { preparation_note: e.target.value })
                            }
                            placeholder="Prep note (e.g. diced)"
                            className={`${inputClass} mt-2`}
                          />
                          <label className="mt-2 flex items-center gap-2 text-xs text-white/60 antialiased">
                            <input
                              type="checkbox"
                              checked={c.needs_review}
                              onChange={(e) =>
                                updateComponent(c.component_id, { needs_review: e.target.checked })
                              }
                              className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-amber-400"
                            />
                            Needs review
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Steps */}
              {steps.length > 0 && (
                <div>
                  <p className={labelClass}>Instructions</p>
                  <div className="space-y-2">
                    {steps.map((s) => (
                      <div key={s.step_number} className="flex gap-2">
                        <span className="mt-2.5 shrink-0 text-xs font-semibold text-white/40">
                          {s.step_number}.
                        </span>
                        <textarea
                          value={s.instruction}
                          onChange={(e) => updateStep(s.step_number, e.target.value)}
                          rows={2}
                          className={`${inputClass} resize-none`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm toggle */}
              <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={markConfirmed}
                  onChange={(e) => setMarkConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-emerald-400"
                />
                <span className="text-sm text-white/70 antialiased">
                  Mark as confirmed (reviewed)
                  <span className="mt-0.5 block text-xs text-white/40">
                    Confirmation is only applied if the item is safe — recipes need a yield and
                    all components must be reviewed.
                  </span>
                </span>
              </label>

              {status === 'error' && error && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200 antialiased">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={status === 'saving'}
                className="inline-flex justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!formValid || !hasChanges || status === 'saving'}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'saving' && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-transparent" />
                )}
                {status === 'saving' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
