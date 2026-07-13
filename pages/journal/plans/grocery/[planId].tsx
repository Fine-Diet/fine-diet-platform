'use client';

/**
 * /journal/plans/grocery/[planId] — Packet 37 Shopping list
 *
 * Derives a grocery/shopping list from planned meals for a given day
 * (or short date range). Items come directly from the effective planned
 * meal payloads — including any serving-scaled quantities written at
 * attach time (Packet 35) — so what you see here always reflects what
 * is actually planned, not the original import baseline.
 *
 * Item trust signal:
 *   - Grounded items have food_object_id set → shown with a "Grounded"
 *     badge. Their identity is known; quantity deduplication is safe.
 *   - Unresolved items have food_object_id null → shown with an
 *     "Unresolved" badge. Name-matched grouping (when it occurs across
 *     meals) is annotated as approximate.
 *
 * Provenance: each item's source_planned_meal_ids array maps back to
 * the planned meals that contributed it, displayed as expandable meal
 * chips so the user can trace any grocery item to its contributing meal.
 *
 * Check/off: item status cycles pending → bought → pending on tap.
 * Status is persisted so it survives navigation.
 *
 * Regenerate: re-derives from the current planned meals (use after
 * removing a meal from the plan to drop its grocery contribution).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { toDateKey } from '@/lib/journal';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import {
  planService,
  buildGroceryItemReadModel,
  groceryPantryKey,
  type GeneratedGroceryList,
  type GroceryActiveListContext,
  type GroceryItem,
  type GroceryItemReadModel,
  type GroceryItemStatus,
  type PantryOnHandItem,
  type PlannedMeal,
} from '@/lib/plans';
import type { FoodSearchResponse, FoodSearchResult } from '@/lib/food/types';

type ResolveCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

// ============================================================================
// Helpers
// ============================================================================

function nextStatus(current: GroceryItemStatus): GroceryItemStatus {
  return current === 'pending' ? 'bought' : 'pending';
}

function statusClass(status: GroceryItemStatus): string {
  if (status === 'bought') return 'line-through text-white/30';
  if (status === 'have') return 'line-through text-emerald-300/50';
  if (status === 'skipped') return 'line-through text-white/20';
  return 'text-white';
}

function statusCheckClass(status: GroceryItemStatus): string {
  if (status === 'bought') return 'bg-denim-500/40 border-denim-500/60 text-denim-200';
  if (status === 'have') return 'bg-emerald-500/30 border-emerald-500/50 text-emerald-200';
  if (status === 'skipped') return 'bg-white/[0.04] border-white/10 text-white/20';
  return 'bg-white/[0.04] border-white/10 text-white/0';
}

// ============================================================================
// Sub-components
// ============================================================================

function MealSourceChips({
  mealIds,
  meals,
}: {
  mealIds: string[];
  meals: PlannedMeal[];
}) {
  const [expanded, setExpanded] = useState(false);
  const contributing = mealIds
    .map((id) => meals.find((m) => m.id === id))
    .filter(Boolean) as PlannedMeal[];

  if (contributing.length === 0) return null;

  if (contributing.length === 1) {
    const m = contributing[0];
    return (
      <p className="text-[10px] text-white/35 antialiased mt-0.5 truncate">
        from {m.name ?? 'unnamed meal'}
        {m.source_imported_meal_id && (
          <Link
            href={APP_ROUTE_BUILDERS.planImport(m.source_imported_meal_id)}
            className="ml-1 text-denim-400 hover:text-denim-300"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </Link>
        )}
      </p>
    );
  }

  return (
    <div className="mt-0.5">
      {/* span avoids a button-inside-button DOM warning (parent GroceryRow is a button) */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }
        }}
        className="text-[10px] text-white/35 antialiased hover:text-white/55 transition-colors cursor-pointer select-none"
      >
        {expanded ? '▾' : '▸'} {contributing.length} meals
      </span>
      {expanded && (
        <ul className="mt-0.5 space-y-0.5 pl-2">
          {contributing.map((m) => (
            <li key={m.id} className="text-[10px] text-white/35 antialiased flex items-center gap-1">
              {m.name ?? 'unnamed meal'}
              {m.source_imported_meal_id && (
                <Link
                  href={APP_ROUTE_BUILDERS.planImport(m.source_imported_meal_id)}
                  className="text-denim-400 hover:text-denim-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroceryRow({
  item,
  meals,
  readModel,
  onToggle,
  onResolve,
  onSetOnHand,
  busy,
}: {
  item: GroceryItem;
  meals: PlannedMeal[];
  readModel: GroceryItemReadModel;
  onToggle: (item: GroceryItem) => void;
  onResolve?: (item: GroceryItem) => void;
  onSetOnHand?: (item: GroceryItem) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle(item)}
      className="w-full text-left flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-white/[0.04] disabled:opacity-60 transition-colors group"
    >
      {/* Checkbox */}
      <span
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${statusCheckClass(item.status)}`}
      >
        {(item.status === 'bought' || item.status === 'have') && (
          <span className="text-[10px] leading-none">✓</span>
        )}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm antialiased transition-colors ${statusClass(item.status)}`}>
            {item.name}
          </p>
          {item.food_object_id ? (
            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-emerald-500/10 text-emerald-300/80 antialiased border border-emerald-500/15">
              grounded
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-amber-500/10 text-amber-300/80 antialiased border border-amber-500/15">
              unresolved
            </span>
          )}
          {item.notes && (
            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-white/[0.04] text-white/30 antialiased">
              {item.notes}
            </span>
          )}
        </div>
        {!item.food_object_id && onResolve && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onResolve(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onResolve(item);
              }
            }}
            className="inline-flex mt-2 text-[10px] text-denim-200/80 hover:text-denim-100 antialiased rounded-full border border-denim-400/20 px-2 py-1 bg-denim-500/10"
          >
            Resolve ingredient
          </span>
        )}
        {item.food_object_id && onSetOnHand && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSetOnHand(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onSetOnHand(item);
              }
            }}
            className="inline-flex mt-2 text-[10px] text-emerald-200/80 hover:text-emerald-100 antialiased rounded-full border border-emerald-400/20 px-2 py-1 bg-emerald-500/10"
          >
            Set on hand
          </span>
        )}

        <p className={`text-[11px] antialiased mt-0.5 ${
          item.status === 'pending' ? 'text-white/60' : 'text-white/25'
        }`}>
          {readModel.required.label}
        </p>
        {readModel.onHand && (
          <p className={`text-[10px] antialiased mt-0.5 ${
            item.status === 'pending' ? 'text-emerald-200/70' : 'text-white/20'
          }`}>
            {readModel.onHand.label}
          </p>
        )}
        {readModel.stillToBuy.state === 'safe' && readModel.stillToBuy.label ? (
          <p className={`text-[11px] font-medium antialiased mt-0.5 ${
            item.status === 'pending' ? 'text-white/75' : 'text-white/25'
          }`}>
            {readModel.stillToBuy.label}
          </p>
        ) : readModel.stillToBuy.note ? (
          <p className="text-[10px] text-white/30 antialiased mt-0.5">
            {readModel.stillToBuy.note}
          </p>
        ) : null}
        {readModel.buySuggestion && (
          <p className={`text-[10px] antialiased mt-0.5 ${
            item.status === 'pending' ? 'text-denim-200/70' : 'text-white/20'
          }`}>
            {readModel.buySuggestion}
          </p>
        )}

        <MealSourceChips mealIds={item.source_planned_meal_ids} meals={meals} />
      </div>
    </button>
  );
}

