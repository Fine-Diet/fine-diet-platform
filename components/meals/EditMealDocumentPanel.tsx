'use client';

/**
 * Package 5A — edit a reusable MealDocument via the shared Meal Composer.
 *
 * PATCH /api/journal/meals/documents/[id] with set_components so recipe
 * references, snapshots, and component_id identity survive edit/save/reopen.
 */

import { useEffect, useReducer, useRef, useState } from 'react';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import type { MealDocument } from '@/lib/meals/types';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export function EditMealDocumentPanel({
  document,
  kindLabel,
  onClose,
  onSaved,
}: {
  document: MealDocument;
  kindLabel: string;
  onClose: () => void;
  onSaved: (document: MealDocument) => void;
}) {
  const [state, dispatch] = useReducer(composerReducer, undefined, () =>
    createComposerState('edit-saved', document),
  );
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'saving') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSave() {
    const validation = validateComposerStateForSubmit(state);
    if (!validation.ok) {
      setError(validation.errors[0] ?? 'Fix the highlighted fields before saving.');
      setStatus('error');
      return;
    }

    setStatus('saving');
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const draft = state.document;
      const patch = {
        title: draft.title.trim(),
        description: draft.description,
        prep_notes: draft.prep_notes,
        serving_label: draft.serving_label,
        recipe_yield_servings: draft.recipe_yield_servings,
        review_state: draft.review_state,
        steps: draft.steps,
        set_components: draft.components,
      };

      const res = await fetch(`/api/journal/meals/documents/${document.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        document?: MealDocument;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not save changes.');
      }
      if (!body.document) {
        throw new Error('Save succeeded but no document was returned.');
      }
      setStatus('success');
      onSaved(body.document);
      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not save changes.');
      setStatus('error');
    }
  }

  const actions: MealComposerActionHandlers = {
    save_changes: { label: 'Save changes', onRun: handleSave },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && status !== 'saving') onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-meal-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#16110d] p-5 shadow-large sm:p-7"
      >
        <MealComposer
          state={state}
          dispatch={dispatch}
          actions={actions}
          headerTitle={`Edit ${kindLabel}`}
          helperText="Recipe portions keep a live reference plus an immutable snapshot. Editing this meal does not rewrite past logs."
          error={error}
          submitting={status === 'saving'}
        />
        <button
          type="button"
          onClick={onClose}
          disabled={status === 'saving'}
          className="mt-4 text-xs text-white/60 hover:text-white/80 disabled:text-white/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
