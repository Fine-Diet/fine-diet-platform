'use client';

/**
 * Meal Object Foundation — Packet 13: Component Food Re-match selector.
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
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

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

  const inputId = useId();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Debounced search with stale-request cancellation. Mirrors the existing
  // Pantry direct-add conventions (flat consumer, credentials: include).
  useEffect(() => {
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
  }, [query]);

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
      {showEmpty && <p className="mt-2 text-xs text-white/45 antialiased">No matching foods found.</p>}

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
    </div>
  );
}
