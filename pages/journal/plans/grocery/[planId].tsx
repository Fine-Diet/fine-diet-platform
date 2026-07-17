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
import {
  GroceryHaulSummaryCard,
  GroceryPriceObservationBadge,
  GroceryPricePanel,
  GroceryPriceQuotaBanner,
} from '@/components/grocery/GroceryPricingUi';
import { toDateKey } from '@/lib/journal';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import {
  planService,
  buildGroceryItemReadModel,
  groceryPantryKey,
  mapPriceObservationsToGroceryItems,
  type GeneratedGroceryList,
  type GroceryActiveListContext,
  type GroceryItem,
  type GroceryItemReadModel,
  type GroceryItemStatus,
  type GroceryPriceObservation,
  type GroceryPriceSearchQuota,
  type GroceryHaulSummary,
  type GroceryShoppingOverride,
  type GroceryShoppingOverrideBundle,
  type GroceryItemResolutionChangeResult,
  type PantryOnHandItem,
  type PlannedMeal,
} from '@/lib/plans';
import { groceryItemMatchKey } from '@/lib/plans/groceryMatchKeys';
import {
  buildReplaceInMealRoute,
  type ReplaceInMealRoute,
} from '@/lib/plans/groceryReplaceInMealRoute';
import { resolveFoodSearchShoppingSizeLabel } from '@/lib/plans/groceryResolutionCandidateDisplay';
import { applyConfirmedShoppingOverride } from '@/lib/plans/groceryShoppingOverrideClientState';
import type { FoodSearchResponse, FoodSearchResult } from '@/lib/food/types';

type ResolveCandidate = Pick<
  FoodSearchResult,
  'food' | 'source' | 'source_label' | 'offNormalization'
