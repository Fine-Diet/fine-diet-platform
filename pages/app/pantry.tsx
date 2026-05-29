'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { APP_ROUTES, APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import {
  planService,
  type PantryOnHandItem,
  type PantryReadinessSummary,
} from '@/lib/plans';
import type { FoodSearchResponse, FoodSearchResult } from '@/lib/food/types';

type LoadState = 'loading' | 'ready' | 'error';

type FoodCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

interface SelectedFood {
  id: string;
  name: string;
}

interface PantryDraft {
  quantity: string;
  unit: string;
}

function sortPantryItems(items: PantryOnHandItem[]): PantryOnHandItem[] {
  return [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatAmount(item: PantryOnHandItem): string {
  if (item.quantity == null) return item.unit ? `Amount saved (${item.unit})` : 'Amount saved';
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

function draftFromItem(item: PantryOnHandItem): PantryDraft {
  return {
    quantity: item.quantity == null ? '' : String(item.quantity),
    unit: item.unit ?? '',
  };
}

function PantrySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4"
        >
          <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-1/4 animate-pulse rounded-full bg-white/10" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function readinessGroceryHref(summary: PantryReadinessSummary): string | null {
  if (!summary.active_plan || !summary.grocery_scope) return null;
  const params = new URLSearchParams({ date: summary.grocery_scope.date_start });
  if (summary.grocery_scope.date_end !== summary.grocery_scope.date_start) {
    params.set('date_end', summary.grocery_scope.date_end);
  }
  return `${APP_ROUTE_BUILDERS.planGrocery(summary.active_plan.id)}?${params.toString()}`;
}

function ReadinessMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'covered' | 'buy' | 'review' | 'resolve';
}) {
  const toneClass =
    tone === 'covered'
      ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-50'
      : tone === 'buy'
        ? 'border-sky-300/20 bg-sky-500/10 text-sky-50'
        : tone === 'review'
          ? 'border-amber-300/20 bg-amber-500/10 text-amber-50'
          : tone === 'resolve'
            ? 'border-orange-300/20 bg-orange-500/10 text-orange-50'
            : 'border-white/10 bg-white/[0.04] text-brand-50';
  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <p className="text-2xl font-semibold leading-none antialiased">{value}</p>
      <p className="mt-1 text-[11px] font-medium leading-tight text-white/55 antialiased">
        {label}
      </p>
    </div>
  );
}

/**
 * Packet C — Pantry Readiness Summary. A derived planning-context layer: it
 * reads how the saved Pantry affects the active plan's grocery readiness and
 * links back to the relevant planning surface. It never stores readiness and
 * never triggers grocery generation.
 */
