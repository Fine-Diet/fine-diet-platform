'use client';

/**
 * Package 5A — search saved Recipes to attach as first-class meal components.
 */

import { useCallback, useEffect, useState } from 'react';

import type { MealDocument } from '@/lib/meals/types';

export interface MealComposerRecipeSearchProps {
  onSelect: (recipe: MealDocument) => void;
  onCancel: () => void;
  /** Exclude the host document (prevents trivial self-attach in the picker). */
  excludeDocumentId?: string | null;
}

interface SearchHit {
  id: string;
  title: string;
  document_kind?: string;
  review_state?: string;
}

export function MealComposerRecipeSearch({
  onSelect,
  onCancel,
  excludeDocumentId,
}: MealComposerRecipeSearchProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydratingId, setHydratingId] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        mode: 'recipes',
        limit: '12',
      });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/journal/meals/documents/search?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Search failed (${res.status})`);
      }
      const body = (await res.json()) as { results?: SearchHit[] };
      const results = (body.results ?? []).filter((hit) => hit.id !== excludeDocumentId);
      setHits(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recipe search failed');
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [excludeDocumentId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(query);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  async function selectHit(hit: SearchHit) {
    setHydratingId(hit.id);
    setError(null);
    try {
      const res = await fetch(`/api/journal/meals/documents/${hit.id}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Failed to load recipe (${res.status})`);
      }
      const body = (await res.json()) as { document?: MealDocument };
      if (!body.document) throw new Error('Recipe not found');
      onSelect(body.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipe');
    } finally {
      setHydratingId(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
          Add saved Recipe
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-white/55 hover:text-white"
        >
          Cancel
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes…"
        className="mb-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 outline-none placeholder:text-white/30 focus:border-emerald-300/50"
        autoFocus
      />
      {error && <p className="mb-2 text-xs text-red-200/90">{error}</p>}
      {loading && <p className="text-xs text-white/45">Searching…</p>}
      {!loading && hits.length === 0 && (
        <p className="text-xs text-white/45">No recipes found.</p>
      )}
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button
              type="button"
              disabled={hydratingId === hit.id}
              onClick={() => void selectHit(hit)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-brand-50 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            >
              <span className="min-w-0 truncate font-medium">{hit.title}</span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-emerald-200/70">
                Recipe
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