>;

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
  onEditResolution,
  onSetOnHand,
  onEditShopping,
  onReplaceInMeal,
  onFindPrice,
  onEnterManualPrice,
  priceObservation,
  busy,
}: {
  item: GroceryItem;
  meals: PlannedMeal[];
  readModel: GroceryItemReadModel;
  onToggle: (item: GroceryItem) => void;
  onResolve?: (item: GroceryItem) => void;
  onEditResolution?: (item: GroceryItem) => void;
  onSetOnHand?: (item: GroceryItem) => void;
  onEditShopping?: (item: GroceryItem) => void;
  onReplaceInMeal?: (item: GroceryItem) => void;
  onFindPrice?: (item: GroceryItem) => void;
  onEnterManualPrice?: (item: GroceryItem) => void;
  priceObservation?: GroceryPriceObservation | null;
  busy: boolean;
}) {
  return (
    <div className="w-full text-left flex items-start gap-3 py-3 px-3 rounded-xl hover:bg-white/[0.04] transition-colors group">
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggle(item)}
        className="mt-0.5 flex-shrink-0 disabled:opacity-60"
        aria-label={item.status === 'pending' ? 'Mark bought' : 'Mark pending'}
      >
        <span
          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${statusCheckClass(item.status)}`}
        >
          {(item.status === 'bought' || item.status === 'have') && (
            <span className="text-[10px] leading-none">✓</span>
          )}
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm antialiased transition-colors ${statusClass(item.status)}`}>
            {readModel.shopping.displayName}
          </p>
          {readModel.shopping.isCustomized && (
            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-denim-500/15 text-denim-200/90 antialiased border border-denim-400/20">
              customized
            </span>
          )}
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

        <div className="mt-2 flex flex-wrap gap-2">
          {!item.food_object_id && onResolve && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(item)}
              className="inline-flex text-[10px] text-denim-200/80 hover:text-denim-100 antialiased rounded-full border border-denim-400/20 px-2 py-1 bg-denim-500/10 disabled:opacity-50"
            >
              Resolve ingredient
            </button>
          )}
          {item.food_object_id && onSetOnHand && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSetOnHand(item)}
              className="inline-flex text-[10px] text-emerald-200/80 hover:text-emerald-100 antialiased rounded-full border border-emerald-400/20 px-2 py-1 bg-emerald-500/10 disabled:opacity-50"
            >
              Set on hand
            </button>
          )}
          {!item.food_object_id && onEnterManualPrice && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onEnterManualPrice(item)}
              className="inline-flex text-[10px] text-denim-200/80 hover:text-denim-100 antialiased rounded-full border border-denim-400/20 px-2 py-1 bg-denim-500/10 disabled:opacity-50"
            >
              Enter price
            </button>
          )}
          {item.food_object_id && onEditResolution && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onEditResolution(item)}
              className="inline-flex text-[10px] text-white/70 hover:text-white antialiased rounded-full border border-white/10 px-2 py-1 bg-white/[0.04] disabled:opacity-50"
            >
              Edit resolution
            </button>
          )}
          {item.food_object_id && onFindPrice && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onFindPrice(item)}
              className="inline-flex text-[10px] text-denim-200/80 hover:text-denim-100 antialiased rounded-full border border-denim-400/20 px-2 py-1 bg-denim-500/10 disabled:opacity-50"
            >
              Find price
            </button>
          )}
          {onEditShopping && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onEditShopping(item)}
              className="inline-flex text-[10px] text-white/70 hover:text-white antialiased rounded-full border border-white/10 px-2 py-1 bg-white/[0.04] disabled:opacity-50"
            >
              {readModel.shopping.isCustomized ? 'Edit shopping details' : 'Add shopping details'}
            </button>
          )}
          {onReplaceInMeal && item.source_planned_meal_ids.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReplaceInMeal(item)}
              className="inline-flex text-[10px] text-amber-200/80 hover:text-amber-100 antialiased rounded-full border border-amber-400/20 px-2 py-1 bg-amber-500/10 disabled:opacity-50"
            >
              Replace in meal
            </button>
          )}
        </div>

        <p className={`text-[11px] antialiased mt-1.5 ${
          item.status === 'pending' ? 'text-white/60' : 'text-white/25'
        }`}>
          {readModel.required.label}
        </p>
        {readModel.shopping.buyLabel && (
          <p className={`text-[11px] font-medium antialiased mt-0.5 ${
            item.status === 'pending' ? 'text-denim-200/85' : 'text-white/25'
          }`}>
            {readModel.shopping.buyLabel}
          </p>
        )}
        {readModel.shopping.override?.preferred_product && !readModel.shopping.buyLabel?.includes(readModel.shopping.override.preferred_product) && (
          <p className="text-[10px] text-white/35 antialiased mt-0.5">
            Preferred: {readModel.shopping.override.preferred_product}
          </p>
        )}
        {readModel.shopping.override?.aisle_category && (
          <p className="text-[10px] text-white/30 antialiased mt-0.5">
            Aisle: {readModel.shopping.override.aisle_category}
          </p>
        )}
        {readModel.shopping.override?.note && (
          <p className="text-[10px] text-white/30 antialiased mt-0.5">
            Note: {readModel.shopping.override.note}
          </p>
        )}
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
        {readModel.buySuggestion && !readModel.shopping.isCustomized && (
          <p className={`text-[10px] antialiased mt-0.5 ${
            item.status === 'pending' ? 'text-denim-200/70' : 'text-white/20'
          }`}>
            {readModel.buySuggestion}
          </p>
        )}
        {priceObservation && (
          <GroceryPriceObservationBadge observation={priceObservation} />
        )}

        <MealSourceChips mealIds={item.source_planned_meal_ids} meals={meals} />
      </div>
    </div>
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
  mode = 'resolve',
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
  mode?: 'resolve' | 'change_match';
  onClose: () => void;
  onSelect: (candidate: ResolveCandidate) => void;
}) {
  const isChangeMatch = mode === 'change_match';
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-lg rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-300/70 antialiased">
                {isChangeMatch ? 'Change match' : 'Resolve ingredient'}
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">
                {item.name}
              </h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                {isChangeMatch
                  ? 'Choose a different canonical food for this required name/unit. Future grocery lists will use the new match.'
                  : 'This teaches future grocery derivation for this exact unresolved name/unit. It does not change the current required amount.'}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70 text-sm">
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
              {results.map((candidate) => {
                const shoppingSize = resolveFoodSearchShoppingSizeLabel(candidate);
                const metadata = [
                  candidate.food.brandName,
                  shoppingSize,
                  candidate.source_label ?? candidate.source ?? candidate.food.sourceType,
                ].filter((value): value is string => Boolean(value));
                return (
                  <button
                    key={candidate.food.id}
                    type="button"
                    disabled={resolving}
                    onClick={() => onSelect(candidate)}
                    className="w-full text-left rounded-xl px-3 py-2 hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
                  >
                    <p className="text-sm text-white antialiased">{candidate.food.canonicalName}</p>
                    <p className="text-[10px] text-white/35 antialiased">
                      {metadata.join(' · ')}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResolutionEditMenuPanel({
  item,
  busy,
  onClose,
  onChangeMatch,
  onMarkUnresolved,
}: {
  item: GroceryItem;
  busy: boolean;
  onClose: () => void;
  onChangeMatch: () => void;
  onMarkUnresolved: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-lg rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-denim-300/70 antialiased">
                Edit resolution
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">{item.name}</h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                Required amount and unit stay the same. You can pick a different canonical match or downgrade this row back to unresolved.
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/70 text-sm disabled:opacity-50">
              Close
            </button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={onChangeMatch}
            className="w-full rounded-xl bg-denim-500/20 border border-denim-400/25 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/25 disabled:opacity-50 antialiased text-left"
          >
            Change match
            <span className="block text-[10px] text-white/35 mt-0.5">Search canonical foods and replace the learned mapping.</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onMarkUnresolved}
            className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/15 disabled:opacity-50 antialiased text-left"
          >
            Mark unresolved
            <span className="block text-[10px] text-amber-100/60 mt-0.5">Remove the learned match for this name/unit.</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkUnresolvedConfirmPanel({
  item,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  item: GroceryItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-lg rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-300/70 antialiased">
                Mark unresolved
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">{item.name}</h2>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="text-white/40 hover:text-white/70 text-sm disabled:opacity-50">
              Close
            </button>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-3">
            <p className="text-sm text-amber-50/95 antialiased">
              Find price and deductible Set on hand will be unavailable until you resolve this row again.
            </p>
            <p className="text-[11px] text-amber-100/70 antialiased mt-2">
              Your required amount, unit, and shopping status stay unchanged. Prior pantry and price history for the old food identity is preserved but will no longer apply to this row.
            </p>
          </div>
          {error && <p className="text-sm text-red-200 antialiased">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="w-full rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:opacity-50 antialiased"
          >
            {busy ? 'Updating…' : 'Mark unresolved'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full text-[11px] text-white/45 hover:text-white/70 antialiased"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ShoppingDetailsPanel({
  item,
  readModel,
  displayName,
  setDisplayName,
  purchaseQuantity,
  setPurchaseQuantity,
  purchaseUnit,
  setPurchaseUnit,
  preferredProduct,
  setPreferredProduct,
  aisleCategory,
  setAisleCategory,
  note,
  setNote,
  saving,
  clearing,
  error,
  onClose,
  onSave,
  onClear,
}: {
  item: GroceryItem;
  readModel: GroceryItemReadModel;
  displayName: string;
  setDisplayName: (value: string) => void;
  purchaseQuantity: string;
  setPurchaseQuantity: (value: string) => void;
  purchaseUnit: string;
  setPurchaseUnit: (value: string) => void;
  preferredProduct: string;
  setPreferredProduct: (value: string) => void;
  aisleCategory: string;
  setAisleCategory: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  saving: boolean;
  clearing: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-lg rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-denim-300/70 antialiased">
                Edit shopping details
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">{item.name}</h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                {readModel.required.label} — required truth stays unchanged.
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving || clearing} className="text-white/40 hover:text-white/70 text-sm">
              Close
            </button>
          </div>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <label className="block space-y-1">
            <span className="text-[10px] text-white/40 antialiased">Shopping display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] text-white/40 antialiased">Purchase quantity</span>
              <input type="number" min="0" step="0.01" value={purchaseQuantity} onChange={(e) => setPurchaseQuantity(e.target.value)} className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] text-white/40 antialiased">Purchase unit / package</span>
              <input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] text-white/40 antialiased">Preferred product or brand</span>
            <input value={preferredProduct} onChange={(e) => setPreferredProduct(e.target.value)} className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400" />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-white/40 antialiased">Aisle or category</span>
            <input value={aisleCategory} onChange={(e) => setAisleCategory(e.target.value)} className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400" />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] text-white/40 antialiased">Note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400" />
          </label>
          {error && <p className="text-sm text-red-200 antialiased">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onSave} disabled={saving || clearing} className="flex-1 rounded-xl bg-denim-500/20 border border-denim-400/25 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/25 disabled:opacity-50 antialiased">
              {saving ? 'Saving...' : 'Save shopping details'}
            </button>
            {readModel.shopping.isCustomized && (
              <button type="button" onClick={onClear} disabled={saving || clearing} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:text-white disabled:opacity-50 antialiased">
                {clearing ? 'Clearing...' : 'Clear'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplaceInMealPanel({
  item,
  route,
  onClose,
}: {
  item: GroceryItem;
  route: ReplaceInMealRoute;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-md rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-300/70 antialiased">
                Replace in meal
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">{item.name}</h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                Opens the planning surface for the contributing meal. This does not change required grocery truth here.
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70 text-sm">
              Close
            </button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {route.kind === 'none' && (
            <p className="text-sm text-white/50 antialiased">No contributing planned meals were found for this row.</p>
          )}
          {route.kind === 'single' && (
            <Link href={route.option.href} className="block rounded-xl border border-white/10 px-3 py-3 hover:bg-white/[0.04] transition-colors">
              <p className="text-sm text-white antialiased">{route.option.label}</p>
              <p className="text-[10px] text-white/35 antialiased mt-0.5">
                {route.option.kind === 'import_edit' ? 'Open import editor' : 'Open plan day editor'}
              </p>
            </Link>
          )}
          {route.kind === 'choice' && route.options.map((option) => (
            <Link key={option.meal_id} href={option.href} className="block rounded-xl border border-white/10 px-3 py-3 hover:bg-white/[0.04] transition-colors">
              <p className="text-sm text-white antialiased">{option.label}</p>
              <p className="text-[10px] text-white/35 antialiased mt-0.5">
                {option.kind === 'import_edit' ? 'Open import editor' : 'Open plan day editor'}
              </p>
            </Link>
          ))}
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
  const [editResolutionItem, setEditResolutionItem] = useState<GroceryItem | null>(null);
  const [editResolutionStep, setEditResolutionStep] = useState<
    'menu' | 'change-search' | 'confirm-unresolved'
  >('menu');
  const [editResolutionQuery, setEditResolutionQuery] = useState('');
  const [editResolutionResults, setEditResolutionResults] = useState<ResolveCandidate[]>([]);
  const [searchingEditResolution, setSearchingEditResolution] = useState(false);
  const [editResolutionBusy, setEditResolutionBusy] = useState(false);
  const [editResolutionError, setEditResolutionError] = useState<string | null>(null);
  const [onHandItem, setOnHandItem] = useState<GroceryItem | null>(null);
  const [onHandQuantity, setOnHandQuantity] = useState('');
  const [onHandUnit, setOnHandUnit] = useState('');
  const [savingOnHand, setSavingOnHand] = useState(false);
  const [onHandError, setOnHandError] = useState<string | null>(null);
  const [shoppingOverrides, setShoppingOverrides] = useState<GroceryShoppingOverrideBundle>({
    by_match_key: {},
    unmatched: [],
  });
  const [resolvedProductLabels, setResolvedProductLabels] = useState<Record<string, string>>({});
  const [planDayDates, setPlanDayDates] = useState<Record<string, string>>({});
  const [shoppingItem, setShoppingItem] = useState<GroceryItem | null>(null);
  const [shoppingDisplayName, setShoppingDisplayName] = useState('');
  const [shoppingPurchaseQuantity, setShoppingPurchaseQuantity] = useState('');
  const [shoppingPurchaseUnit, setShoppingPurchaseUnit] = useState('');
  const [shoppingPreferredProduct, setShoppingPreferredProduct] = useState('');
  const [shoppingAisleCategory, setShoppingAisleCategory] = useState('');
  const [shoppingNote, setShoppingNote] = useState('');
  const [savingShopping, setSavingShopping] = useState(false);
  const [clearingShopping, setClearingShopping] = useState(false);
  const [shoppingError, setShoppingError] = useState<string | null>(null);
  const [replaceItem, setReplaceItem] = useState<GroceryItem | null>(null);
  const [priceItem, setPriceItem] = useState<GroceryItem | null>(null);
  const [priceEntryMode, setPriceEntryMode] = useState<'search' | 'manual-only'>('search');
  const [priceObservations, setPriceObservations] = useState<Record<string, GroceryPriceObservation>>({});
  const [priceQuota, setPriceQuota] = useState<GroceryPriceSearchQuota | null>(null);
  const [haulSummary, setHaulSummary] = useState<GroceryHaulSummary | null>(null);
  const [haulLoading, setHaulLoading] = useState(false);
  const [haulError, setHaulError] = useState<string | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);

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
        setShoppingOverrides(result.shopping_overrides);
        setResolvedProductLabels(result.resolved_product_labels ?? {});
        setPlanDayDates(result.plan_day_dates);
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

  const loadHaulSummary = useCallback(async (itemsOverride?: GroceryItem[]) => {
    if (!planId || !list?.id) return;
    setHaulLoading(true);
    setHaulError(null);
    const rows = itemsOverride ?? items;
    try {
      const bundle = await planService.getGroceryHaulSummary(planId, list.id);
      setHaulSummary(bundle.summary);
      setPriceObservations(
        mapPriceObservationsToGroceryItems(rows, bundle.observations_by_match_key),
      );
    } catch (err) {
      setHaulError(err instanceof Error ? err.message : 'Failed to load haul summary.');
      setHaulSummary(null);
    } finally {
      setHaulLoading(false);
    }
  }, [planId, list?.id, items]);

  useEffect(() => {
    if (!planId || !list?.id) {
      setHaulSummary(null);
      return;
    }
    void loadHaulSummary();
  }, [planId, list?.id, loadHaulSummary]);

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

  useEffect(() => {
    if (!editResolutionItem || editResolutionStep !== 'change-search') return;
    const q = editResolutionQuery.trim();
    setEditResolutionError(null);
    if (q.length < 2) {
      setEditResolutionResults([]);
      setSearchingEditResolution(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchingEditResolution(true);
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
        setEditResolutionResults(body.results.slice(0, 12));
      } catch (err) {
        if (!controller.signal.aborted) {
          setEditResolutionError(err instanceof Error ? err.message : 'Food search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setSearchingEditResolution(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [editResolutionItem, editResolutionStep, editResolutionQuery]);

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
      const result = await planService.resolveGroceryItemIngredient(
        resolveItem.id,
        candidate.food.id,
      );
      setItems((prev) => prev.map((it) => (it.id === result.item.id ? result.item : it)));
      const key = groceryItemMatchKey(result.item);
      setShoppingOverrides((prev) => ({
        by_match_key: { ...prev.by_match_key, [key]: result.shopping_override },
        unmatched: prev.unmatched.filter((it) => it.match_key !== key),
      }));
      if (result.item.food_object_id && result.shopping_override.shopping_display_name) {
        setResolvedProductLabels((prev) => ({
          ...prev,
          [result.item.food_object_id!]: result.shopping_override.shopping_display_name!,
        }));
      }
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

  function applyResolutionChangeResult(result: GroceryItemResolutionChangeResult) {
    const previousFoodId = result.previous_match_key.split('::')[0] ?? null;
    const nextItems = items.map((it) => (it.id === result.item.id ? result.item : it));
    setItems(nextItems);
    setShoppingOverrides((prev) => {
      const by_match_key = { ...prev.by_match_key };
      delete by_match_key[result.previous_match_key];
      if (result.shopping_override) {
        by_match_key[groceryItemMatchKey(result.item)] = result.shopping_override;
      }
      let unmatched = prev.unmatched.filter(
        (override) => override.match_key !== result.previous_match_key,
      );
      if (result.retired_override) {
        unmatched = [
          ...unmatched.filter((override) => override.id !== result.retired_override!.id),
          result.retired_override,
        ];
      }
      return { by_match_key, unmatched };
    });
    setPriceObservations((prev) => {
      const next = { ...prev };
      delete next[result.item.id];
      return next;
    });
    setResolvedProductLabels((prev) => {
      const next = { ...prev };
      if (
        previousFoodId &&
        !nextItems.some((row) => row.food_object_id === previousFoodId)
      ) {
        delete next[previousFoodId];
      }
      if (result.item.food_object_id && result.shopping_override?.shopping_display_name) {
        next[result.item.food_object_id] = result.shopping_override.shopping_display_name;
      }
      return next;
    });
    void loadHaulSummary(nextItems);
  }

  function openEditResolution(item: GroceryItem) {
    setEditResolutionItem(item);
    setEditResolutionStep('menu');
    setEditResolutionQuery(item.name);
    setEditResolutionResults([]);
    setEditResolutionError(null);
  }

  function closeEditResolution() {
    if (editResolutionBusy) return;
    setEditResolutionItem(null);
    setEditResolutionStep('menu');
    setEditResolutionQuery('');
    setEditResolutionResults([]);
    setEditResolutionError(null);
  }

  async function handleChangeResolution(candidate: ResolveCandidate) {
    if (!editResolutionItem || editResolutionBusy) return;
    setEditResolutionBusy(true);
    setEditResolutionError(null);
    try {
      const result = await planService.changeGroceryItemResolution(
        editResolutionItem.id,
        candidate.food.id,
      );
      applyResolutionChangeResult(result);
      closeEditResolution();
    } catch (err) {
      setEditResolutionError(err instanceof Error ? err.message : 'Failed to change match.');
    } finally {
      setEditResolutionBusy(false);
    }
  }

  async function handleMarkUnresolved() {
    if (!editResolutionItem || editResolutionBusy) return;
    setEditResolutionBusy(true);
    setEditResolutionError(null);
    try {
      const result = await planService.markGroceryItemUnresolved(editResolutionItem.id);
      applyResolutionChangeResult(result);
      closeEditResolution();
    } catch (err) {
      setEditResolutionError(err instanceof Error ? err.message : 'Failed to mark unresolved.');
    } finally {
      setEditResolutionBusy(false);
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

  function productLabelForItem(item: GroceryItem): string | null {
    if (!item.food_object_id) return null;
    return resolvedProductLabels[item.food_object_id] ?? null;
  }

  function overrideForItem(item: GroceryItem): GroceryShoppingOverride | null {
    return shoppingOverrides.by_match_key[groceryItemMatchKey(item)] ?? null;
  }

  function openShoppingDetails(item: GroceryItem) {
    const override = overrideForItem(item);
    const resolvedLabel = productLabelForItem(item);
    setShoppingItem(item);
    setShoppingDisplayName(
      override?.shopping_display_name ?? resolvedLabel ?? '',
    );
    setShoppingPurchaseQuantity(
      override?.purchase_quantity != null ? String(override.purchase_quantity) : '',
    );
    setShoppingPurchaseUnit(override?.purchase_unit ?? '');
    setShoppingPreferredProduct(override?.preferred_product ?? '');
    setShoppingAisleCategory(override?.aisle_category ?? item.aisle_category ?? '');
    setShoppingNote(override?.note ?? '');
    setShoppingError(null);
  }

  function closeShoppingDetails() {
    if (savingShopping || clearingShopping) return;
    setShoppingItem(null);
    setShoppingError(null);
  }

  async function handleSaveShoppingDetails() {
    if (!shoppingItem || savingShopping) return;
    const purchaseQuantity = shoppingPurchaseQuantity.trim()
      ? Number(shoppingPurchaseQuantity)
      : null;
    if (purchaseQuantity != null && (!Number.isFinite(purchaseQuantity) || purchaseQuantity < 0)) {
      setShoppingError('Purchase quantity must be a non-negative number.');
      return;
    }
    setSavingShopping(true);
    setShoppingError(null);
    try {
      const saved = await planService.saveGroceryShoppingOverride(shoppingItem.id, {
        shopping_display_name: shoppingDisplayName.trim() || null,
        purchase_quantity: purchaseQuantity,
        purchase_unit: shoppingPurchaseUnit.trim() || null,
        preferred_product: shoppingPreferredProduct.trim() || null,
        aisle_category: shoppingAisleCategory.trim() || null,
        note: shoppingNote.trim() || null,
      });
      const key = groceryItemMatchKey(shoppingItem);
      setShoppingOverrides((prev) => ({
        by_match_key: { ...prev.by_match_key, [key]: saved },
        unmatched: prev.unmatched.filter((it) => it.match_key !== key),
      }));
      setShoppingItem(null);
    } catch (err) {
      setShoppingError(err instanceof Error ? err.message : 'Failed to save shopping details.');
    } finally {
      setSavingShopping(false);
    }
  }

  async function handleClearShoppingDetails() {
    if (!shoppingItem || clearingShopping) return;
    setClearingShopping(true);
    setShoppingError(null);
    try {
      await planService.clearGroceryShoppingOverride(shoppingItem.id);
      const key = groceryItemMatchKey(shoppingItem);
      setShoppingOverrides((prev) => {
        const next = { ...prev.by_match_key };
        delete next[key];
        return { by_match_key: next, unmatched: prev.unmatched };
      });
      setShoppingItem(null);
    } catch (err) {
      setShoppingError(err instanceof Error ? err.message : 'Failed to clear shopping details.');
    } finally {
      setClearingShopping(false);
    }
  }

  async function handleRetireUnmatchedOverride(override: GroceryShoppingOverride) {
    try {
      await planService.retireUnmatchedGroceryShoppingOverride(override.id);
      setShoppingOverrides((prev) => ({
        ...prev,
        unmatched: prev.unmatched.filter((it) => it.id !== override.id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss unmatched override.');
    }
  }

  function openReplaceInMeal(item: GroceryItem) {
    setReplaceItem(item);
  }

  function closeReplaceInMeal() {
    setReplaceItem(null);
  }

  function openFindPrice(item: GroceryItem) {
    setPriceEntryMode('search');
    setPriceItem(item);
  }

  function openManualPrice(item: GroceryItem) {
    setPriceEntryMode('manual-only');
    setPriceItem(item);
  }

  function closeFindPrice() {
    if (priceBusy) return;
    setPriceItem(null);
  }

  function handlePriceObservationSaved(observation: GroceryPriceObservation) {
    if (observation.grocery_item_id) {
      setPriceObservations((prev) => ({
        ...prev,
        [observation.grocery_item_id!]: observation,
      }));
    }
    void loadHaulSummary();
  }

  const replaceRoute = useMemo<ReplaceInMealRoute>(() => {
    if (!replaceItem || !planId) return { kind: 'none' };
    return buildReplaceInMealRoute(replaceItem, sourceMeals, planId, planDayDates);
  }, [replaceItem, sourceMeals, planId, planDayDates]);

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

              <GroceryPriceQuotaBanner quota={priceQuota} />

              {list?.id && (
                <GroceryHaulSummaryCard
                  summary={haulSummary}
                  loading={haulLoading}
                  error={haulError}
                  onRefresh={() => void loadHaulSummary()}
                />
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
                        readModel={buildGroceryItemReadModel(item, pantryItems, overrideForItem(item), productLabelForItem(item))}
                        onToggle={(it) => void handleToggle(it)}
                        onEditResolution={openEditResolution}
                        onSetOnHand={openOnHand}
                        onEditShopping={openShoppingDetails}
                        onReplaceInMeal={openReplaceInMeal}
                        onFindPrice={openFindPrice}
                        priceObservation={priceObservations[item.id] ?? null}
                        busy={
                          togglingId === item.id
                          || resolvingId === item.id
                          || savingOnHand
                          || savingShopping
                          || clearingShopping
                          || priceBusy
                          || editResolutionBusy
                        }
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
                        readModel={buildGroceryItemReadModel(item, pantryItems, overrideForItem(item), productLabelForItem(item))}
                        onToggle={(it) => void handleToggle(it)}
                        onResolve={openResolve}
                        onEditShopping={openShoppingDetails}
                        onReplaceInMeal={openReplaceInMeal}
                        onEnterManualPrice={openManualPrice}
                        priceObservation={priceObservations[item.id] ?? null}
                        busy={
                          togglingId === item.id
                          || resolvingId === item.id
                          || savingOnHand
                          || savingShopping
                          || clearingShopping
                          || priceBusy
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {shoppingOverrides.unmatched.length > 0 && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 overflow-hidden">
                  <div className="px-3 pt-3 pb-1">
                    <p className="text-[10px] uppercase tracking-wider text-amber-200/80 antialiased">
                      Unmatched shopping overrides
                    </p>
                    <p className="text-[10px] text-white/35 antialiased mt-1">
                      These saved shopping details no longer match a required ingredient after regeneration.
                    </p>
                  </div>
                  <div className="divide-y divide-amber-500/10">
                    {shoppingOverrides.unmatched.map((override) => (
                      <div key={override.id} className="px-3 py-3 space-y-1">
                        <p className="text-sm text-white antialiased">
                          {override.shopping_display_name ?? override.unresolved_name ?? 'Saved override'}
                        </p>
                        <p className="text-[10px] text-white/35 antialiased">
                          Key: {override.match_key}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleRetireUnmatchedOverride(override)}
                          className="text-[10px] text-amber-200/80 hover:text-amber-100 antialiased"
                        >
                          Dismiss override
                        </button>
                      </div>
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
                changing this required amount. Shopping details are your buy
                preferences and never change required amounts or planned meals.
                Find price searches retailer offers for grounded items; Enter price
                lets any row record a manual price for optional haul estimates.
                Neither changes required amounts, status, or pantry deductions.
                Tap the checkbox to mark an item as bought;
                tap ↗ on a meal chip to open the source import.
              </p>
            </>
          )}
        </div>
      </div>

      {editResolutionItem && editResolutionStep === 'menu' && (
        <ResolutionEditMenuPanel
          item={editResolutionItem}
          busy={editResolutionBusy}
          onClose={closeEditResolution}
          onChangeMatch={() => {
            setEditResolutionStep('change-search');
            setEditResolutionQuery(editResolutionItem.name);
            setEditResolutionResults([]);
            setEditResolutionError(null);
          }}
          onMarkUnresolved={() => {
            setEditResolutionStep('confirm-unresolved');
            setEditResolutionError(null);
          }}
        />
      )}

      {editResolutionItem && editResolutionStep === 'change-search' && (
        <ResolveIngredientPanel
          item={editResolutionItem}
          mode="change_match"
          query={editResolutionQuery}
          setQuery={setEditResolutionQuery}
          results={editResolutionResults}
          searching={searchingEditResolution}
          resolving={editResolutionBusy}
          error={editResolutionError}
          onClose={closeEditResolution}
          onSelect={(candidate) => void handleChangeResolution(candidate)}
        />
      )}

      {editResolutionItem && editResolutionStep === 'confirm-unresolved' && (
        <MarkUnresolvedConfirmPanel
          item={editResolutionItem}
          busy={editResolutionBusy}
          error={editResolutionError}
          onClose={() => {
            if (editResolutionBusy) return;
            setEditResolutionStep('menu');
            setEditResolutionError(null);
          }}
          onConfirm={() => void handleMarkUnresolved()}
        />
      )}

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

      {shoppingItem && (
        <ShoppingDetailsPanel
          item={shoppingItem}
          readModel={buildGroceryItemReadModel(
            shoppingItem,
            pantryItems,
            overrideForItem(shoppingItem),
            productLabelForItem(shoppingItem),
          )}
          displayName={shoppingDisplayName}
          setDisplayName={setShoppingDisplayName}
          purchaseQuantity={shoppingPurchaseQuantity}
          setPurchaseQuantity={setShoppingPurchaseQuantity}
          purchaseUnit={shoppingPurchaseUnit}
          setPurchaseUnit={setShoppingPurchaseUnit}
          preferredProduct={shoppingPreferredProduct}
          setPreferredProduct={setShoppingPreferredProduct}
          aisleCategory={shoppingAisleCategory}
          setAisleCategory={setShoppingAisleCategory}
          note={shoppingNote}
          setNote={setShoppingNote}
          saving={savingShopping}
          clearing={clearingShopping}
          error={shoppingError}
          onClose={closeShoppingDetails}
          onSave={() => void handleSaveShoppingDetails()}
          onClear={() => void handleClearShoppingDetails()}
        />
      )}

      {replaceItem && (
        <ReplaceInMealPanel item={replaceItem} route={replaceRoute} onClose={closeReplaceInMeal} />
      )}

      {priceItem && (
        <GroceryPricePanel
          item={priceItem}
          currentObservation={priceObservations[priceItem.id] ?? null}
          entryMode={priceEntryMode}
          busy={priceBusy}
          onClose={closeFindPrice}
          onSearch={
            priceEntryMode === 'search'
              ? async (input) => {
                  setPriceBusy(true);
                  try {
                    return await planService.searchGroceryItemPrices(priceItem.id, input);
                  } finally {
                    setPriceBusy(false);
                  }
                }
              : undefined
          }
          onConfirmOffer={
            priceEntryMode === 'search'
              ? async (input) => {
                  setPriceBusy(true);
                  try {
                    const confirmation = await planService.confirmGroceryItemPrice(
                      priceItem.id,
                      input,
                    );
                    setShoppingOverrides((current) =>
                      applyConfirmedShoppingOverride(
                        current,
                        confirmation.shopping_override,
                      ),
                    );
                    return confirmation;
                  } finally {
                    setPriceBusy(false);
                  }
                }
              : undefined
          }
          onSaveManual={async (input) => {
            setPriceBusy(true);
            try {
              return await planService.saveManualGroceryItemPrice(priceItem.id, input);
            } finally {
              setPriceBusy(false);
            }
          }}
          onQuotaUpdate={setPriceQuota}
          onObservationSaved={handlePriceObservationSaved}
        />
      )}

      <JournalFooterNav />
    </div>
  );
}