function PantryReadinessSection({
  state,
  summary,
  onRetry,
  onAddItem,
}: {
  state: LoadState;
  summary: PantryReadinessSummary | null;
  onRetry: () => void;
  onAddItem: () => void;
}) {
  return (
    <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-white/[0.025] p-5 shadow-large sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
            Pantry readiness
          </p>
          <h2 className="mt-1 text-lg font-semibold text-brand-50 antialiased">
            How your Pantry affects planning
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/50 antialiased">
            A derived view of your active plan and grocery list. Required amounts stay
            primary; deduction only applies on safe canonical identity and unit matches.
          </p>
        </div>
      </div>

      {state === 'loading' && (
        <div className="mt-4 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="h-3 w-40 rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-white/10" />
        </div>
      )}

      {state === 'error' && (
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-sm text-white/60 antialiased">
            Planning context could not load. Your pantry items below are unaffected.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && summary && (
        <ReadinessBody summary={summary} onAddItem={onAddItem} />
      )}
    </section>
  );
}

function ReadinessBody({
  summary,
  onAddItem,
}: {
  summary: PantryReadinessSummary;
  onAddItem: () => void;
}) {
  const groceryHref = readinessGroceryHref(summary);
  const planLabel = summary.active_plan?.title?.trim() || 'your active plan';

  if (summary.state === 'no_plan') {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5">
        <p className="text-sm font-semibold text-brand-50 antialiased">
          No active plan yet.
        </p>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-white/55 antialiased">
          Start a plan to see how your Pantry affects groceries.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={APP_ROUTES.plans}
            className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50"
          >
            Open Plans
          </Link>
        </div>
      </div>
    );
  }

  if (summary.state === 'no_grocery_list') {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5">
        <p className="text-sm font-semibold text-brand-50 antialiased">
          No active grocery list yet.
        </p>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-white/55 antialiased">
          Generate or open a grocery list for {planLabel} to compare it against your Pantry.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {groceryHref ? (
            <Link
              href={groceryHref}
              className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50"
            >
              Open Grocery Plan
            </Link>
          ) : null}
          <Link
            href={APP_ROUTES.plans}
            className="inline-flex justify-center rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-brand-50/80 transition-colors hover:bg-white/[0.08] hover:text-brand-50"
          >
            Open Plans
          </Link>
        </div>
      </div>
    );
  }

  // From here a grocery list exists. coverage is always present.
  const coverage = summary.coverage;

  if (summary.state === 'no_pantry') {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-emerald-300/20 bg-emerald-500/[0.06] p-5">
        <p className="text-sm font-semibold text-brand-50 antialiased">
          Add items you already have to reduce future grocery lists.
        </p>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-white/55 antialiased">
          {coverage
            ? `Your active grocery list has ${coverage.rows_total} row${coverage.rows_total === 1 ? '' : 's'}. Saving Pantry items lets safe matches deduct from what you still need.`
            : 'Saving Pantry items lets safe matches deduct from what you still need.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50"
          >
            Add Pantry Item
          </button>
          {groceryHref ? (
            <Link
              href={groceryHref}
              className="inline-flex justify-center rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-brand-50/80 transition-colors hover:bg-white/[0.08] hover:text-brand-50"
            >
              Open Grocery Plan
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  // state === 'has_grocery'
  if (!coverage) return null;
  const hasBlockers =
    coverage.rows_unresolved_identity > 0 || coverage.rows_unit_or_amount_review > 0;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ReadinessMetric label="Pantry items saved" value={summary.pantry_items_saved} />
        <ReadinessMetric label="Covered by Pantry" value={coverage.rows_covered_full} tone="covered" />
        <ReadinessMetric label="Still to buy" value={coverage.rows_to_buy} tone="buy" />
        {coverage.rows_partial > 0 && (
          <ReadinessMetric label="Partially covered" value={coverage.rows_partial} tone="covered" />
        )}
        {coverage.rows_unit_or_amount_review > 0 && (
          <ReadinessMetric label="Unit mismatch · needs review" value={coverage.rows_unit_or_amount_review} tone="review" />
        )}
        {coverage.rows_unresolved_identity > 0 && (
          <ReadinessMetric label="Resolve to use Pantry" value={coverage.rows_unresolved_identity} tone="resolve" />
        )}
      </div>

      <p className="text-[11px] text-white/40 antialiased">
        {coverage.rows_safe_match} of {coverage.rows_total} grocery row
        {coverage.rows_total === 1 ? '' : 's'} have a safe Pantry match for {planLabel}.
        {summary.list_context?.is_fallback
          ? ' Using your closest existing grocery list for this scope.'
          : ''}
      </p>

      {hasBlockers && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-500/[0.07] p-4">
          <p className="text-xs font-semibold text-amber-100 antialiased">
            Some rows cannot use Pantry yet.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-white/60 antialiased">
            {coverage.rows_unresolved_identity > 0 && (
              <li>
                {coverage.rows_unresolved_identity} row
                {coverage.rows_unresolved_identity === 1 ? '' : 's'} need ingredient identity
                resolved before Pantry can deduct.
              </li>
            )}
            {coverage.rows_unit_or_amount_review > 0 && (
              <li>
                {coverage.rows_unit_or_amount_review} row
                {coverage.rows_unit_or_amount_review === 1 ? '' : 's'} need review because units
                or amounts do not match safely.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {groceryHref ? (
          <Link
            href={groceryHref}
            className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50"
          >
            {hasBlockers ? 'Review Grocery' : 'Open Grocery Plan'}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex justify-center rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-brand-50/80 transition-colors hover:bg-white/[0.08] hover:text-brand-50"
        >
          Add Pantry Item
        </button>
      </div>
    </div>
  );
}

function AddPantryItemPanel({
  query,
  setQuery,
  results,
  searching,
  searchError,
  selectedFood,
  onSelectFood,
  onClearFood,
  quantity,
  setQuantity,
  unit,
  setUnit,
  saving,
  saveError,
  onSave,
  onClose,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: FoodCandidate[];
  searching: boolean;
  searchError: string | null;
  selectedFood: SelectedFood | null;
  onSelectFood: (candidate: FoodCandidate) => void;
  onClearFood: () => void;
  quantity: string;
  setQuantity: (value: string) => void;
  unit: string;
  setUnit: (value: string) => void;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/80 px-3 py-5 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-brand-900 shadow-2xl">
        <div className="border-b border-white/[0.06] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-200/70 antialiased">
                Add pantry item
              </p>
              <h2 className="mt-1 text-base font-semibold text-white antialiased">
                {selectedFood ? selectedFood.name : 'Find a canonical food'}
              </h2>
              <p className="mt-1 text-[11px] text-white/40 antialiased">
                A canonical food keeps the on-hand amount deduction-safe. Required grocery
                amounts stay primary; deduction only applies when identity and unit match.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm text-white/40 hover:text-white/70 disabled:opacity-50"
            >
              Close
            </button>
          </div>

          {selectedFood ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-emerald-50 antialiased">
                  {selectedFood.name}
                </p>
                <p className="text-[10px] text-emerald-200/60 antialiased">Selected canonical food</p>
              </div>
              <button
                type="button"
                onClick={onClearFood}
                disabled={saving}
                className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                Change
              </button>
            </div>
          ) : (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search canonical foods..."
              autoFocus
              className="mt-4 w-full rounded-xl border border-white/10 bg-brand-800 px-3 py-2 text-sm text-white antialiased outline-none placeholder:text-white/25 focus:border-emerald-300/50"
            />
          )}
        </div>

        {!selectedFood ? (
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {searchError ? (
              <p className="p-3 text-sm text-red-200 antialiased">{searchError}</p>
            ) : searching ? (
              <p className="p-3 text-sm text-white/45 antialiased">Searching...</p>
            ) : results.length === 0 ? (
              <p className="p-3 text-sm text-white/45 antialiased">
                Enter at least 2 characters to find canonical matches.
              </p>
            ) : (
              <div className="space-y-1">
                {results.map((candidate) => (
                  <button
                    key={candidate.food.id}
                    type="button"
                    onClick={() => onSelectFood(candidate)}
                    className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <p className="text-sm text-white antialiased">
                      {candidate.food.canonicalName}
                    </p>
                    <p className="text-[10px] text-white/35 antialiased">
                      {candidate.food.brandName ? `${candidate.food.brandName} · ` : ''}
                      {candidate.source_label ?? candidate.source ?? candidate.food.sourceType}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,180px)]">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Quantity
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50 outline-none transition-colors focus:border-emerald-300/50"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Unit
                </span>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="item, cup, g..."
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50 outline-none transition-colors placeholder:text-white/25 focus:border-emerald-300/50"
                />
              </label>
            </div>

            {saveError && (
              <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100 antialiased">
                {saveError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save pantry item'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryOnHandItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PantryDraft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<FoodCandidate[]>([]);
  const [searchingAdd, setSearchingAdd] = useState(false);
  const [addSearchError, setAddSearchError] = useState<string | null>(null);
  const [selectedFood, setSelectedFood] = useState<SelectedFood | null>(null);
  const [addQuantity, setAddQuantity] = useState('');
  const [addUnit, setAddUnit] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [addSaveError, setAddSaveError] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<PantryReadinessSummary | null>(null);
  const [readinessState, setReadinessState] = useState<LoadState>('loading');

  const pantryCountLabel = useMemo(() => {
    if (items.length === 1) return '1 item on hand';
    return `${items.length} items on hand`;
  }, [items.length]);

  const loadPantry = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const pantryItems = await planService.listPantryOnHandItems();
      setItems(sortPantryItems(pantryItems));
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load pantry.');
      setLoadState('error');
    }
  }, []);

  const loadReadiness = useCallback(async () => {
    setReadinessState('loading');
    try {
      const summary = await planService.getPantryReadiness();
      setReadiness(summary);
      setReadinessState('ready');
    } catch {
      setReadinessState('error');
    }
  }, []);

  useEffect(() => {
    void loadPantry();
    void loadReadiness();
  }, [loadPantry, loadReadiness]);

  useEffect(() => {
    if (!addOpen || selectedFood) return;
    const q = addQuery.trim();
    setAddSearchError(null);
    if (q.length < 2) {
      setAddResults([]);
      setSearchingAdd(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchingAdd(true);
      try {
        const params = new URLSearchParams({
          q,
          limit: '12',
          sectionLimit: '4',
          consumer: 'flat',
          pageContext: 'pantry_direct_add',
        });
        const res = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Food search failed.');
        const body = (await res.json()) as FoodSearchResponse;
        setAddResults(body.results.slice(0, 12));
      } catch (err) {
        if (!controller.signal.aborted) {
          setAddSearchError(err instanceof Error ? err.message : 'Food search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setSearchingAdd(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [addOpen, addQuery, selectedFood]);

  function openAdd() {
    setAddOpen(true);
    setAddQuery('');
    setAddResults([]);
    setAddSearchError(null);
    setSelectedFood(null);
    setAddQuantity('');
    setAddUnit('');
    setAddSaveError(null);
    setError(null);
  }

  function closeAdd() {
    if (savingAdd) return;
    setAddOpen(false);
    setAddQuery('');
    setAddResults([]);
    setAddSearchError(null);
    setSelectedFood(null);
    setAddQuantity('');
    setAddUnit('');
    setAddSaveError(null);
  }

  function selectAddFood(candidate: FoodCandidate) {
    setSelectedFood({ id: candidate.food.id, name: candidate.food.canonicalName });
    setAddResults([]);
    setAddQuery('');
    setAddSearchError(null);
    setAddSaveError(null);
  }

  function clearAddFood() {
    setSelectedFood(null);
    setAddSaveError(null);
  }

  async function saveAdd() {
    if (!selectedFood) {
      setAddSaveError('Select a canonical food first.');
      return;
    }
    const quantity = Number(addQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setAddSaveError('Quantity must be a non-negative number.');
      return;
    }

    setSavingAdd(true);
    setAddSaveError(null);
    try {
      const saved = await planService.createPantryOnHandItem({
        food_object_id: selectedFood.id,
        quantity,
        unit: addUnit.trim() || null,
      });
      setItems((current) => sortPantryItems([
        ...current.filter((candidate) => candidate.key !== saved.key),
        saved,
      ]));
      setDrafts((current) => ({ ...current, [saved.key]: draftFromItem(saved) }));
      setAddOpen(false);
      setSelectedFood(null);
      setAddQuantity('');
      setAddUnit('');
      void loadReadiness();
    } catch (err) {
      setAddSaveError(err instanceof Error ? err.message : 'Unable to add pantry item.');
    } finally {
      setSavingAdd(false);
    }
  }

  function beginEdit(item: PantryOnHandItem) {
    setEditingKey(item.key);
    setError(null);
    setDrafts((current) => ({
      ...current,
      [item.key]: current[item.key] ?? draftFromItem(item),
    }));
  }

  function cancelEdit() {
    setEditingKey(null);
    setError(null);
  }

  function updateDraft(key: string, patch: Partial<PantryDraft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { quantity: '', unit: '' }), ...patch },
    }));
  }

  async function saveEdit(item: PantryOnHandItem) {
    const draft = drafts[item.key] ?? draftFromItem(item);
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Quantity must be a non-negative number.');
      return;
    }

    setSavingKey(item.key);
    setError(null);
    try {
      const updated = await planService.updatePantryOnHandItem(item.key, {
        quantity,
        unit: draft.unit.trim() || null,
      });
      setItems((current) => sortPantryItems([
        ...current.filter((candidate) => candidate.key !== item.key && candidate.key !== updated.key),
        updated,
      ]));
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.key];
        next[updated.key] = draftFromItem(updated);
        return next;
      });
      setEditingKey(null);
      void loadReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save pantry item.');
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteItem(item: PantryOnHandItem) {
    if (!window.confirm(`Delete ${item.name} from your pantry?`)) return;

    setDeletingKey(item.key);
    setError(null);
    try {
      await planService.deletePantryOnHandItem(item.key);
      setItems((current) => current.filter((candidate) => candidate.key !== item.key));
      setEditingKey((current) => (current === item.key ? null : current));
      void loadReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete pantry item.');
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-36px)] bg-[#16110d] px-4 pb-12 pt-6 sm:px-5">
      <div className="mx-auto max-w-[760px]">
        <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                Pantry
              </p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                On-hand items
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                Manage the explicit pantry quantities used by future grocery readiness.
                Required grocery amounts stay primary; deduction only applies when identity and unit match safely.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50"
              >
                Add pantry item
              </button>
              <Link
                href={APP_ROUTES.plans}
                className="inline-flex justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-brand-50/80 transition-colors hover:bg-white/[0.08] hover:text-brand-50"
              >
                Back to Plans
              </Link>
            </div>
          </div>
        </section>

        <PantryReadinessSection
          state={readinessState}
          summary={readiness}
          onRetry={() => void loadReadiness()}
          onAddItem={openAdd}
        />

        <section className="mt-5 rounded-[28px] border border-white/[0.06] bg-black/15 p-4 shadow-large sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold text-brand-50 antialiased">
                Current pantry
              </h2>
              <p className="text-xs text-white/45 antialiased">{pantryCountLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadPantry()}
              disabled={loadState === 'loading'}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
              {error}
            </div>
          )}

          {loadState === 'loading' && <PantrySkeleton />}

          {loadState === 'error' && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
              <p className="text-sm font-semibold text-brand-50">Pantry could not load.</p>
              <p className="mt-2 text-sm text-white/55">
                Try again, or return to Plans and reopen this page.
              </p>
            </div>
          )}

          {loadState === 'ready' && items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-7 text-center">
              <p className="text-base font-semibold text-brand-50 antialiased">
                No pantry items yet.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 antialiased">
                Use "Add pantry item" to record an on-hand amount for a canonical food,
                or add amounts from grounded grocery rows with "Set on hand."
                They will appear here for independent pantry management.
              </p>
            </div>
          )}

          {loadState === 'ready' && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item) => {
                const isEditing = editingKey === item.key;
                const draft = drafts[item.key] ?? draftFromItem(item);
                const isSaving = savingKey === item.key;
                const isDeleting = deletingKey === item.key;

                return (
                  <article
                    key={item.key}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-brand-50 antialiased">
                          {item.name}
                        </h3>
                        {isEditing ? (
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,140px)_minmax(0,180px)]">
                            <label className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                Quantity
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={draft.quantity}
                                onChange={(event) => updateDraft(item.key, { quantity: event.target.value })}
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50 outline-none transition-colors focus:border-emerald-300/50"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                                Unit
                              </span>
                              <input
                                type="text"
                                value={draft.unit}
                                onChange={(event) => updateDraft(item.key, { unit: event.target.value })}
                                placeholder="item, cup, g..."
                                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50 outline-none transition-colors placeholder:text-white/25 focus:border-emerald-300/50"
                              />
                            </label>
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-emerald-100/80 antialiased">
                            {formatAmount(item)}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-white/40 antialiased">
                          Updated {formatDateTime(item.updated_at)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void saveEdit(item)}
                              disabled={isSaving || isDeleting}
                              className="rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-60"
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginEdit(item)}
                              disabled={isDeleting}
                              className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteItem(item)}
                              disabled={isDeleting}
                              className="rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100/80 transition-colors hover:bg-red-500/15 hover:text-red-50 disabled:opacity-60"
                            >
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {addOpen && (
        <AddPantryItemPanel
          query={addQuery}
          setQuery={setAddQuery}
          results={addResults}
          searching={searchingAdd}
          searchError={addSearchError}
          selectedFood={selectedFood}
          onSelectFood={selectAddFood}
          onClearFood={clearAddFood}
          quantity={addQuantity}
          setQuantity={setAddQuantity}
          unit={addUnit}
          setUnit={setAddUnit}
          saving={savingAdd}
          saveError={addSaveError}
          onSave={() => void saveAdd()}
          onClose={closeAdd}
        />
      )}
    </main>
  );
}