function ResolveIngredientPanel({
  item,
  query,
  setQuery,
  results,
  searching,
  resolving,
  error,
  onClose,
  onSelect,
}: {
  item: GroceryItem;
  query: string;
  setQuery: (value: string) => void;
  results: ResolveCandidate[];
  searching: boolean;
  resolving: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (candidate: ResolveCandidate) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-lg rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-300/70 antialiased">
                Resolve ingredient
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">
                {item.name}
              </h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                This teaches future grocery derivation for this exact unresolved name/unit. It does not change the current required amount.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white/70 text-sm"
            >
              Close
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search canonical foods..."
            className="mt-4 w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {error ? (
            <p className="p-3 text-sm text-red-200 antialiased">{error}</p>
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
                  disabled={resolving}
                  onClick={() => onSelect(candidate)}
                  className="w-full text-left rounded-xl px-3 py-2 hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
                >
                  <p className="text-sm text-white antialiased">
                    {candidate.food.canonicalName}
                  </p>
                  <p className="text-[10px] text-white/35 antialiased">
                    {candidate.food.brandName
                      ? `${candidate.food.brandName} · `
                      : ''}
                    {candidate.source_label ?? candidate.source ?? candidate.food.sourceType}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnHandPanel({
  item,
  quantity,
  setQuantity,
  unit,
  setUnit,
  saving,
  error,
  onClose,
  onSave,
}: {
  item: GroceryItem;
  quantity: string;
  setQuantity: (value: string) => void;
  unit: string;
  setUnit: (value: string) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-md rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/70 antialiased">
                Pantry / on hand
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">
                {item.name}
              </h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                Save what you already have. Required amount stays unchanged; still-to-buy is derived when the unit matches safely.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-white/40 hover:text-white/70 disabled:text-white/20 text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-[1fr_0.8fr] gap-2">
            <label className="space-y-1">
              <span className="block text-[10px] text-white/40 antialiased">On hand amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10px] text-white/40 antialiased">Unit</span>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={item.unit ?? 'unit'}
                className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-200 antialiased">{error}</p>}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-500/20 border border-emerald-400/25 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 antialiased"
          >
            {saving ? 'Saving...' : 'Save on-hand amount'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function GroceryListPage() {
  const router = useRouter();
  const planId = typeof router.query.planId === 'string' ? router.query.planId : null;
  const dateParam = typeof router.query.date === 'string' ? router.query.date : null;
  const dateEndParam = typeof router.query.date_end === 'string' ? router.query.date_end : null;

  const [list, setList] = useState<GeneratedGroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryOnHandItem[]>([]);
  const [sourceMeals, setSourceMeals] = useState<PlannedMeal[]>([]);
  const [listContext, setListContext] = useState<GroceryActiveListContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // itemId → busy flag for check/off toggles
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resolveItem, setResolveItem] = useState<GroceryItem | null>(null);
  const [resolveQuery, setResolveQuery] = useState('');
  const [resolveResults, setResolveResults] = useState<ResolveCandidate[]>([]);
  const [searchingResolve, setSearchingResolve] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [onHandItem, setOnHandItem] = useState<GroceryItem | null>(null);
  const [onHandQuantity, setOnHandQuantity] = useState('');
  const [onHandUnit, setOnHandUnit] = useState('');
  const [savingOnHand, setSavingOnHand] = useState(false);
  const [onHandError, setOnHandError] = useState<string | null>(null);

  // Today's date as the fallback when no date param is provided.
  const date = dateParam ?? toDateKey(new Date());
  const rawDateEnd = dateEndParam ?? date;
  const dateEnd = rawDateEnd < date ? date : rawDateEnd;
  const isRange = dateEnd !== date;

  const loadList = useCallback(
    async (forceRegenerate = false) => {
      if (!planId) return;
      if (!forceRegenerate) setLoading(true);
      else setRegenerating(true);
      setError(null);
      try {
        const result = await planService.generateGroceryList(planId, {
          date,
          date_end: dateEnd,
          regenerate: forceRegenerate,
        });
        setList(result.list);
        setItems(result.items);
        setPantryItems(result.pantry_items);
        setSourceMeals(result.source_meals);
        setListContext(result.list_context);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load grocery list.');
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [planId, date, dateEnd],
  );

  useEffect(() => {
    if (!planId) return;
    void loadList(false);
  }, [planId, loadList]);

  useEffect(() => {
    if (!resolveItem) return;
    const q = resolveQuery.trim();
    setResolveError(null);
    if (q.length < 2) {
      setResolveResults([]);
      setSearchingResolve(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchingResolve(true);
      try {
        const params = new URLSearchParams({
          q,
          limit: '12',
          sectionLimit: '4',
          consumer: 'flat',
          pageContext: 'plan_grocery_resolution',
        });
        const res = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Food search failed.');
        const body = (await res.json()) as FoodSearchResponse;
        setResolveResults(body.results.slice(0, 12));
      } catch (err) {
        if (!controller.signal.aborted) {
          setResolveError(err instanceof Error ? err.message : 'Food search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setSearchingResolve(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [resolveItem, resolveQuery]);

  const updateRange = useCallback(
    (nextDate: string, nextDateEnd: string) => {
      if (!planId) return;
      const params = new URLSearchParams({ date: nextDate });
      if (nextDateEnd !== nextDate) params.set('date_end', nextDateEnd);
      void router.push(`${APP_ROUTE_BUILDERS.planGrocery(planId)}?${params.toString()}`);
    },
    [planId, router],
  );

  async function handleToggle(item: GroceryItem) {
    if (togglingId) return;
    const next = nextStatus(item.status);
    setTogglingId(item.id);
    // Optimistic update
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: next } : it)));
    try {
      const updated = await planService.updateGroceryItemStatus(item.id, next);
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } catch {
      // Roll back on failure
      setItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
    } finally {
      setTogglingId(null);
    }
  }

  function openResolve(item: GroceryItem) {
    setResolveItem(item);
    setResolveQuery(item.name);
    setResolveResults([]);
    setResolveError(null);
  }

  function closeResolve() {
    if (resolvingId) return;
    setResolveItem(null);
    setResolveQuery('');
    setResolveResults([]);
    setResolveError(null);
  }

  async function handleResolve(candidate: ResolveCandidate) {
    if (!resolveItem || resolvingId) return;
    setResolvingId(resolveItem.id);
    setResolveError(null);
    try {
      const updated = await planService.resolveGroceryItemIngredient(
        resolveItem.id,
        candidate.food.id,
      );
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      setPantryItems((prev) => [...prev]);
      setResolveItem(null);
      setResolveQuery('');
      setResolveResults([]);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Failed to resolve ingredient.');
    } finally {
      setResolvingId(null);
    }
  }

  function openOnHand(item: GroceryItem) {
    const existing = item.food_object_id
      ? pantryItems.find((it) => it.key === groceryPantryKey(item.food_object_id!, item.unit))
      : null;
    setOnHandItem(item);
    setOnHandQuantity(
      existing?.quantity != null
        ? String(existing.quantity)
        : item.quantity != null
          ? String(Math.round(item.quantity * 100) / 100)
          : '',
    );
    setOnHandUnit(existing?.unit ?? item.unit ?? '');
    setOnHandError(null);
  }

  function closeOnHand() {
    if (savingOnHand) return;
    setOnHandItem(null);
    setOnHandQuantity('');
    setOnHandUnit('');
    setOnHandError(null);
  }

  async function handleSaveOnHand() {
    if (!onHandItem || savingOnHand) return;
    const quantity = Number(onHandQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setOnHandError('Enter a non-negative on-hand amount.');
      return;
    }
    setSavingOnHand(true);
    setOnHandError(null);
    try {
      const pantryItem = await planService.setGroceryItemOnHand(onHandItem.id, {
        quantity,
        unit: onHandUnit.trim() || onHandItem.unit,
      });
      setPantryItems((prev) => [
        pantryItem,
        ...prev.filter((it) => it.key !== pantryItem.key),
      ]);
      setOnHandItem(null);
      setOnHandQuantity('');
      setOnHandUnit('');
    } catch (err) {
      setOnHandError(err instanceof Error ? err.message : 'Failed to save on-hand amount.');
    } finally {
      setSavingOnHand(false);
    }
  }

  // Split items into grounded vs unresolved for grouping.
  const { grounded, unresolved } = useMemo(() => {
    return {
      grounded: items.filter((it) => it.food_object_id !== null),
      unresolved: items.filter((it) => it.food_object_id === null),
    };
  }, [items]);

  const checkedCount = items.filter((it) => it.status !== 'pending').length;
  const totalCount = items.length;

  if (!planId) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/50 antialiased">No plan ID.</p>
        </div>
        <JournalFooterNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link
                href={`${APP_ROUTE_BUILDERS.planDay(date)}?planId=${planId}`}
                className="text-[11px] text-white/40 hover:text-white/70 antialiased transition-colors"
              >
                ← Plan day
              </Link>
              <h1 className="text-lg font-semibold text-white antialiased mt-0.5">
                Shopping list
              </h1>
              <p className="text-[11px] text-white/40 antialiased mt-0.5">
                {date}
                {dateEnd !== date
                  ? ` – ${dateEnd}`
                  : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadList(true)}
              disabled={regenerating || loading}
              className="text-xs text-denim-300 hover:text-denim-200 disabled:text-white/20 antialiased transition-colors mt-5 flex-shrink-0"
            >
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>

          <div className="rounded-2xl bg-white/[0.04] p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
              Grocery scope
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] text-white/40 antialiased">Start</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const next = e.target.value;
                    updateRange(next, dateEnd < next ? next : dateEnd);
                  }}
                  className="w-full rounded-xl bg-brand-800 border border-white/10 px-2 py-2 text-xs text-white antialiased focus:outline-none focus:border-denim-400"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] text-white/40 antialiased">End</span>
                <input
                  type="date"
                  value={dateEnd}
                  min={date}
                  onChange={(e) => updateRange(date, e.target.value)}
                  className="w-full rounded-xl bg-brand-800 border border-white/10 px-2 py-2 text-xs text-white antialiased focus:outline-none focus:border-denim-400"
                />
              </label>
            </div>
            <p className="text-[10px] text-white/30 antialiased">
              {isRange
                ? 'This list rolls up all planned meals in the selected date range.'
                : 'Single-day list. Pick an end date to roll up multiple days.'}
            </p>
            {listContext && (
              <div className={`rounded-xl border px-3 py-2 ${
                listContext.is_fallback
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-white/[0.03] border-white/10'
              }`}>
                <p className={`text-[10px] uppercase tracking-wider antialiased ${
                  listContext.is_fallback ? 'text-amber-200/80' : 'text-white/35'
                }`}>
                  Active grocery list
                </p>
                <p className="text-[11px] text-white/45 antialiased mt-0.5">
                  {listContext.explanation}
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white/[0.04] p-5">
              <p className="text-sm text-white/50 antialiased">Generating list…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-red-200 antialiased">{error}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.04] p-5 space-y-2">
              <p className="text-sm text-white/60 antialiased">
                No grocery items found for this {isRange ? 'range' : 'day'}. Make sure meals are planned and have ingredient items.
              </p>
              <Link
                href={`${APP_ROUTE_BUILDERS.planDay(date)}?planId=${planId}`}
                className="inline-block text-[11px] text-denim-300 hover:text-denim-200 antialiased"
              >
                View plan day →
              </Link>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              {totalCount > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-white/40 antialiased">
                      {checkedCount} of {totalCount} item{totalCount === 1 ? '' : 's'}
                    </p>
                    {checkedCount === totalCount && (
                      <p className="text-[11px] text-emerald-300 antialiased">All done ✓</p>
                    )}
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-denim-400/70 transition-all"
                      style={{ width: `${Math.round((checkedCount / totalCount) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Grounded items */}
              {grounded.length > 0 && (
                <div className="rounded-2xl bg-white/[0.04] overflow-hidden">
                  <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased flex-1">
                      Grounded ingredients
                    </p>
                    <span className="text-[10px] text-emerald-300/60 antialiased">
                      {grounded.length} item{grounded.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {grounded.map((item) => (
                      <GroceryRow
                        key={item.id}
                        item={item}
                        meals={sourceMeals}
                        readModel={buildGroceryItemReadModel(item, pantryItems)}
                        onToggle={(it) => void handleToggle(it)}
                        onSetOnHand={openOnHand}
                        busy={togglingId === item.id || resolvingId === item.id || savingOnHand}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Unresolved items */}
              {unresolved.length > 0 && (
                <div className="rounded-2xl bg-white/[0.04] overflow-hidden">
                  <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased flex-1">
                      Unresolved ingredients
                    </p>
                    <span className="text-[10px] text-amber-300/60 antialiased">
                      {unresolved.length} item{unresolved.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="px-3 pb-2">
                    <p className="text-[10px] text-white/30 antialiased">
                      These items are not matched to a verified food source.
                      Quantities are derived from the recipe text.
                    </p>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {unresolved.map((item) => (
                      <GroceryRow
                        key={item.id}
                        item={item}
                        meals={sourceMeals}
                        readModel={buildGroceryItemReadModel(item, pantryItems)}
                        onToggle={(it) => void handleToggle(it)}
                        onResolve={openResolve}
                        busy={togglingId === item.id || resolvingId === item.id || savingOnHand}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Provenance note */}
              <p className="text-[11px] text-white/25 antialiased px-1">
                Required amounts reflect the serving-scaled meals in this selected scope.
                {isRange ? ' Range lists aggregate repeated ingredients across the selected span.' : ''}
                On-hand amounts are user-entered pantry facts and Still to buy
                is only deducted when the canonical ingredient and unit match
                safely. Purchase suggestions are optional guidance only.
                Resolving an unresolved row teaches future lists without
                changing this required amount. Tap an item to mark it as bought;
                tap ↗ on a meal chip to open the source import.
              </p>
            </>
          )}
        </div>
      </div>

      {resolveItem && (
        <ResolveIngredientPanel
          item={resolveItem}
          query={resolveQuery}
          setQuery={setResolveQuery}
          results={resolveResults}
          searching={searchingResolve}
          resolving={resolvingId === resolveItem.id}
          error={resolveError}
          onClose={closeResolve}
          onSelect={(candidate) => void handleResolve(candidate)}
        />
      )}

      {onHandItem && (
        <OnHandPanel
          item={onHandItem}
          quantity={onHandQuantity}
          setQuantity={setOnHandQuantity}
          unit={onHandUnit}
          setUnit={setOnHandUnit}
          saving={savingOnHand}
          error={onHandError}
          onClose={closeOnHand}
          onSave={() => void handleSaveOnHand()}
        />
      )}

      <JournalFooterNav />
    </div>
  );
}
