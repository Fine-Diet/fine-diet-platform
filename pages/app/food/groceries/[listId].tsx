'use client';

/**
 * Food → Grocery List detail — Persistent Grocery Lists v2.
 *
 * Manual item add/edit/check-off/remove on a persistent (planless) list.
 * Named lists support rename, archive/restore (with confirmation), and safe
 * delete when empty. The default "My Grocery List" stays protected.
 *
 * Generated ("planned_meal") contributions show their source plan and link
 * back to the full Plan grocery page for pricing, ingredient resolution,
 * pantry deduction, and shopping-override editing.
 *
 * If the requested id turns out to be a plan-derived list (plan_id set),
 * redirect to the plan-scoped grocery page instead of rendering here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { GroceryHaulSummaryCard, GroceryPricePanel } from '@/components/grocery/GroceryPricingUi';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type {
  GeneratedGroceryList,
  GroceryItem,
  GroceryItemStatus,
  GroceryListPriceObservation,
  GroceryListPurchasingChoice,
  Plan,
} from '@/lib/plans/types';
import type {
  FullHaulEstimate,
  GroceryHaulSummary,
  GroceryPriceObservation,
} from '@/lib/plans/groceryPricingTypes';
import {
  buildFullHaulSegmentsQaFixture,
  isFullHaulQaSegmentsEnabled,
} from '@/lib/plans/fullHaulQaFixture';
import {
  resolveListShoppingDisplayName,
} from '@/lib/plans/groceryListPurchasingChoiceDisplay';
import {
  LIST_RESOLVE_QA_CASES,
  isListResolveQaEnabled,
} from '@/lib/plans/listPurchasingChoiceQaCases';
import {
  LIST_PRICE_ADD_QA_CASES,
  LIST_RETAILER_SCENARIO_QA_CASES,
  isListPriceAddQaEnabled,
  isListRetailerScenarioQaEnabled,
} from '@/lib/plans/listPriceAddQaCases';
import {
  groupGroceryAddSuggestions,
  parseGroceryAddIntent,
  type GroceryAddSuggestion,
} from '@/lib/plans/groceryListAddIntent';
import { listPriceToHaulObservation } from '@/lib/plans/groceryListPriceObservationDisplay';
import {
  GROCERY_LIST_SORT_OPTIONS,
  loadGroceryListSortMode,
  saveGroceryListSortMode,
  sortGroceryListItems,
  type GroceryListSortMode,
} from '@/lib/plans/groceryListSort';
import {
  buildRetailerScenarioPreview,
  listRetailersFromQuotePools,
} from '@/lib/plans/groceryListRetailerScenario';
import { computeFullHaulEstimate } from '@/lib/plans/fullHaulEstimate';
import { formatGroceryCurrency } from '@/lib/plans/groceryPricingFormat';
import {
  loadGroceryPriceSearchPrefs,
  saveGroceryPriceSearchPrefs,
} from '@/lib/plans/groceryPricingClient';
import { groceryListDeleteRejection } from '@/lib/plans/groceryListDeleteRejection';
import {
  formatPullFromPlanOptionLabel,
  groceryPullEmptyMessage,
  resolvePullFromPlanSelection,
  type PullPlanSelectionMode,
} from '@/lib/plans/pullFromPlanSelection';
import type { FoodSearchResult } from '@/lib/food/types';

type ResolveCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

function requiredLabel(item: GroceryItem): string {
  if (item.quantity != null && item.unit) return `${item.quantity} ${item.unit}`;
  if (item.quantity != null) return String(item.quantity);
  if (item.unit) return item.unit;
  return 'Amount not specified';
}

export default function PersistentGroceryListPage() {
  const router = useRouter();
  const listId = typeof router.query.listId === 'string' ? router.query.listId : null;
  const fullHaulQaEnabled = isFullHaulQaSegmentsEnabled(router.query.qa_full_haul);
  const listResolveQaEnabled = isListResolveQaEnabled(router.query.qa_list_resolve);
  const listPriceAddQaEnabled = isListPriceAddQaEnabled(router.query.qa_list_price_add);
  const listRetailerScenarioQaEnabled = isListRetailerScenarioQaEnabled(
    router.query.qa_list_price_add,
  );

  const [list, setList] = useState<GeneratedGroceryList | null>(null);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [purchasingChoices, setPurchasingChoices] = useState<
    Record<string, GroceryListPurchasingChoice>
  >({});
  const [listPrices, setListPrices] = useState<Record<string, GroceryListPriceObservation>>({});
  const [staleListPrices, setStaleListPrices] = useState<
    Record<string, GroceryListPriceObservation>
  >({});
  const [quotePools, setQuotePools] = useState<
    Record<string, GroceryListPriceObservation[]>
  >({});
  const [activeQuoteIds, setActiveQuoteIds] = useState<Record<string, string>>({});
  const [expandedQuoteItemId, setExpandedQuoteItemId] = useState<string | null>(null);
  const [settingActiveQuoteId, setSettingActiveQuoteId] = useState<string | null>(null);
  /** null = current list estimate (committed actives). Non-null = ephemeral retailer preview. */
  const [scenarioRetailerKey, setScenarioRetailerKey] = useState<string | null>(null);
  const [applyingScenario, setApplyingScenario] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [haulSummary, setHaulSummary] = useState<GroceryHaulSummary | null>(null);
  const [fullHaul, setFullHaul] = useState<FullHaulEstimate | null>(null);
  const [haulLoading, setHaulLoading] = useState(false);
  const [haulError, setHaulError] = useState<string | null>(null);

  const [resolveItem, setResolveItem] = useState<GroceryItem | null>(null);
  const [resolveQuery, setResolveQuery] = useState('');
  const [resolveResults, setResolveResults] = useState<ResolveCandidate[]>([]);
  const [searchingResolve, setSearchingResolve] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [saveToSourcePlan, setSaveToSourcePlan] = useState(false);

  const [priceItem, setPriceItem] = useState<GroceryItem | null>(null);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceEntryMode, setPriceEntryMode] = useState<'search' | 'manual-only'>('search');
  const [sortMode, setSortMode] = useState<GroceryListSortMode>('newest');

  const [addQuery, setAddQuery] = useState('');
  const [addSuggestions, setAddSuggestions] = useState<{
    ingredients: GroceryAddSuggestion[];
    products: GroceryAddSuggestion[];
  }>({ ingredients: [], products: [] });
  const [searchingAdd, setSearchingAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const addIntent = useMemo(() => parseGroceryAddIntent(addQuery), [addQuery]);

  const sortedItems = useMemo(
    () =>
      sortGroceryListItems({
        items,
        mode: sortMode,
        displayName: (item) =>
          resolveListShoppingDisplayName({
            item,
            choice: purchasingChoices[item.id] ?? null,
          }),
      }),
    [items, sortMode, purchasingChoices],
  );

  const retailerOptions = useMemo(
    () =>
      listRetailersFromQuotePools({
        items,
        choicesByItemId: purchasingChoices,
        poolByItemId: quotePools,
      }),
    [items, purchasingChoices, quotePools],
  );

  const scenarioPreview = useMemo(() => {
    if (!scenarioRetailerKey) return null;
    return buildRetailerScenarioPreview({
      items,
      choicesByItemId: purchasingChoices,
      poolByItemId: quotePools,
      retailerKey: scenarioRetailerKey,
    });
  }, [scenarioRetailerKey, items, purchasingChoices, quotePools]);

  const scenarioPreviewHaul = useMemo(() => {
    if (!scenarioPreview || !listId) return null;
    const observationsByItemId = new Map(
      scenarioPreview.rows
        .filter((row) => row.state === 'matched' && row.quote)
        .map((row) => [row.item_id, listPriceToHaulObservation(row.quote!)] as const),
    );
    return computeFullHaulEstimate({
      groceryListId: listId,
      items,
      observationsByItemId,
      listPlanId: null,
      tax: { status: 'excluded' },
    });
  }, [scenarioPreview, listId, items]);

  const displayHaulSummary = scenarioPreviewHaul && scenarioPreview
    ? {
        ...(haulSummary ?? {
          grocery_list_id: listId ?? '',
          currency: scenarioPreviewHaul.currency,
          estimated_total: scenarioPreviewHaul.estimated_total,
          manual_subtotal: scenarioPreviewHaul.observation_manual_subtotal,
          sourced_subtotal: scenarioPreviewHaul.observation_sourced_subtotal,
          priced_item_count: scenarioPreviewHaul.priced_item_count,
          eligible_item_count: scenarioPreviewHaul.eligible_item_count,
          total_item_count: scenarioPreviewHaul.eligible_item_count,
          unpriced_item_count: scenarioPreviewHaul.unpriced_item_count,
          priced_coverage_percent: scenarioPreviewHaul.priced_coverage_percent,
          stale_item_count: scenarioPreviewHaul.stale_item_count,
          average_match_confidence: scenarioPreviewHaul.average_match_confidence,
          newest_price_at: scenarioPreviewHaul.newest_price_at,
          oldest_price_at: scenarioPreviewHaul.oldest_price_at,
          is_incomplete_estimate: scenarioPreviewHaul.is_incomplete_estimate,
          confidence_summary: scenarioPreviewHaul.estimate_confidence,
          estimated_merchandise_subtotal: scenarioPreviewHaul.estimated_merchandise_subtotal,
          estimated_tax: scenarioPreviewHaul.estimated_tax,
          tax_status: scenarioPreviewHaul.tax_status,
          tax_disclosure: scenarioPreviewHaul.tax_disclosure,
        }),
        estimated_total: scenarioPreviewHaul.estimated_total,
        priced_item_count: scenarioPreviewHaul.priced_item_count,
        eligible_item_count: scenarioPreviewHaul.eligible_item_count,
        unpriced_item_count: scenarioPreviewHaul.unpriced_item_count,
        priced_coverage_percent: scenarioPreviewHaul.priced_coverage_percent,
        stale_item_count: scenarioPreview.stale_count,
        is_incomplete_estimate:
          scenarioPreview.missing_count > 0 || scenarioPreviewHaul.is_incomplete_estimate,
        estimated_merchandise_subtotal: scenarioPreviewHaul.estimated_merchandise_subtotal,
        manual_subtotal: scenarioPreviewHaul.observation_manual_subtotal,
        sourced_subtotal: scenarioPreviewHaul.observation_sourced_subtotal,
      }
    : haulSummary;

  const displayFullHaul = scenarioPreviewHaul
    ? {
        ...scenarioPreviewHaul,
        mixed_retailers: false,
        retailer_summary: scenarioPreview?.retailer_display ?? scenarioRetailerKey,
      }
    : fullHaul;

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'delete' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [deleteBlockedByItems, setDeleteBlockedByItems] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Target-list generation: pull a Plan's pending needs into this list,
  // additively, without disturbing manual items or other batches.
  const [showPullFromPlan, setShowPullFromPlan] = useState(false);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planSelectionMode, setPlanSelectionMode] = useState<PullPlanSelectionMode>('auto');
  const [pullCoveragePartial, setPullCoveragePartial] = useState(false);
  const [pullDateStart, setPullDateStart] = useState(todayIso());
  const [pullDateEnd, setPullDateEnd] = useState(todayIso());
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullMessage, setPullMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!plans || plans.length === 0) return;
    const resolved = resolvePullFromPlanSelection({
      plans,
      rangeStart: pullDateStart,
      rangeEnd: pullDateEnd < pullDateStart ? pullDateStart : pullDateEnd,
      currentPlanId: selectedPlanId || null,
      selectionMode: planSelectionMode,
    });
    if (resolved.selectedPlanId !== (selectedPlanId || null)) {
      setSelectedPlanId(resolved.selectedPlanId ?? '');
    }
    if (resolved.selectionMode !== planSelectionMode) {
      setPlanSelectionMode(resolved.selectionMode);
    }
    setPullCoveragePartial(resolved.partialCoverage);
  }, [plans, pullDateStart, pullDateEnd, planSelectionMode, selectedPlanId]);

  const load = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await planService.getPersistentGroceryList(listId);
      if (result.list.plan_id) {
        void router.replace(
          `${APP_ROUTE_BUILDERS.planGrocery(result.list.plan_id)}?date=${result.list.date_range_start ?? ''}&date_end=${result.list.date_range_end ?? ''}`,
        );
        return;
      }
      setList(result.list);
      setItems(result.items);
      setTitleDraft(result.list.title ?? '');
      try {
        const choices = await planService.getPersistentGroceryPurchasingChoices(listId);
        setPurchasingChoices(choices);
      } catch {
        setPurchasingChoices({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load grocery list.');
    } finally {
      setLoading(false);
    }
  }, [listId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!listId || !router.isReady) return;
    setSortMode(loadGroceryListSortMode(listId));
  }, [listId, router.isReady]);

  const loadHaulSummary = useCallback(async () => {
    if (!listId || !list) return;
    setHaulLoading(true);
    setHaulError(null);
    try {
      if (fullHaulQaEnabled) {
        const fixture = buildFullHaulSegmentsQaFixture({ groceryListId: listId });
        setHaulSummary(fixture.summary);
        setFullHaul(fixture.full_haul);
        return;
      }
      const bundle = await planService.getPersistentGroceryHaulSummary(listId);
      setHaulSummary(bundle.summary);
      setFullHaul(bundle.full_haul ?? null);
      if (bundle.list_prices_by_item_id) {
        setListPrices(bundle.list_prices_by_item_id);
      }
      if (bundle.stale_list_prices_by_item_id) {
        setStaleListPrices(bundle.stale_list_prices_by_item_id);
      }
      try {
        const quotes = await planService.getPersistentGroceryPriceQuotes(listId);
        setListPrices(quotes.by_item_id);
        setStaleListPrices(quotes.stale_by_item_id);
        setQuotePools(quotes.pool_by_item_id ?? {});
        setActiveQuoteIds(quotes.active_observation_id_by_item_id ?? {});
      } catch {
        // Quotes endpoint may be unavailable before migration — haul still works.
      }
    } catch (err) {
      setHaulError(err instanceof Error ? err.message : 'Failed to load haul summary.');
      setHaulSummary(null);
      setFullHaul(null);
    } finally {
      setHaulLoading(false);
    }
  }, [listId, list, fullHaulQaEnabled]);

  useEffect(() => {
    if (!listId || !list) {
      setHaulSummary(null);
      setFullHaul(null);
      return;
    }
    void loadHaulSummary();
  }, [listId, list, loadHaulSummary]);

  useEffect(() => {
    if (!resolveItem) return;
    const q = resolveQuery.trim();
    setResolveError(null);
    if (q.length < 2) {
      setResolveResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingResolve(true);
      try {
        const params = new URLSearchParams({ q, limit: '8' });
        const res = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
        });
        const body = (await res.json()) as { results?: ResolveCandidate[] };
        if (!cancelled) setResolveResults(body.results ?? []);
      } catch {
        if (!cancelled) setResolveResults([]);
      } finally {
        if (!cancelled) setSearchingResolve(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [resolveItem, resolveQuery]);

  useEffect(() => {
    const primary = addIntent.name.trim() || addQuery.trim();
    if (primary.length < 2) {
      setAddSuggestions({ ingredients: [], products: [] });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingAdd(true);
      try {
        const queries = [primary];
        if (
          addIntent.correction_hint &&
          addIntent.correction_hint.toLowerCase() !== primary.toLowerCase()
        ) {
          queries.push(addIntent.correction_hint);
        }
        const resultSets = await Promise.all(
          queries.map(async (q) => {
            const params = new URLSearchParams({
              q,
              limit: '10',
              consumer: 'flat',
              pageContext: 'grocery_list_add',
            });
            const res = await fetch(`/api/foods/search?${params.toString()}`, {
              credentials: 'include',
            });
            const body = (await res.json()) as { results?: FoodSearchResult[] };
            return body.results ?? [];
          }),
        );
        const merged: FoodSearchResult[] = [];
        const seen = new Set<string>();
        for (const set of resultSets) {
          for (const row of set) {
            if (!row.food?.id || seen.has(row.food.id)) continue;
            seen.add(row.food.id);
            merged.push(row);
          }
        }
        if (!cancelled) {
          setAddSuggestions(
            groupGroceryAddSuggestions({
              intentName: addIntent.name || addQuery,
              results: merged,
              correctionHint: addIntent.correction_hint,
            }),
          );
        }
      } catch {
        if (!cancelled) setAddSuggestions({ ingredients: [], products: [] });
      } finally {
        if (!cancelled) setSearchingAdd(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addQuery, addIntent.name, addIntent.correction_hint]);

  async function handleToggle(item: GroceryItem) {
    if (!listId || togglingId) return;
    const next = nextStatus(item.status);
    setTogglingId(item.id);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: next } : it)));
    try {
      const updated = await planService.updatePersistentGroceryItem(listId, item.id, { status: next });
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } catch {
      setItems((prev) => prev.map((it) => (it.id === item.id ? item : it)));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRemove(item: GroceryItem) {
    if (!listId || removingId) return;
    setRemovingId(item.id);
    try {
      await planService.deletePersistentGroceryItem(listId, item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setPurchasingChoices((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item.');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleClearListChoice(item: GroceryItem) {
    if (!listId) return;
    try {
      await planService.clearPersistentGroceryItemListChoice(listId, item.id);
      setPurchasingChoices((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      void loadHaulSummary();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to clear list choice.');
    }
  }

  async function handleResolveCandidate(candidate: ResolveCandidate) {
    if (!listId || !resolveItem || resolving) return;
    const foodId = candidate.food?.id;
    if (!foodId) {
      setResolveError('Selected food is missing an id.');
      return;
    }
    setResolving(true);
    setResolveError(null);
    try {
      const result = await planService.resolvePersistentGroceryItemForList(
        listId,
        resolveItem.id,
        {
          food_object_id: foodId,
          remember_for_future: false,
          save_to_source_plan: saveToSourcePlan,
        },
      );
      setPurchasingChoices((prev) => ({
        ...prev,
        [resolveItem.id]: result.choice,
      }));
      setResolveItem(null);
      void loadHaulSummary();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Failed to resolve for this list.');
    } finally {
      setResolving(false);
    }
  }

  async function createAddItem(options: {
    name: string;
    quantity: number | null;
    unit: string | null;
    raw_entry: string;
    food_object_id?: string | null;
    create_purchasing_choice?: boolean;
  }) {
    if (!listId || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const result = await planService.addPersistentGroceryItem(listId, {
        name: options.name,
        quantity: options.quantity,
        unit: options.unit,
        raw_entry: options.raw_entry,
        food_object_id: options.food_object_id ?? null,
        create_purchasing_choice: options.create_purchasing_choice === true,
      });
      setItems((prev) => [...prev, result.item]);
      if (result.choice) {
        setPurchasingChoices((prev) => ({
          ...prev,
          [result.item.id]: result.choice!,
        }));
      }
      setAddQuery('');
      setAddSuggestions({ ingredients: [], products: [] });
      void loadHaulSummary();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add item.');
    } finally {
      setAdding(false);
    }
  }

  async function handleAddUnresolved() {
    const intent = parseGroceryAddIntent(addQuery);
    if (!intent.raw_entry) return;
    await createAddItem({
      name: intent.name || intent.raw_entry,
      quantity: intent.quantity,
      unit: intent.unit,
      raw_entry: intent.raw_entry,
    });
  }

  async function handleAddSuggestion(suggestion: GroceryAddSuggestion) {
    const intent = parseGroceryAddIntent(addQuery);
    if (!intent.raw_entry) return;
    await createAddItem({
      name: intent.name || suggestion.label,
      quantity: intent.quantity,
      unit: intent.unit,
      raw_entry: intent.raw_entry,
      food_object_id: suggestion.food_object_id,
      create_purchasing_choice: suggestion.group === 'product',
    });
  }

  function applyListPriceObservation(observation: GroceryListPriceObservation | GroceryPriceObservation) {
    const listObs =
      'purchasing_choice_id' in observation
        ? (observation as GroceryListPriceObservation)
        : null;
    const itemId = observation.grocery_item_id;
    if (!itemId) return;
    if (listObs) {
      setListPrices((prev) => ({ ...prev, [itemId]: listObs }));
    } else {
      // Sourced confirm returns haul-shaped observation — keep row badge via line_total.
      setListPrices((prev) => ({
        ...prev,
        [itemId]: {
          id: observation.id,
          person_id: observation.person_id,
          grocery_list_id: observation.grocery_list_id ?? listId ?? '',
          grocery_item_id: itemId,
          match_key: observation.match_key,
          purchasing_choice_id: null,
          food_object_id: observation.food_object_id,
          source: observation.source,
          retailer: observation.retailer,
          postal_code: observation.postal_code,
          product_title: observation.product_title,
          brand_name: observation.brand_name,
          package_size: observation.package_size,
          package_unit: observation.package_unit,
          unit_price: observation.unit_price,
          currency: observation.currency,
          package_count: observation.package_count,
          line_total: observation.line_total,
          product_url: observation.product_url,
          image_url: observation.image_url,
          provider_result_id: observation.provider_result_id,
          search_event_id: observation.search_event_id,
          retrieved_at: observation.retrieved_at,
          match_confidence: observation.match_confidence,
          user_confirmed: observation.user_confirmed,
          supersedes_observation_id: observation.supersedes_observation_id,
          created_at: observation.created_at,
        },
      }));
    }
    setStaleListPrices((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    void loadHaulSummary();
  }

  async function handleSaveTitle() {
    if (!listId || !list || savingTitle) return;
    const title = titleDraft.trim();
    if (!title) return;
    setSavingTitle(true);
    setActionError(null);
    try {
      const updated = await planService.renameGroceryList(listId, title);
      setList(updated);
      setRenaming(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename list.');
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleArchiveToggle() {
    if (!listId || !list || archiving) return;
    // Restore (unarchive) does not need a confirmation dialog.
    if (list.archived_at) {
      setArchiving(true);
      setActionError(null);
      try {
        const updated = await planService.unarchiveGroceryList(listId);
        setList(updated);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to restore list.');
      } finally {
        setArchiving(false);
      }
      return;
    }
    openConfirm('archive');
  }

  async function confirmArchive() {
    if (!listId || !list || archiving) return;
    setArchiving(true);
    setConfirmError(null);
    setActionError(null);
    try {
      const updated = await planService.archiveGroceryList(listId);
      setList(updated);
      setConfirmAction(null);
      setDeleteBlockedByItems(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive list.';
      // Prefer in-modal error when the dialog is open.
      if (confirmAction) setConfirmError(message);
      else setActionError(message);
    } finally {
      setArchiving(false);
    }
  }

  async function confirmDelete() {
    if (!listId || !list || deleting) return;
    setDeleting(true);
    setConfirmError(null);
    try {
      await planService.deletePersistentGroceryList(listId);
      setConfirmAction(null);
      setDeleteBlockedByItems(false);
      void router.push('/app/food/groceries');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete list.';
      const mapped = groceryListDeleteRejection(message);
      // Keep the modal open and show the rejection where the user is looking.
      // When the server says the list is non-empty (stale client count), switch
      // the primary action to Archive instead of offering another doomed delete.
      setConfirmError(mapped.userMessage);
      if (mapped.suggestArchive) setDeleteBlockedByItems(true);
    } finally {
      setDeleting(false);
    }
  }

  function openConfirm(action: 'archive' | 'delete') {
    setConfirmError(null);
    setDeleteBlockedByItems(false);
    setConfirmAction(action);
  }

  async function openPullFromPlan() {
    setShowPullFromPlan(true);
    setPullMessage(null);
    setPullError(null);
    if (plans) return;
    setPlansLoading(true);
    setPlansError(null);
    try {
      const list = await planService.list();
      setPlans(list);
      setPlanSelectionMode('auto');
      const resolved = resolvePullFromPlanSelection({
        plans: list,
        rangeStart: pullDateStart,
        rangeEnd: pullDateEnd < pullDateStart ? pullDateStart : pullDateEnd,
        currentPlanId: null,
        selectionMode: 'auto',
      });
      setSelectedPlanId(resolved.selectedPlanId ?? '');
      setPullCoveragePartial(resolved.partialCoverage);
    } catch (err) {
      setPlansError(err instanceof Error ? err.message : 'Failed to load your plans.');
    } finally {
      setPlansLoading(false);
    }
  }

  async function handlePullFromPlan() {
    if (!listId || !selectedPlanId || pulling) return;
    setPulling(true);
    setPullError(null);
    setPullMessage(null);
    try {
      const result = await planService.reconcilePlanGroceryList({
        plan_id: selectedPlanId,
        date: pullDateStart,
        date_end: pullDateEnd,
        target_list_id: listId,
      });
      setItems(result.items);
      const planTitle = plans?.find((p) => p.id === selectedPlanId)?.title ?? 'that plan';
      const rangeLabel =
        pullDateEnd !== pullDateStart ? `${pullDateStart} – ${pullDateEnd}` : pullDateStart;
      if (result.batch_item_ids.length === 0) {
        setPullMessage(groceryPullEmptyMessage(result.empty_reason));
      } else {
        setPullMessage(`Added ${planTitle}'s pending needs for ${rangeLabel}.`);
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Failed to pull needs from that plan.');
    } finally {
      setPulling(false);
    }
  }

  if (!listId) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/50 antialiased">No list ID.</p>
        </div>
        <JournalFooterNav />
      </div>
    );
  }

  const checkedCount = items.filter((it) => it.status !== 'pending').length;

  return (
    <div className="min-h-screen bg-brand-900 text-white flex flex-col">
      <div className="flex-1 overflow-y-auto pb-28">
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
          <div>
            <Link
              href="/app/food/groceries"
              className="text-[11px] text-white/40 hover:text-white/70 antialiased transition-colors"
            >
              ← Grocery lists
            </Link>
            {loading ? (
              <div className="mt-2 h-7 w-40 animate-pulse rounded-lg bg-white/[0.06]" />
            ) : list ? (
              <div className="mt-1 flex items-start justify-between gap-3">
                {renaming ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-2 py-1 text-lg font-semibold text-white antialiased focus:outline-none focus:border-denim-400"
                    />
                    <button
                      type="button"
                      disabled={savingTitle}
                      onClick={() => void handleSaveTitle()}
                      className="text-xs text-denim-300 hover:text-denim-200 antialiased"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <h1 className="text-lg font-semibold text-white antialiased">
                    {list.title?.trim() || 'Grocery list'}
                    {list.is_default && (
                      <span className="ml-2 align-middle rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200/85 antialiased">
                        Default
                      </span>
                    )}
                  </h1>
                )}
                {!list.is_default && !renaming && (
                  <div className="flex items-center gap-3 mt-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setRenaming(true)}
                      className="text-[11px] text-white/45 hover:text-white/70 antialiased"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={archiving || deleting}
                      onClick={() => void handleArchiveToggle()}
                      className="text-[11px] text-white/45 hover:text-white/70 antialiased disabled:opacity-50"
                    >
                      {list.archived_at ? 'Restore' : 'Archive'}
                    </button>
                    {!list.plan_id && (
                      <button
                        type="button"
                        disabled={archiving || deleting}
                        onClick={() => openConfirm('delete')}
                        className="text-[11px] text-red-300/70 hover:text-red-200 antialiased disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {actionError && <p className="mt-1 text-[11px] text-red-300 antialiased">{actionError}</p>}
          </div>

          {error ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-sm text-red-200 antialiased">{error}</p>
            </div>
          ) : loading ? (
            <div className="rounded-2xl bg-white/[0.04] p-5">
              <p className="text-sm text-white/50 antialiased">Loading…</p>
            </div>
          ) : (
            <>
              {listResolveQaEnabled && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-400/20 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/80 antialiased">
                    QA — list resolve cases
                  </p>
                  <ul className="space-y-1.5">
                    {LIST_RESOLVE_QA_CASES.map((qaCase) => (
                      <li key={qaCase.id} className="text-[11px] text-white/50 antialiased">
                        <span className="text-white/75">{qaCase.title}</span>
                        {' — '}
                        {qaCase.expected}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {listPriceAddQaEnabled && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-400/20 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/80 antialiased">
                    QA — list price + search-first add
                  </p>
                  <ul className="space-y-1.5">
                    {LIST_PRICE_ADD_QA_CASES.map((qaCase) => (
                      <li key={qaCase.id} className="text-[11px] text-white/50 antialiased">
                        <span className="text-white/75">{qaCase.title}</span>
                        {' — '}
                        {qaCase.expected}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {listRetailerScenarioQaEnabled && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-400/20 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-200/80 antialiased">
                    QA — retailer scenario (PR3.2b)
                  </p>
                  <ul className="space-y-1.5">
                    {LIST_RETAILER_SCENARIO_QA_CASES.map((qaCase) => (
                      <li key={qaCase.id} className="text-[11px] text-white/50 antialiased">
                        <span className="text-white/75">{qaCase.title}</span>
                        {' — '}
                        {qaCase.expected}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {items.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-white/40 antialiased">
                      {checkedCount} of {items.length} item{items.length === 1 ? '' : 's'}
                    </p>
                    <label className="flex items-center gap-1.5 text-[10px] text-white/40 antialiased">
                      <span className="sr-only">Sort</span>
                      <select
                        value={sortMode}
                        onChange={(e) => {
                          const next = e.target.value as GroceryListSortMode;
                          setSortMode(next);
                          if (listId) saveGroceryListSortMode(listId, next);
                        }}
                        className="rounded-lg bg-brand-800 border border-white/10 px-2 py-1 text-[10px] text-white/70 antialiased focus:outline-none focus:border-denim-400"
                      >
                        {GROCERY_LIST_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-denim-400/70 transition-all"
                      style={{ width: `${Math.round((checkedCount / Math.max(items.length, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <GroceryHaulSummaryCard
                summary={displayHaulSummary}
                fullHaul={displayFullHaul}
                loading={haulLoading}
                error={haulError}
                defaultSegmentsOpen={fullHaulQaEnabled}
                qaBadge={fullHaulQaEnabled || Boolean(scenarioRetailerKey)}
                onRefresh={() => void loadHaulSummary()}
                onPriceRemainingItems={() => {
                  document.getElementById('persistent-grocery-item-list')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
              />

              {(retailerOptions.length > 0 || listPriceAddQaEnabled) && (
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
                      Retailer scenario
                    </p>
                    {scenarioRetailerKey ? (
                      <span className="text-[10px] text-amber-200/80 antialiased">
                        Preview only — not applied
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/35 antialiased">
                        Current list estimate
                      </span>
                    )}
                  </div>
                  <select
                    value={scenarioRetailerKey ?? ''}
                    onChange={(e) => {
                      const next = e.target.value.trim();
                      setScenarioRetailerKey(next || null);
                      setScenarioError(null);
                    }}
                    className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                  >
                    <option value="">Current list estimate / Mixed retailers</option>
                    {retailerOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.display} ({option.quote_count} quote
                        {option.quote_count === 1 ? '' : 's'})
                      </option>
                    ))}
                  </select>
                  {scenarioPreview && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] text-white/50 antialiased">
                        {scenarioPreview.matched_count} matched · {scenarioPreview.missing_count}{' '}
                        missing · {scenarioPreview.stale_count} stale
                        {scenarioPreviewHaul
                          ? ` · Preview ${formatGroceryCurrency(
                              scenarioPreviewHaul.estimated_merchandise_subtotal,
                              scenarioPreviewHaul.currency,
                            )}`
                          : ''}
                      </p>
                      <ul className="max-h-40 overflow-y-auto divide-y divide-white/[0.04] rounded-xl border border-white/10">
                        {scenarioPreview.rows.map((row) => {
                          const item = items.find((it) => it.id === row.item_id);
                          if (!item) return null;
                          return (
                            <li
                              key={row.item_id}
                              className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-[12px] text-white/80 antialiased truncate">
                                  {resolveListShoppingDisplayName({
                                    item,
                                    choice: purchasingChoices[item.id] ?? null,
                                  })}
                                </p>
                                <p className="text-[10px] text-white/40 antialiased">
                                  {row.state === 'matched' && row.quote
                                    ? `${formatGroceryCurrency(row.quote.line_total, row.quote.currency)}${
                                        row.retailer_display ? ` · ${row.retailer_display}` : ''
                                      }`
                                    : row.state === 'stale'
                                      ? 'Stale for this retailer / package'
                                      : 'No quote for this retailer'}
                                </p>
                              </div>
                              {row.state === 'missing' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (scenarioPreview.retailer_display) {
                                      const prefs = loadGroceryPriceSearchPrefs();
                                      saveGroceryPriceSearchPrefs({
                                        retailer: scenarioPreview.retailer_display,
                                        postal_code: prefs.postal_code,
                                      });
                                    }
                                    setPriceItem(item);
                                    setPriceEntryMode('search');
                                  }}
                                  className="flex-shrink-0 text-[10px] text-denim-300 hover:text-denim-200 antialiased"
                                >
                                  Find price
                                </button>
                              ) : (
                                <span
                                  className={`flex-shrink-0 text-[10px] antialiased ${
                                    row.state === 'matched'
                                      ? 'text-emerald-300/80'
                                      : 'text-amber-200/80'
                                  }`}
                                >
                                  {row.state}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        disabled={
                          applyingScenario ||
                          Object.keys(scenarioPreview.matched_observation_ids_by_item_id)
                            .length === 0
                        }
                        onClick={() => {
                          if (!listId || !scenarioPreview) return;
                          setApplyingScenario(true);
                          setScenarioError(null);
                          void planService
                            .applyPersistentGroceryRetailerScenario(
                              listId,
                              scenarioPreview.matched_observation_ids_by_item_id,
                            )
                            .then(async (result) => {
                              if (result.failed.length > 0) {
                                setScenarioError(
                                  `Applied ${result.applied.length}; ${result.failed.length} failed — retry Apply.`,
                                );
                              } else {
                                setScenarioRetailerKey(null);
                              }
                              await loadHaulSummary();
                            })
                            .catch((err) => {
                              setScenarioError(
                                err instanceof Error
                                  ? err.message
                                  : 'Failed to apply retailer scenario.',
                              );
                            })
                            .finally(() => setApplyingScenario(false));
                        }}
                        className="w-full rounded-xl bg-emerald-500/20 border border-emerald-400/25 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 antialiased"
                      >
                        {applyingScenario
                          ? 'Applying…'
                          : 'Use these prices for this list'}
                      </button>
                      {scenarioError && (
                        <p className="text-[11px] text-red-300 antialiased">{scenarioError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl bg-white/[0.04] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
                    Pull needs from a Plan
                  </p>
                  <button
                    type="button"
                    onClick={() => (showPullFromPlan ? setShowPullFromPlan(false) : void openPullFromPlan())}
                    className="text-[11px] text-denim-300 hover:text-denim-200 antialiased"
                  >
                    {showPullFromPlan ? 'Close' : 'Choose a plan'}
                  </button>
                </div>
                {showPullFromPlan && (
                  <div className="space-y-2 pt-1">
                    {plansError ? (
                      <p className="text-[11px] text-red-300 antialiased">{plansError}</p>
                    ) : plansLoading || !plans ? (
                      <p className="text-[11px] text-white/40 antialiased">Loading your plans…</p>
                    ) : plans.length === 0 ? (
                      <p className="text-[11px] text-white/40 antialiased">No plans yet.</p>
                    ) : (
                      <>
                        <select
                          value={selectedPlanId}
                          onChange={(e) => {
                            setSelectedPlanId(e.target.value);
                            setPlanSelectionMode('manual');
                          }}
                          className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                        >
                          {plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {formatPullFromPlanOptionLabel(plan)}
                            </option>
                          ))}
                        </select>
                        {!selectedPlanId && (
                          <p className="text-[11px] text-amber-200/90 antialiased">
                            No plan overlaps this date range.
                          </p>
                        )}
                        {selectedPlanId && pullCoveragePartial && (
                          <p className="text-[11px] text-amber-200/90 antialiased">
                            Selected plan only partially covers this date range.
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={pullDateStart}
                            onChange={(e) => setPullDateStart(e.target.value)}
                            className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                          />
                          <span className="text-white/30 text-xs">to</span>
                          <input
                            type="date"
                            value={pullDateEnd}
                            onChange={(e) => setPullDateEnd(e.target.value)}
                            className="flex-1 rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={pulling || !selectedPlanId}
                          onClick={() => void handlePullFromPlan()}
                          className="w-full rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 antialiased"
                        >
                          {pulling ? 'Adding…' : 'Add pending needs to this list'}
                        </button>
                        {pullError && <p className="text-[11px] text-red-300 antialiased">{pullError}</p>}
                        {pullMessage && (
                          <p
                            className={`text-[11px] antialiased ${
                              pullMessage.startsWith('Added ')
                                ? 'text-emerald-300'
                                : 'text-amber-200/90'
                            }`}
                          >
                            {pullMessage}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white/[0.04] p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
                  Add an item
                </p>
                <input
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder="Search or type an item (e.g. 2 cups oats)"
                  className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
                />
                {addIntent.parsed_from_phrase && (
                  <p className="text-[10px] text-white/40 antialiased">
                    Parsed: {addIntent.quantity != null ? `${addIntent.quantity} ` : ''}
                    {addIntent.unit ? `${addIntent.unit} ` : ''}
                    {addIntent.name}
                  </p>
                )}
                {addIntent.correction_hint && (
                  <p className="text-[11px] text-amber-200/90 antialiased">
                    Did you mean “{addIntent.correction_hint}”? Showing those matches too — your typed
                    phrase stays unchanged until you pick a result or Add unresolved.
                  </p>
                )}
                {searchingAdd ? (
                  <p className="text-[11px] text-white/40 antialiased">Searching…</p>
                ) : (
                  <div className="space-y-2">
                    {addSuggestions.ingredients.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 antialiased mb-1">
                          What it is (ingredient)
                        </p>
                        <ul className="rounded-xl border border-white/10 divide-y divide-white/[0.04] overflow-hidden">
                          {addSuggestions.ingredients.map((suggestion) => (
                            <li key={suggestion.food_object_id}>
                              <button
                                type="button"
                                disabled={adding}
                                onClick={() => void handleAddSuggestion(suggestion)}
                                className="w-full text-left px-3 py-2 hover:bg-white/[0.04] disabled:opacity-50"
                              >
                                <p className="text-sm text-white antialiased">
                                  {suggestion.did_you_mean ? 'Did you mean: ' : ''}
                                  {suggestion.label}
                                </p>
                                {suggestion.source_label && (
                                  <p className="text-[10px] text-white/35 antialiased">
                                    {suggestion.source_label}
                                  </p>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {addSuggestions.products.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 antialiased mb-1">
                          What to buy (product)
                        </p>
                        <ul className="rounded-xl border border-white/10 divide-y divide-white/[0.04] overflow-hidden">
                          {addSuggestions.products.map((suggestion) => (
                            <li key={suggestion.food_object_id}>
                              <button
                                type="button"
                                disabled={adding}
                                onClick={() => void handleAddSuggestion(suggestion)}
                                className="w-full text-left px-3 py-2 hover:bg-white/[0.04] disabled:opacity-50"
                              >
                                <p className="text-sm text-white antialiased">
                                  {suggestion.did_you_mean ? 'Did you mean: ' : ''}
                                  {suggestion.label}
                                </p>
                                {suggestion.source_label && (
                                  <p className="text-[10px] text-white/35 antialiased">
                                    {suggestion.source_label}
                                  </p>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={adding || !addQuery.trim()}
                  onClick={() => void handleAddUnresolved()}
                  className="w-full rounded-xl bg-denim-500/20 border border-denim-400/25 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/25 disabled:opacity-50 antialiased"
                >
                  {adding ? 'Adding…' : 'Add unresolved'}
                </button>
                {addError && <p className="text-[11px] text-red-300 antialiased">{addError}</p>}
              </div>

              {items.length === 0 ? (
                <div className="rounded-2xl bg-white/[0.04] p-5">
                  <p className="text-sm text-white/60 antialiased">
                    No items yet. Add one above, or add this list's needs from a Plan's shopping
                    list.
                  </p>
                </div>
              ) : (
                <div
                  id="persistent-grocery-item-list"
                  className="rounded-2xl bg-white/[0.04] overflow-hidden divide-y divide-white/[0.04]"
                >
                  {sortedItems.map((item) => (
                    <div
                      key={item.id}
                      className="w-full text-left flex items-start gap-3 py-3 px-3 hover:bg-white/[0.04] transition-colors group"
                    >
                      <button
                        type="button"
                        disabled={togglingId === item.id}
                        onClick={() => void handleToggle(item)}
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
                            {resolveListShoppingDisplayName({
                              item,
                              choice: purchasingChoices[item.id] ?? null,
                            })}
                          </p>
                          {purchasingChoices[item.id] ? (
                            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-emerald-500/15 text-emerald-200/90 antialiased border border-emerald-400/20">
                              list choice
                            </span>
                          ) : null}
                          {item.source_type === 'planned_meal' && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[9px] bg-denim-500/15 text-denim-200/90 antialiased border border-denim-400/20">
                              from a plan
                            </span>
                          )}
                        </div>
                        {purchasingChoices[item.id] &&
                          purchasingChoices[item.id]?.shopping_display_name !== item.name && (
                            <p className="text-[10px] text-white/35 antialiased mt-0.5">
                              Required: {item.name}
                            </p>
                          )}
                        <p className={`text-[11px] antialiased mt-1 ${item.status === 'pending' ? 'text-white/60' : 'text-white/25'}`}>
                          {requiredLabel(item)}
                        </p>
                        {item.notes && (
                          <p className="text-[10px] text-white/30 antialiased mt-0.5">{item.notes}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              setResolveItem(item);
                              setResolveQuery(item.name);
                              setResolveResults([]);
                              setResolveError(null);
                              setSaveToSourcePlan(false);
                            }}
                            className="text-[10px] text-denim-300 hover:text-denim-200 antialiased"
                          >
                            {purchasingChoices[item.id] ? 'Change list choice' : 'Resolve for this list'}
                          </button>
                          {purchasingChoices[item.id] ? (
                            <button
                              type="button"
                              onClick={() => void handleClearListChoice(item)}
                              className="text-[10px] text-white/35 hover:text-white/55 antialiased"
                            >
                              Clear list choice
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setPriceItem(item);
                              setPriceEntryMode('search');
                            }}
                            className="text-[10px] text-emerald-300/90 hover:text-emerald-200 antialiased"
                          >
                            {listPrices[item.id] ? 'Update price' : 'Find price'}
                          </button>
                          {item.source_type === 'planned_meal' && item.source_id ? (
                            <Link
                              href={`${APP_ROUTE_BUILDERS.planGrocery(item.source_id)}`}
                              className="text-[10px] text-white/30 hover:text-denim-200 antialiased"
                            >
                              Open source Plan →
                            </Link>
                          ) : null}
                        </div>
                        {listPrices[item.id] ? (
                          <div className="mt-1 space-y-1">
                            <p className="text-[10px] text-emerald-200/80 antialiased">
                              Est.{' '}
                              {formatGroceryCurrency(
                                listPrices[item.id]!.line_total,
                                listPrices[item.id]!.currency,
                              )}
                              {listPrices[item.id]!.retailer
                                ? ` · ${listPrices[item.id]!.retailer}`
                                : ''}
                            </p>
                            {(quotePools[item.id]?.length ?? 0) > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedQuoteItemId((current) =>
                                    current === item.id ? null : item.id,
                                  )
                                }
                                className="text-[10px] text-white/40 hover:text-white/60 antialiased"
                              >
                                {expandedQuoteItemId === item.id
                                  ? 'Hide saved quotes'
                                  : `Saved quotes (${quotePools[item.id]!.length})`}
                              </button>
                            ) : null}
                            {expandedQuoteItemId === item.id &&
                              (quotePools[item.id] ?? []).map((quote) => {
                                const isActive =
                                  (activeQuoteIds[item.id] ?? listPrices[item.id]?.id) ===
                                  quote.id;
                                return (
                                  <button
                                    key={quote.id}
                                    type="button"
                                    disabled={settingActiveQuoteId === quote.id || isActive}
                                    onClick={() => {
                                      if (!listId) return;
                                      setSettingActiveQuoteId(quote.id);
                                      void planService
                                        .setPersistentGroceryActiveQuote(
                                          listId,
                                          item.id,
                                          quote.id,
                                        )
                                        .then(() => {
                                          setListPrices((prev) => ({
                                            ...prev,
                                            [item.id]: quote,
                                          }));
                                          setActiveQuoteIds((prev) => ({
                                            ...prev,
                                            [item.id]: quote.id,
                                          }));
                                          void loadHaulSummary();
                                        })
                                        .catch((err) => {
                                          setActionError(
                                            err instanceof Error
                                              ? err.message
                                              : 'Failed to set active quote.',
                                          );
                                        })
                                        .finally(() => setSettingActiveQuoteId(null));
                                    }}
                                    className={`block w-full text-left rounded-lg px-2 py-1.5 text-[10px] antialiased border ${
                                      isActive
                                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                                        : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white/80'
                                    } disabled:opacity-60`}
                                  >
                                    {formatGroceryCurrency(quote.line_total, quote.currency)}
                                    {quote.retailer ? ` · ${quote.retailer}` : ' · No retailer'}
                                    {isActive ? ' · active' : ''}
                                  </button>
                                );
                              })}
                          </div>
                        ) : staleListPrices[item.id] ? (
                          <p className="text-[10px] text-amber-200/70 antialiased mt-1">
                            Prior price stale for current choice — re-estimate
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={removingId === item.id}
                        onClick={() => void handleRemove(item)}
                        className="flex-shrink-0 text-[10px] text-white/30 hover:text-red-300 antialiased disabled:opacity-50 mt-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-white/25 antialiased px-1">
                Manual items are yours to edit freely. Items sourced from a Plan refresh
                automatically when you re-add that Plan's needs to this list; removing one here
                only removes it from this list — it does not change the Plan.
              </p>
            </>
          )}
        </div>
      </div>

      {resolveItem && (
        <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
          <div className="w-full max-w-md rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
                  Resolve for this list
                </p>
                <h2 className="text-base font-semibold text-white antialiased mt-1">
                  {resolveItem.name}
                </h2>
                <p className="text-[12px] text-white/45 antialiased mt-2">
                  Writes a list purchasing choice only by default. Required ingredient identity on
                  the row stays unchanged.
                </p>
              </div>
              <input
                value={resolveQuery}
                onChange={(e) => setResolveQuery(e.target.value)}
                placeholder="Search foods…"
                className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 antialiased focus:outline-none focus:border-denim-400"
              />
              {resolveItem.source_type === 'planned_meal' && resolveItem.source_id ? (
                <label className="flex items-start gap-2 text-[11px] text-white/55 antialiased">
                  <input
                    type="checkbox"
                    checked={saveToSourcePlan}
                    onChange={(e) => setSaveToSourcePlan(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Save to source plan (only if you own that plan)</span>
                </label>
              ) : null}
              {searchingResolve ? (
                <p className="text-[11px] text-white/40 antialiased">Searching…</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto divide-y divide-white/[0.04] rounded-xl border border-white/10">
                  {resolveResults.map((candidate) => (
                    <li key={candidate.food.id}>
                      <button
                        type="button"
                        disabled={resolving}
                        onClick={() => void handleResolveCandidate(candidate)}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.04] disabled:opacity-50"
                      >
                        <p className="text-sm text-white antialiased">
                          {candidate.food.brandName
                            ? `${candidate.food.brandName} — ${candidate.food.canonicalName}`
                            : candidate.food.canonicalName}
                        </p>
                        <p className="text-[10px] text-white/35 antialiased">
                          {candidate.source_label ?? candidate.source}
                        </p>
                      </button>
                    </li>
                  ))}
                  {resolveQuery.trim().length >= 2 && resolveResults.length === 0 && (
                    <li className="px-3 py-2 text-[11px] text-white/40 antialiased">
                      No foods found.
                    </li>
                  )}
                </ul>
              )}
              {resolveError && (
                <p className="text-[12px] text-red-200 antialiased" role="alert">
                  {resolveError}
                </p>
              )}
              <button
                type="button"
                onClick={() => setResolveItem(null)}
                className="w-full rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:text-white antialiased"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {priceItem && listId && (
        <GroceryPricePanel
          item={{
            ...priceItem,
            name: resolveListShoppingDisplayName({
              item: priceItem,
              choice: purchasingChoices[priceItem.id] ?? null,
            }),
          }}
          currentObservation={
            listPrices[priceItem.id]
              ? listPriceToHaulObservation(listPrices[priceItem.id])
              : null
          }
          entryMode={priceEntryMode}
          busy={priceBusy}
          onClose={() => setPriceItem(null)}
          onSearch={async (input) => {
            setPriceBusy(true);
            try {
              return await planService.searchPersistentGroceryItemPrices(
                listId,
                priceItem.id,
                input,
              );
            } finally {
              setPriceBusy(false);
            }
          }}
          onConfirmOffer={async (input) => {
            setPriceBusy(true);
            try {
              return await planService.confirmPersistentGroceryItemPrice(
                listId,
                priceItem.id,
                input,
              );
            } finally {
              setPriceBusy(false);
            }
          }}
          onSaveManual={async (input) => {
            setPriceBusy(true);
            try {
              const observation = await planService.savePersistentGroceryItemManualPrice(
                listId,
                priceItem.id,
                {
                  unit_price: input.unit_price,
                  package_count: input.package_count,
                  currency: input.currency,
                  product_title: input.product_title,
                  retailer: input.retailer,
                },
              );
              return listPriceToHaulObservation(observation);
            } finally {
              setPriceBusy(false);
            }
          }}
          onObservationSaved={(observation) => {
            applyListPriceObservation(observation);
            setPriceItem(null);
          }}
        />
      )}

      {confirmAction && list && (
        <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
          <div className="w-full max-w-md rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 antialiased">
                  {confirmAction === 'archive' ? 'Archive list' : 'Delete list'}
                </p>
                <h2 className="text-base font-semibold text-white antialiased mt-1">
                  {confirmAction === 'archive'
                    ? `Archive “${list.title?.trim() || 'this list'}”?`
                    : `Delete “${list.title?.trim() || 'this list'}”?`}
                </h2>
                <p className="text-[12px] text-white/45 antialiased mt-2">
                  {confirmAction === 'archive'
                    ? 'This list will be hidden from your active lists. Items are kept, and you can restore it anytime from Archived lists.'
                    : deleteBlockedByItems || items.length > 0
                      ? 'This list still has items. Remove all items first, or archive instead. Delete only works on empty lists.'
                      : 'This permanently removes the empty list. This cannot be undone.'}
                </p>
                {confirmError && (
                  <p className="mt-2 text-[12px] text-red-200 antialiased" role="alert">
                    {confirmError}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={archiving || deleting}
                  onClick={() => {
                    setConfirmAction(null);
                    setConfirmError(null);
                    setDeleteBlockedByItems(false);
                  }}
                  className="rounded-xl px-3 py-2 text-sm text-white/60 hover:text-white/85 antialiased disabled:opacity-50"
                >
                  Cancel
                </button>
                {confirmAction === 'archive' ? (
                  <button
                    type="button"
                    disabled={archiving}
                    onClick={() => void confirmArchive()}
                    className="rounded-xl bg-white/[0.08] border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/[0.12] disabled:opacity-50 antialiased"
                  >
                    {archiving ? 'Archiving…' : 'Archive list'}
                  </button>
                ) : deleteBlockedByItems || items.length > 0 ? (
                  <button
                    type="button"
                    disabled={archiving}
                    onClick={() => {
                      setConfirmError(null);
                      setDeleteBlockedByItems(false);
                      setConfirmAction('archive');
                    }}
                    className="rounded-xl bg-white/[0.08] border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/[0.12] disabled:opacity-50 antialiased"
                  >
                    Archive instead
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                    className="rounded-xl bg-red-500/15 border border-red-400/25 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-50 antialiased"
                  >
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <JournalFooterNav />
    </div>
  );
}
