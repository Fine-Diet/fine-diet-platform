'use client';

/**
 * Meal Object Foundation — Packet 13: Component Food Re-match selector.
 * Packet 17: Create custom / provisional food from the matcher.
 *
 * A lightweight inline search used inside EditMealDocumentPanel to ground a
 * single MealDocument component against an EXISTING canonical food. It does NOT
 * introduce a new food-search system: it calls the existing
 *
 *   GET /api/foods/search
 *
 * endpoint with the same flat-consumer conventions used elsewhere (e.g. the
 * Pantry direct-add search). Branded/common/custom ranking and sections are the
 * server's responsibility and are left completely untouched — this component
 * only renders the server's `results` and reports the selected food id/name up
 * to the panel's pending edit state. Selecting a result NEVER mutates anything
 * on its own; the actual grounding is persisted by the panel's PATCH save.
 *
 * P17: when search produces no acceptable match, the user can create a
 * user-owned custom/provisional food via the existing
 *
 *   POST /api/foods/custom
 *
 * endpoint (person-scoped, auth-protected; person identity is derived
 * server-side and never sent). The newly created food is a `source_type='user'`
 * food_object that appears in the existing my_foods search section going
 * forward. On success it is reported up via `onSelect` exactly like a search
 * result — it becomes the component's PENDING grounding target and is only
 * persisted to the MealDocument by the panel's existing PATCH save. Creating a
 * custom food never mutates the MealDocument or any logged meal snapshot.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  type FoodSearchResult,
  type FoodObject,
  formatFoodName,
  formatServing,
  formatCalories,
  formatMacros,
} from '@/lib/food/types';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 12;

export interface SelectedFoodGrounding {
  food_object_id: string;
  /** Display name shown for the result, used as the component's display name. */
  name: string;
}

interface FoodSearchApiResult {
  food: FoodObject;
}

/** A numeric form field that is optional but, when present, must be a valid >= 0 number. */
interface NumericField {
  value: string;
  valid: boolean;
}

function numericField(value: string): NumericField {
  const trimmed = value.trim();
  if (trimmed === '') return { value, valid: true };
  const n = Number(trimmed);
  return { value, valid: Number.isFinite(n) && n >= 0 };
}

