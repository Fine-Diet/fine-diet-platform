'use client';

/**
 * Meal Object Foundation — create a reusable MealDocument from the Meal Library.
 *
 * POST /api/journal/meals/documents via the shared Meal Composer 'create' mode.
 * Person identity is derived server-side; the client never sends person_id.
 */

import { useEffect, useReducer, useRef, useState } from 'react';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import {
  composerReducer,
  createBlankMealDocument,
  createComposerState,
} from '@/lib/meals/composer/state';
import { buildDocumentForCreate } from '@/lib/meals/composer/submission';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import type { MealDocument, MealDocumentKind } from '@/lib/meals/types';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export function CreateMealDocumentPanel({
  onClose,
  onCreated,
  initialKind = 'meal',
}: {
  onClose: () => void;
  onCreated?: (document: MealDocument) => void;
  /** Optional Food Home / library entry kind for the shared create composer. */
  initialKind?: MealDocumentKind;
}) {
  const [state, dispatch] = useReducer(composerReducer, undefined, () =>
    createComposerState('create', {
      ...createBlankMealDocument(),
      kind: initialKind,
    }),
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
      const document = buildDocumentForCreate(state);
      const res = await fetch('/api/journal/meals/documents', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        document?: MealDocument;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not save this meal.');
      }
      if (!body.document) {
        throw new Error('Save succeeded but no document was returned.');
      }
      setStatus('success');
      onCreated?.(body.document);
      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not save this meal.');
      setStatus('error');
    }
  }

  const actions: MealComposerActionHandlers = {
    save: {
      label: initialKind === 'recipe' ? 'Save recipe' : 'Save meal',
      onRun: handleSave,
    },
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
        aria-labelledby="create-meal-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#16110d] p-5 shadow-large sm:p-7"
      >
        <MealComposer
          state={state}
          dispatch={dispatch}
          actions={actions}
          headerTitle={initialKind === 'recipe' ? 'Add a reusable recipe' : 'Add a reusable meal'}
          helperText={
            initialKind === 'recipe'
              ? 'Saved recipes live in your Meal Library. You can turn one into a meal later.'
              : 'Saved meals live in your Meal Library. Logging a meal later creates a separate journal snapshot.'
          }
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
