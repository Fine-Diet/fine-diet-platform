'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { mealDocumentToPlannedMealPayload } from '@/lib/meals/adapters';
import type { MealDocument } from '@/lib/meals/types';
import { buildTemplateMealFromDocument } from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplateMeal, PlannedMealType } from '@/lib/plans/types';

interface MealDocumentSearchResult {
  id: string;
  title: string;
  document_kind: 'meal' | 'recipe';
  review_state: string;
  updated_at: string | null;
}

interface MealDocumentSearchOutcome {
  results: MealDocumentSearchResult[];
}

function payloadHasUsableNutrition(payload: Record<string, unknown>): boolean {
  const totals = payload.totals as
    | { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }
    | undefined;
  if (typeof totals?.calories === 'number' && totals.calories > 0) return true;
  if (typeof totals?.protein_g === 'number' && totals.protein_g > 0) return true;
  const items = (payload.items ?? []) as Array<{ calories?: number | null }>;
  return items.some((item) => typeof item.calories === 'number' && item.calories > 0);
}

interface TemplateSavedMealPickerProps {
  defaultMealType?: PlannedMealType;
  onPick: (meal: PlanDayTemplateMeal) => void | Promise<void>;
  onCancel: () => void;
}

export function TemplateSavedMealPicker({
  defaultMealType = 'other',
  onPick,
  onCancel,
}: TemplateSavedMealPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MealDocumentSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        mode: 'all',
        limit: '50',
      });
      const res = await fetch(`/api/journal/meals/documents/search?${params.toString()}`, {
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as MealDocumentSearchOutcome & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not load saved meals.');
      }
      setResults(body.results ?? []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Could not load saved meals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadResults(query);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [loadResults, query]);

  const sortedResults = useMemo(
    () => results.slice().sort((a, b) => a.title.localeCompare(b.title)),
    [results],
  );

  async function handlePick(result: MealDocumentSearchResult) {
    setPickingId(result.id);
    setError(null);
    try {
      const res = await fetch(`/api/journal/meals/documents/${result.id}`, {
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as {
        document?: MealDocument;
        error?: string;
      };
      if (!res.ok || !body.document) {
        throw new Error(body.error ?? 'Could not load this meal.');
      }
      const payload = mealDocumentToPlannedMealPayload(body.document) as Record<string, unknown>;
      if (body.document.id) {
        payload.source_meal_document_id = body.document.id;
      }
      if (!payloadHasUsableNutrition(payload)) {
        throw new Error(
          `"${result.title}" has no nutrition data saved. Edit the meal in your library before attaching it.`,
        );
      }
      const mealType =
        body.document.meal_type_hint &&
        ['breakfast', 'lunch', 'dinner', 'snack', 'other'].includes(body.document.meal_type_hint)
          ? (body.document.meal_type_hint as PlannedMealType)
          : defaultMealType;
      const meal = buildTemplateMealFromDocument(
        { ...body.document, id: body.document.id },
        mealType,
      );
      meal.payload = payload;
      await onPick(meal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach this meal.');
    } finally {
      setPickingId(null);
    }
  }

  return (
    <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-white antialiased">Choose saved meal</p>
        <p className="mt-0.5 text-[11px] text-white/45 antialiased">
          Attaches a snapshot copy. Editing the library meal later will not change this template.
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search your meal library…"
        className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
      />
      {loading ? <p className="text-xs text-white/45">Loading meals…</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {!loading && sortedResults.length === 0 ? (
        <p className="text-xs text-white/45">No saved meals found.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {sortedResults.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                disabled={pickingId !== null}
                onClick={() => void handlePick(result)}
                className="w-full rounded-xl bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.08] disabled:opacity-40"
              >
                <p className="truncate text-sm text-white">{result.title}</p>
                <p className="text-[11px] capitalize text-white/45">
                  {result.document_kind}
                  {pickingId === result.id ? ' · attaching…' : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={pickingId !== null}
        className="text-xs text-white/60 hover:text-white/80 disabled:text-white/30"
      >
        Cancel
      </button>
    </div>
  );
}
