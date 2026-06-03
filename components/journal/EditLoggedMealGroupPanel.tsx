'use client';

/**
 * Meal Object Foundation — Packet 16: Edit a LOGGED grouped meal instance.
 *
 * A lightweight modal that lets the user adjust a single logged grouped meal
 * journal entry via the dedicated P16 endpoint:
 *
 *   PATCH /api/journal/entries/[id]/meal-group
 *
 * SCOPE / SAFETY (P16 MVP):
 *   - Edits ONLY this logged instance. The copy makes clear the saved Meal
 *     Library item is NOT changed; the server never touches the source
 *     MealDocument and stamps meal_group.detached_from_source = true.
 *   - Person identity is NEVER sent from the client — the route derives it from
 *     the authenticated session (fetch via journalService uses session cookies).
 *   - MVP editable fields: display name, consumed servings, instance note.
 *     Component-level instance editing is intentionally deferred.
 *   - Client-side validation only guards obvious mistakes (servings must be a
 *     finite number > 0); the server route remains the source of truth.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { journalService, type JournalEntry } from '@/lib/journal';
import { buildGroupedMealView } from '@/lib/meals/loggedMealGroup';

type SubmitStatus = 'idle' | 'submitting' | 'error';

export function EditLoggedMealGroupPanel({
  entryId,
  payload,
  onClose,
  onSaved,
}: {
  entryId: string;
  /** The grouped intake payload (must carry meal_group). */
  payload: unknown;
  onClose: () => void;
  /** Called after a successful save with the updated entry. */
  onSaved?: (entry: JournalEntry) => void;
}) {
  const view = useMemo(() => buildGroupedMealView(payload), [payload]);

  const [name, setName] = useState(view?.name ?? '');
  const [servings, setServings] = useState(
    view?.consumedServings != null ? String(view.consumedServings) : '1',
  );
  const [note, setNote] = useState(view?.instanceNotes ?? '');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const parsedServings = useMemo(() => {
    const value = Number(servings);
    return Number.isFinite(value) ? value : NaN;
  }, [servings]);

  const servingsValid = Number.isFinite(parsedServings) && parsedServings > 0;
  const nameValid = name.trim().length > 0;
  const canSubmit = servingsValid && nameValid && status !== 'submitting';

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'submitting') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, status]);

  const handleSubmit = useCallback(async () => {
    if (!servingsValid || !nameValid) {
      setError('Enter a meal name and a number of servings greater than 0.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setError(null);

    try {
      const updated = await journalService.updateGroupedMealInstance(entryId, {
        name: name.trim(),
        consumed_servings: parsedServings,
        instance_note: note.trim() ? note.trim() : null,
      });

      if (!updated) throw new Error('Could not save this meal.');
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this meal.');
      setStatus('error');
    }
  }, [servingsValid, nameValid, entryId, name, parsedServings, note, onSaved]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => {
        if (status !== 'submitting') onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-white/[0.08] bg-[#1c1611] shadow-large outline-none sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-brand-50 antialiased">
              Edit logged meal
            </h2>
            <p className="mt-0.5 truncate text-sm text-white/55 antialiased">
              {view?.name || 'Meal'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === 'submitting'}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-full p-1.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs leading-relaxed text-white/60 antialiased">
            This changes only this logged meal, not the saved Meal Library item.
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Meal name
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              aria-invalid={!nameValid}
              className={`w-full rounded-xl border bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors ${
                nameValid
                  ? 'border-white/10 focus:border-emerald-300/50'
                  : 'border-red-400/50 focus:border-red-400/70'
              }`}
            />
            {!nameValid && (
              <span className="mt-1.5 block text-xs text-red-300 antialiased">
                Meal name is required.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Servings eaten
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              aria-invalid={!servingsValid}
              className={`w-full rounded-xl border bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors ${
                servingsValid
                  ? 'border-white/10 focus:border-emerald-300/50'
                  : 'border-red-400/50 focus:border-red-400/70'
              }`}
            />
            {!servingsValid && (
              <span className="mt-1.5 block text-xs text-red-300 antialiased">
                Servings must be a number greater than 0.
              </span>
            )}
            <span className="mt-1.5 block text-xs text-white/40 antialiased">
              Calories and macros re-scale with servings when this meal&apos;s nutrition is known.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Note <span className="text-white/30">(optional)</span>
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. half portion, ate at work"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50"
            />
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
            disabled={status === 'submitting'}
            className="inline-flex justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'submitting' && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-transparent" />
            )}
            {status === 'submitting' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
