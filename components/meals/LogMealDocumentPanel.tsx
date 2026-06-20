'use client';

/**
 * Meal Object Foundation — Packet 11: Log a MealDocument from the Meal Library.
 *
 * A lightweight modal that lets the user log a reusable meal/recipe as EXACTLY
 * ONE grouped journal intake entry via the existing P5 endpoint:
 *
 *   POST /api/journal/meals/documents/[id]/log
 *
 * SCOPE / SAFETY (P11):
 *   - Read-only with respect to the source MealDocument: this panel only POSTs
 *     a log request. It never edits/deletes/mutates meal_documents.
 *   - Person identity is NEVER sent from the client — the P5 route derives it
 *     from the authenticated session. The fetch uses `credentials: 'include'`.
 *   - The request body matches the P5 contract: { date, time, consumed_servings,
 *     note }. The server combines date+time (default 12:00) into occurred_at.
 *   - Client-side validation only guards obvious mistakes (servings must be a
 *     finite number > 0); the P5 route remains the source of truth.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

/** Minimal projection of the meal being logged (no source mutation). */
export interface LogMealTarget {
  id: string;
  title: string;
  /** Display label, e.g. "Recipe" or "Meal". */
  kindLabel: string;
  /**
   * Whether this document is a Recipe. Drives serving-vs-yield copy: a recipe
   * is a reusable preparation that yields several servings, so logging it means
   * recording the PORTION consumed — never the whole batch by default.
   */
  isRecipe?: boolean;
  /**
   * Preparation yield in servings, when known. Shown only as context so the
   * user can see the recipe's batch size is distinct from how much they log.
   */
  yieldServings?: number | null;
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

/** One-tap serving multipliers for the common fractional/whole portions. */
const SERVING_PRESETS = [0.5, 1, 1.5, 2] as const;

/** Local YYYY-MM-DD for `today`. */
function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local HH:mm for the current time. */
function nowLocalTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

export function LogMealDocumentPanel({
  target,
  onClose,
  onLogged,
}: {
  target: LogMealTarget;
  onClose: () => void;
  /** Called after a successful log (parent may refresh / show a toast). */
  onLogged?: () => void;
}) {
  const [date, setDate] = useState(() => todayLocalDate());
  const [time, setTime] = useState(() => nowLocalTime());
  const [servings, setServings] = useState('1');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const isRecipe = target.isRecipe ?? false;
  const yieldServings =
    typeof target.yieldServings === 'number' && target.yieldServings > 0
      ? target.yieldServings
      : null;

  const titleId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Parse servings once for both validation and submit.
  const parsedServings = useMemo(() => {
    const value = Number(servings);
    return Number.isFinite(value) ? value : NaN;
  }, [servings]);

  const servingsValid = Number.isFinite(parsedServings) && parsedServings > 0;
  const canSubmit = servingsValid && status !== 'submitting';

  // Close on Escape (unless mid-submit) and focus the dialog on mount.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'submitting') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, status]);

  // Abort any in-flight POST on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSubmit = useCallback(async () => {
    if (!servingsValid) {
      setError('Enter a number of servings greater than 0.');
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('submitting');
    setError(null);

    try {
      const res = await fetch(
        `/api/journal/meals/documents/${target.id}/log`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          // Person identity is intentionally omitted — derived server-side.
          body: JSON.stringify({
            date,
            time: time || undefined,
            consumed_servings: parsedServings,
            note: note.trim() ? note.trim() : undefined,
          }),
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        let message = `Could not log this meal (${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON error body — keep the status-code message.
        }
        throw new Error(message);
      }

      if (controller.signal.aborted) return;
      setStatus('success');
      onLogged?.();
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not log this meal.');
      setStatus('error');
    }
  }, [
    servingsValid,
    target.id,
    date,
    time,
    parsedServings,
    note,
    onLogged,
  ]);

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
            <h2
              id={titleId}
              className="text-lg font-semibold text-brand-50 antialiased"
            >
              {isRecipe ? 'Log recipe' : 'Log meal'}
            </h2>
            <p className="mt-0.5 truncate text-sm text-white/55 antialiased">
              {target.kindLabel} · {target.title || 'Untitled'}
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

        {status === 'success' ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-500/15">
              <svg className="h-6 w-6 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="mt-4 text-base font-semibold text-brand-50 antialiased">
              {isRecipe ? 'Recipe logged' : 'Meal logged'}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-white/55 antialiased">
              Logged {parsedServings} {parsedServings === 1 ? 'serving' : 'servings'} as a
              single grouped entry.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link
                href={APP_ROUTES.log}
                className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
              >
                View log
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Stay here
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors focus:border-emerald-300/50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    Time
                  </span>
                  <input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors focus:border-emerald-300/50"
                  />
                </label>
              </div>

              <div className="block">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                    {isRecipe ? 'Servings from this recipe' : 'Servings'}
                  </span>
                  {isRecipe && yieldServings != null && (
                    <span className="text-[11px] font-medium text-white/35 antialiased">
                      Recipe yields {yieldServings}
                    </span>
                  )}
                </div>

                <div className="mb-2 flex flex-wrap gap-1.5">
                  {SERVING_PRESETS.map((preset) => {
                    const active = servingsValid && parsedServings === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setServings(String(preset))}
                        aria-pressed={active}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold antialiased transition-colors ${
                          active
                            ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100'
                            : 'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        {preset === 1 ? '1 serving' : preset}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={servings}
                  onChange={(event) => setServings(event.target.value)}
                  aria-invalid={!servingsValid}
                  aria-label={isRecipe ? 'Servings from this recipe' : 'Servings'}
                  className={`w-full rounded-xl border bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors ${
                    servingsValid
                      ? 'border-white/10 focus:border-emerald-300/50'
                      : 'border-red-400/50 focus:border-red-400/70'
                  }`}
                />
                {!servingsValid ? (
                  <span className="mt-1.5 block text-xs text-red-300 antialiased">
                    Servings must be a number greater than 0.
                  </span>
                ) : (
                  <span className="mt-1.5 block text-xs text-white/40 antialiased">
                    {isRecipe
                      ? 'Logs just this portion of the recipe — not the whole batch. Calories and macros scale to the servings you pick.'
                      : 'Calories and macros scale to the servings you log.'}
                  </span>
                )}
              </div>

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
                {status === 'submitting' ? 'Logging…' : 'Log meal'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