/** Parse an optional numeric field to a number, or undefined when blank/invalid. */
function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function MealComponentFoodSearch({
  initialQuery,
  onSelect,
  onCancel,
}: {
  /** Seed the search box with the component's current name. */
  initialQuery: string;
  onSelect: (selection: SelectedFoodGrounding) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // P17 — the create-custom-food sub-panel. `view` toggles search ↔ create.
  const [view, setView] = useState<'search' | 'create'>('search');

  const inputId = useId();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Debounced search with stale-request cancellation. Mirrors the existing
  // Pantry direct-add conventions (flat consumer, credentials: include).
  useEffect(() => {
    if (view !== 'search') return;
    const q = query.trim();
    setError(null);
    if (q.length < MIN_QUERY) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          q,
          limit: String(SEARCH_LIMIT),
          sectionLimit: '4',
          consumer: 'flat',
          pageContext: 'meal_component_match',
        });
        const res = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Food search failed.');
        const body = (await res.json()) as { results?: FoodSearchApiResult[] };
        if (controller.signal.aborted) return;
        setResults((body.results ?? []).slice(0, SEARCH_LIMIT) as FoodSearchResult[]);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Food search failed.');
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, view]);

  const handleSelect = useCallback(
    (result: FoodSearchResult) => {
      abortRef.current?.abort();
      onSelect({
        food_object_id: result.food.id,
        name: formatFoodName(result.food),
      });
    },
    [onSelect],
  );

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50';

  const showEmpty =
    touched && !searching && query.trim().length >= MIN_QUERY && results.length === 0 && !error;

  if (view === 'create') {
    return (
      <CreateCustomFoodPanel
        initialName={query.trim() || initialQuery}
        onCreated={(selection) => {
          abortRef.current?.abort();
          onSelect(selection);
        }}
        onBack={() => setView('search')}
      />
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-emerald-300/20 bg-emerald-500/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/70">
          Match to a food
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Cancel
        </button>
      </div>
      <input
        id={inputId}
        type="text"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setTouched(true);
        }}
        placeholder="Search branded, common, or your foods…"
        className={`${inputClass} mt-1.5`}
      />

      {query.trim().length > 0 && query.trim().length < MIN_QUERY && (
        <p className="mt-2 text-xs text-white/40 antialiased">Type at least {MIN_QUERY} characters.</p>
      )}
      {searching && <p className="mt-2 text-xs text-white/45 antialiased">Searching…</p>}
      {error && <p className="mt-2 text-xs text-red-300 antialiased">{error}</p>}
      {showEmpty && (
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-500/[0.06] px-3 py-2.5">
          <p className="text-xs text-amber-100/80 antialiased">
            No matching foods found. You can create your own food with the values you know.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
          {results.map((result) => (
            <li key={result.food.id}>
              <button
                type="button"
                onClick={() => handleSelect(result)}
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-emerald-300/40 hover:bg-emerald-500/10"
              >
                <span className="block truncate text-sm font-medium text-brand-50 antialiased">
                  {formatFoodName(result.food)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/45 antialiased">
                  {formatServing(result.food)} · {formatCalories(result.food.calories)} · {formatMacros(result.food)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* P17 — explicit Create custom food affordance. Always available, and
          emphasized after an empty search. Opens the create sub-panel. */}
      <button
        type="button"
        onClick={() => setView('create')}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/20"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create custom food
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// P17 — Create custom / provisional food sub-panel
// ----------------------------------------------------------------------------

type CreateStatus = 'idle' | 'saving' | 'error';

/**
 * Collects the MVP custom-food fields, validates client-side, and submits to
 * the existing person-scoped `POST /api/foods/custom`. Person identity is never
 * sent — it is derived server-side from the session. On success the created
 * food is reported up via `onCreated` as the component's pending grounding;
 * the MealDocument itself is only mutated by the panel's existing PATCH save.
 */
function CreateCustomFoodPanel({
  initialName,
  onCreated,
  onBack,
}: {
  initialName: string;
  onCreated: (selection: SelectedFoodGrounding) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [servingUnit, setServingUnit] = useState('');
  const [servingSizeG, setServingSizeG] = useState('');
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');

  const [status, setStatus] = useState<CreateStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const nameValid = name.trim().length > 0;

  // Numeric fields are optional, but anything entered must be a valid >= 0 number.
  const numericFields = useMemo(
    () => ({
      servingSizeG: numericField(servingSizeG),
      calories: numericField(calories),
      proteinG: numericField(proteinG),
      carbsG: numericField(carbsG),
      fatG: numericField(fatG),
    }),
    [servingSizeG, calories, proteinG, carbsG, fatG],
  );
  const numericValid = Object.values(numericFields).every((f) => f.valid);
  const formValid = nameValid && numericValid;

  const handleCreate = useCallback(async () => {
    if (!formValid) {
      setError('Please fix the highlighted fields before creating.');
      setStatus('error');
      return;
    }

    // Build the payload from entered values only. We never invent nutrition:
    // blank fields are simply omitted so the food stays provisional and the
    // component/document recompute can remain conservative (needs_review).
    const payload: Record<string, unknown> = { name: name.trim() };
    const unit = servingUnit.trim();
    if (unit) payload.servingUnit = unit;
    const sizeG = toOptionalNumber(servingSizeG);
    if (sizeG !== undefined) payload.servingSizeG = sizeG;
    const cal = toOptionalNumber(calories);
    if (cal !== undefined) payload.calories = cal;
    const protein = toOptionalNumber(proteinG);
    if (protein !== undefined) payload.proteinG = protein;
    const carbs = toOptionalNumber(carbsG);
    if (carbs !== undefined) payload.carbsG = carbs;
    const fat = toOptionalNumber(fatG);
    if (fat !== undefined) payload.fatG = fat;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('saving');
    setError(null);

    try {
      const res = await fetch('/api/foods/custom', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `Could not create food (${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // Non-JSON error body — keep the status-code message.
        }
        throw new Error(message);
      }

      const body = (await res.json()) as { food?: FoodObject };
      if (controller.signal.aborted) return;
      if (!body.food?.id) {
        throw new Error('Custom food was created but could not be selected.');
      }
      onCreated({
        food_object_id: body.food.id,
        name: formatFoodName(body.food),
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not create food.');
      setStatus('error');
    }
  }, [formValid, name, servingUnit, servingSizeG, calories, proteinG, carbsG, fatG, onCreated]);

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50';
  const labelClass =
    'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45';
  const invalidClass = 'border-red-400/50 focus:border-red-400/70';

  return (
    <div className="mt-2 rounded-xl border border-emerald-300/20 bg-emerald-500/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/70">
          Create custom food
        </span>
        <button
          type="button"
          onClick={onBack}
          disabled={status === 'saving'}
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          Back to search
        </button>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-white/50 antialiased">
        This saves a food to your own library going forward. Leave nutrition blank if you don&apos;t
        know it — the food stays provisional and this item keeps needing review.
      </p>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input
            id={nameId}
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!nameValid}
            placeholder="e.g. Grandma's chili"
            className={`${inputClass} ${nameValid ? '' : invalidClass}`}
          />
          {!nameValid && (
            <span className="mt-1.5 block text-xs text-red-300 antialiased">Name is required.</span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>
              Serving unit <span className="text-white/30">(optional)</span>
            </span>
            <input
              type="text"
              value={servingUnit}
              onChange={(e) => setServingUnit(e.target.value)}
              placeholder="e.g. bowl, cup"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>
              Serving size (g) <span className="text-white/30">(optional)</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={servingSizeG}
              onChange={(e) => setServingSizeG(e.target.value)}
              aria-invalid={!numericFields.servingSizeG.valid}
              placeholder="e.g. 240"
              className={`${inputClass} ${numericFields.servingSizeG.valid ? '' : invalidClass}`}
            />
          </label>
        </div>

        <label className="block">
          <span className={labelClass}>
            Calories <span className="text-white/30">(optional, per serving)</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            aria-invalid={!numericFields.calories.valid}
            placeholder="e.g. 320"
            className={`${inputClass} ${numericFields.calories.valid ? '' : invalidClass}`}
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className={labelClass}>Protein (g)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={proteinG}
              onChange={(e) => setProteinG(e.target.value)}
              aria-invalid={!numericFields.proteinG.valid}
              className={`${inputClass} ${numericFields.proteinG.valid ? '' : invalidClass}`}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Carbs (g)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={carbsG}
              onChange={(e) => setCarbsG(e.target.value)}
              aria-invalid={!numericFields.carbsG.valid}
              className={`${inputClass} ${numericFields.carbsG.valid ? '' : invalidClass}`}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Fat (g)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={fatG}
              onChange={(e) => setFatG(e.target.value)}
              aria-invalid={!numericFields.fatG.valid}
              className={`${inputClass} ${numericFields.fatG.valid ? '' : invalidClass}`}
            />
          </label>
        </div>

        {!numericValid && (
          <p className="text-xs text-red-300 antialiased">
            Nutrition values must be numbers of 0 or more.
          </p>
        )}

        {status === 'error' && error && (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 antialiased">
            {error}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={status === 'saving'}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!formValid || status === 'saving'}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7ecff] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'saving' && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/40 border-t-transparent" />
          )}
          {status === 'saving' ? 'Creating…' : 'Create & select'}
        </button>
      </div>
    </div>
  );
}
