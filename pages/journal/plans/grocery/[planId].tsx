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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  planService,
  type GeneratedGroceryList,
  type GroceryItem,
  type GroceryItemStatus,
  type PlannedMeal,
} from '@/lib/plans';

// ============================================================================
// Helpers
// ============================================================================

function formatQty(qty: number | null, unit: string | null): string {
  if (qty == null) return unit ?? '';
  const rounded = Math.round(qty * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}

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
            href={`/journal/plans/imports/${m.source_imported_meal_id}`}
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
                  href={`/journal/plans/imports/${m.source_imported_meal_id}`}
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
  onToggle,
  busy,
}: {
  item: GroceryItem;
  meals: PlannedMeal[];
  onToggle: (item: GroceryItem) => void;
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
          {item.quantity != null || item.unit ? (
            <span className={`text-[11px] antialiased transition-colors ${
              item.status === 'pending' ? 'text-white/50' : 'text-white/20'
            }`}>
              {formatQty(item.quantity, item.unit)}
            </span>
          ) : null}
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

        <MealSourceChips mealIds={item.source_planned_meal_ids} meals={meals} />
      </div>
    </button>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function GroceryListPage() {
  const router = useRouter();
  const planId = typeof router.query.planId === 'string' ? router.query.planId : null;
  const dateParam = typeof router.query.date === 'string' ? router.query.date : null;

  const [list, setList] = useState<GeneratedGroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [sourceMeals, setSourceMeals] = useState<PlannedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // itemId → busy flag for check/off toggles
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Today's date as the fallback when no date param is provided.
  const date = dateParam ?? new Date().toISOString().slice(0, 10);

  const fetchedRef = useRef(false);

  const loadList = useCallback(
    async (forceRegenerate = false) => {
      if (!planId) return;
      if (!forceRegenerate) setLoading(true);
      else setRegenerating(true);
      setError(null);
      try {
        const result = await planService.generateGroceryList(planId, {
          date,
          regenerate: forceRegenerate,
        });
        setList(result.list);
        setItems(result.items);
        setSourceMeals(result.source_meals);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load grocery list.');
      } finally {
        setLoading(false);
        setRegenerating(false);
      }
    },
    [planId, date],
  );

  useEffect(() => {
    if (!planId || fetchedRef.current) return;
    fetchedRef.current = true;
    void loadList(false);
  }, [planId, loadList]);

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
                href={`/journal/plans/day/${date}?planId=${planId}`}
                className="text-[11px] text-white/40 hover:text-white/70 antialiased transition-colors"
              >
                ← Plan day
              </Link>
              <h1 className="text-lg font-semibold text-white antialiased mt-0.5">
                Shopping list
              </h1>
              <p className="text-[11px] text-white/40 antialiased mt-0.5">
                {date}
                {list?.date_range_end && list.date_range_end !== date
                  ? ` – ${list.date_range_end}`
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
                No grocery items found for this day. Make sure meals are planned and have ingredient items.
              </p>
              <Link
                href={`/journal/plans/day/${date}?planId=${planId}`}
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
                        onToggle={(it) => void handleToggle(it)}
                        busy={togglingId === item.id}
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
                        onToggle={(it) => void handleToggle(it)}
                        busy={togglingId === item.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Provenance note */}
              <p className="text-[11px] text-white/25 antialiased px-1">
                Quantities reflect the serving amounts in your plan.
                Tap an item to mark it as bought. Tap ↗ on a meal chip to
                open the source import.
              </p>
            </>
          )}
        </div>
      </div>

      <JournalFooterNav />
    </div>
  );
}
