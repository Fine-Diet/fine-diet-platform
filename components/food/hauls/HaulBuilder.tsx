'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { AppDialog } from '@/components/ui/AppDialog';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type {
  GeneratedGroceryList,
  GroceryHaulDetail,
  GroceryHaulExecutionReadiness,
  GroceryHaulExecutionItemState,
  GroceryHaulItem,
} from '@/lib/plans/types';
import { HaulExecutionReadinessDialog } from './HaulExecutionReadinessDialog';
import { HaulItemEditor } from './HaulItemEditor';
import {
  computeGroceryHaulPreparationEstimate,
  countDistinctAssignedStores,
} from '@/lib/plans/groceryHaul/estimate';
import {
  formatHaulCurrency,
  formatHaulDate,
  groceryListTitle,
  haulStatusLabel,
  itemStoreLabel,
  sourceDemandLabel,
} from './presentation';

type LoadState = 'loading' | 'ready' | 'error';

interface MetadataDraft {
  title: string;
  shoppingDate: string;
  budgetAmount: string;
  currency: string;
}

function metadataFromDetail(detail: GroceryHaulDetail): MetadataDraft {
  return {
    title: detail.haul.title ?? `Haul · ${formatHaulDate(detail.haul.shopping_date)}`,
    shoppingDate: detail.haul.shopping_date,
    budgetAmount: detail.haul.budget_amount == null ? '' : String(detail.haul.budget_amount),
    currency: detail.haul.currency,
  };
}

function HistoricalHaul({ detail }: { detail: GroceryHaulDetail }) {
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <Link href={APP_ROUTES.foodHauls} className="text-xs font-semibold text-white/45 hover:text-white/75">
        ← Hauls
      </Link>
      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-light text-brand-50">
            {detail.haul.title || `Haul · ${formatHaulDate(detail.haul.shopping_date)}`}
          </h1>
          <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {haulStatusLabel(detail.haul.status)}
          </span>
        </div>
        <p className="mt-2 text-sm text-white/50">
          {formatHaulDate(detail.haul.shopping_date)} · Read-only Haul history
        </p>
      </header>
      <div className="mt-8 divide-y divide-white/10 border-y border-white/15">
        {detail.items.map((item) => (
          <div key={item.id} className="py-5">
            <p className="text-base font-semibold text-brand-50">{item.name_snapshot}</p>
            <p className="mt-1 text-xs text-white/45">{sourceDemandLabel(item)}</p>
            {item.product_title && <p className="mt-2 text-sm text-white/70">{item.product_title}</p>}
            {itemStoreLabel(item) && <p className="mt-1 text-xs text-white/45">{itemStoreLabel(item)}</p>}
            <p className="mt-2 text-sm text-white/65">Final quantity: {item.final_quantity}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HaulBuilder({ haulId }: { haulId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<GroceryHaulDetail | null>(null);
  const [lists, setLists] = useState<GeneratedGroceryList[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<GroceryHaulExecutionReadiness | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<MetadataDraft | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [retryAutosave, setRetryAutosave] = useState(0);
  const lastSavedMetadata = useRef('');
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const sourceHeaders = useRef(new Map<string, HTMLButtonElement>());
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<GroceryHaulItem | null>(null);
  const [chooseProductFirst, setChooseProductFirst] = useState(false);
  const [addListsOpen, setAddListsOpen] = useState(false);
  const [addListQuery, setAddListQuery] = useState('');
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [addingLists, setAddingLists] = useState(false);
  const [addListsError, setAddListsError] = useState<string | null>(null);
  const [executionStateByItemId, setExecutionStateByItemId] = useState(
    () => new Map<string, GroceryHaulExecutionItemState>(),
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextDetail, overview] = await Promise.all([
        planService.getGroceryHaul(haulId),
        planService.getGroceryListsOverview(),
      ]);
      setDetail(nextDetail);
      const nextMetadata = metadataFromDetail(nextDetail);
      setMetadata(nextMetadata);
      lastSavedMetadata.current = JSON.stringify(nextMetadata);
      setLists([overview.default_list, ...overview.named_lists].filter(
        (list): list is GeneratedGroceryList =>
          Boolean(list && list.status === 'active' && !list.archived_at),
      ));
      setOpenSourceId((current) =>
        current && nextDetail.source_lists.some((source) => source.grocery_list_id === current)
          ? current
          : nextDetail.source_lists[0]?.grocery_list_id ?? null,
      );
      if (nextDetail.haul.status === 'active') {
        const execution = await planService.getGroceryHaulExecution(haulId);
        setExecutionStateByItemId(new Map(
          execution.items.map((item) => [item.haul_item_id, item.state]),
        ));
      } else {
        setExecutionStateByItemId(new Map());
      }
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this Haul.');
      setLoadState('error');
    }
  }, [haulId]);

  const reloadDetail = useCallback(async () => {
    const nextDetail = await planService.getGroceryHaul(haulId);
    setDetail(nextDetail);
  }, [haulId]);

  useEffect(() => {
    setLoadState('loading');
    void load();
  }, [load]);

  const prepareView = router.isReady && router.query.prepare === '1';
  const metadataReadOnly = detail?.haul.status !== 'planned';
  const activePrepareView = detail?.haul.status === 'active' && prepareView;

  function itemPreparationLocked(itemId: string): boolean {
    if (detail?.haul.status === 'planned') return false;
    if (activePrepareView) {
      return executionStateByItemId.get(itemId) !== 'pending';
    }
    return true;
  }

  useEffect(() => {
    if (!router.isReady) return;
    if (detail?.haul.status !== 'active') return;
    if (router.query.prepare === '1') return;
    void router.replace(APP_ROUTE_BUILDERS.foodHaulShop(haulId));
  }, [detail, haulId, router, router.isReady, router.query.prepare]);

  useEffect(() => {
    if (!detail || detail.haul.status !== 'planned' || !metadata) return;
    const serialized = JSON.stringify(metadata);
    if (serialized === lastSavedMetadata.current) return;
    const budget = metadata.budgetAmount.trim() === '' ? null : Number(metadata.budgetAmount);
    if (
      !metadata.title.trim()
      || !metadata.shoppingDate
      || !/^[A-Z]{3}$/.test(metadata.currency)
      || (budget != null && (!Number.isFinite(budget) || budget < 0))
    ) {
      setAutosaveError('Enter a title, valid date, three-letter currency, and nonnegative budget.');
      return;
    }
    const timer = window.setTimeout(async () => {
      setAutosaveError(null);
      try {
        const updated = await planService.updateGroceryHaul(haulId, {
          title: metadata.title.trim(),
          shopping_date: metadata.shoppingDate,
          budget_amount: budget,
          currency: metadata.currency,
        });
        lastSavedMetadata.current = serialized;
        setDetail((current) => current ? { ...current, haul: updated } : current);
      } catch (err) {
        setAutosaveError(err instanceof Error ? err.message : 'Changes could not be saved.');
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [detail, haulId, metadata, retryAutosave]);

  const itemsBySource = useMemo(() => {
    const grouped = new Map<string, GroceryHaulItem[]>();
    for (const item of detail?.items ?? []) {
      const bucket = grouped.get(item.source_grocery_list_id) ?? [];
      bucket.push(item);
      grouped.set(item.source_grocery_list_id, bucket);
    }
    return grouped;
  }, [detail?.items]);

  const distinctStoreCount = useMemo(
    () => countDistinctAssignedStores(detail?.items ?? []),
    [detail?.items],
  );

  const memberIds = new Set(detail?.source_lists.map((source) => source.grocery_list_id) ?? []);
  const availableLists = lists.filter((list) => !memberIds.has(list.id));
  const visibleAddLists = availableLists.filter((list) =>
    groceryListTitle(list).toLocaleLowerCase().includes(addListQuery.trim().toLocaleLowerCase()),
  );

  function switchSource(sourceId: string) {
    const next = openSourceId === sourceId ? null : sourceId;
    setOpenSourceId(next);
    if (!next) return;
    window.requestAnimationFrame(() => {
      const header = sourceHeaders.current.get(next);
      if (!header) return;
      const rect = header.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  async function changeQuantity(item: GroceryHaulItem, delta: number) {
    if (itemPreparationLocked(item.id) || itemBusy) return;
    const nextQuantity = Math.max(0, item.final_quantity + delta);
    if (nextQuantity === item.final_quantity) return;
    setItemBusy(item.id);
    setError(null);
    setDetail((current) => current ? {
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, final_quantity: nextQuantity } : candidate,
      ),
    } : current);
    try {
      // Deliberately patch final_quantity only. quantity_snapshot is immutable provenance.
      await planService.updateGroceryHaulItem(haulId, item.id, {
        final_quantity: nextQuantity,
      });
      await reloadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update final quantity.');
      await reloadDetail().catch(() => undefined);
    } finally {
      setItemBusy(null);
    }
  }

  async function requestShoppingView() {
    if (activationBusy) return;
    setActivationBusy(true);
    setActivationError(null);
    try {
      const nextReadiness = await planService.getGroceryHaulExecutionReadiness(haulId);
      setReadiness(nextReadiness);
      const needsReview = nextReadiness.blockers.length > 0
        || nextReadiness.warnings.length > 0
        || nextReadiness.deferred_findings.length > 0
        || !nextReadiness.can_start;
      if (needsReview) {
        setReadinessOpen(true);
        return;
      }
      await activateShoppingView();
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : 'Unable to check Shopping View readiness.');
    } finally {
      setActivationBusy(false);
    }
  }

  async function activateShoppingView() {
    setActivationBusy(true);
    setActivationError(null);
    try {
      await planService.startGroceryHaulExecution(haulId);
      await router.push(APP_ROUTE_BUILDERS.foodHaulShop(haulId));
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : 'Unable to open Shopping View.');
    } finally {
      setActivationBusy(false);
    }
  }

  function continueFromReadiness() {
    if (!readiness?.can_start) return;
    setReadinessOpen(false);
    void activateShoppingView();
  }

  async function addSelectedLists() {
    if (selectedListIds.length === 0 || addingLists) return;
    setAddingLists(true);
    setAddListsError(null);
    try {
      await planService.addGroceryListsToHaul(haulId, selectedListIds);
      await reloadDetail();
      setSelectedListIds([]);
      setAddListQuery('');
      setAddListsOpen(false);
    } catch (err) {
      setAddListsError(err instanceof Error ? err.message : 'Unable to add these Lists.');
    } finally {
      setAddingLists(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
        <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14">
          <div className="mx-auto max-w-[1000px] space-y-4">
            <div className="h-12 w-2/3 animate-pulse rounded-xl bg-white/[0.05]" />
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        </SignedInPageScroll>
        <JournalFooterNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14">
        {loadState === 'error' || !detail || !metadata ? (
          <div className="mx-auto max-w-[800px]">
            <p role="alert" className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error || 'Unable to load this Haul.'}
            </p>
            <button type="button" onClick={() => void load()} className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : detail.haul.status === 'active' && !prepareView ? (
          <div className="mx-auto max-w-[1000px] space-y-4">
            <div className="h-12 w-2/3 animate-pulse rounded-xl bg-white/[0.05]" />
            <p className="text-sm text-white/50">Continue to Shopping View…</p>
          </div>
        ) : detail.haul.status !== 'planned' && !activePrepareView ? (
          <HistoricalHaul detail={detail} />
        ) : (
          <div className="mx-auto w-full max-w-[1000px]">
            <Link href={APP_ROUTES.foodHauls} className="text-xs font-semibold text-white/45 hover:text-white/75">
              ← Hauls
            </Link>
            {activePrepareView && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
                <p>Pending items can be edited here. Return in-basket or skipped items to pending in Shopping View first.</p>
                <Link
                  href={APP_ROUTE_BUILDERS.foodHaulShop(haulId)}
                  className="font-semibold text-brand-50 hover:text-brand-50/80"
                >
                  Back to Shopping View
                </Link>
              </div>
            )}
            <header className="mt-5">
              <p className="text-lg font-semibold text-white">Haul Builder</p>
              <h1 className="mt-1 text-4xl font-light tracking-tight text-brand-50 sm:text-5xl">
                Prepare your next shopping trip
              </h1>
            </header>

            <section
              className="mt-8 flex flex-wrap items-center gap-2 border-b border-white/20 pb-6"
              aria-label="Haul builder controls"
            >
              {!activePrepareView && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedListIds([]);
                    setAddListsError(null);
                    setAddListsOpen(true);
                  }}
                  disabled={availableLists.length === 0}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/20 px-4 text-xs font-semibold disabled:opacity-35"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Lists
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/70">
                    {detail.source_lists.length}
                  </span>
                </button>
              )}
              <span className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-white/70">
                Stores
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/60">
                  {distinctStoreCount}
                </span>
              </span>
              <button
                type="button"
                disabled
                title="Adding stores from the builder is not available yet."
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-xs font-semibold text-white/35 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Store
              </button>
              <button
                type="button"
                disabled
                title="Invite to Haul is planned for a later phase."
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-xs font-semibold text-white/35 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Invite to Haul
              </button>
            </section>

            {autosaveError && (
              <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <span>{autosaveError}</span>
                <button type="button" onClick={() => setRetryAutosave((value) => value + 1)} className="font-semibold underline">
                  Retry
                </button>
              </div>
            )}
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}
            {activationError && (
              <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {activationError}
              </p>
            )}

            <section className="mt-7" aria-labelledby="source-lists-title">
              <div className="border-b border-white/25 pb-3">
                <h2 id="source-lists-title" className="text-sm font-semibold text-brand-50">Source Lists</h2>
                <p className="mt-1 text-xs text-white/45">
                  {detail.source_lists.length} {detail.source_lists.length === 1 ? 'List' : 'Lists'} · {detail.estimate.execution_item_count} live items
                </p>
              </div>

              <div>
                {detail.source_lists.map((source) => {
                  const sourceItems = itemsBySource.get(source.grocery_list_id) ?? [];
                  const open = openSourceId === source.grocery_list_id;
                  const sourceEstimate = computeGroceryHaulPreparationEstimate(
                    detail.haul.currency,
                    sourceItems,
                  ).estimated_total;
                  return (
                    <div key={source.grocery_list_id} className="border-b border-white/15">
                      <button
                        ref={(node) => {
                          if (node) sourceHeaders.current.set(source.grocery_list_id, node);
                          else sourceHeaders.current.delete(source.grocery_list_id);
                        }}
                        type="button"
                        aria-expanded={open}
                        onClick={() => switchSource(source.grocery_list_id)}
                        className="flex w-full items-center justify-between gap-4 py-5 text-left"
                      >
                        <span>
                          <span className="block text-sm font-semibold text-brand-50">{source.title?.trim() || 'Source List'}</span>
                          <span className="mt-1 block text-xs text-white/45">
                            {sourceItems.length} items · {formatHaulCurrency(sourceEstimate, detail.haul.currency)} estimated
                          </span>
                        </span>
                        {open ? <ChevronUp className="h-5 w-5 text-white/55" /> : <ChevronDown className="h-5 w-5 text-white/55" />}
                      </button>
                      {open && (
                        <div className="pb-3 pl-3 sm:pl-5">
                          {sourceItems.length === 0 ? (
                            <p className="border-l border-white/10 px-4 py-5 text-sm text-white/45">No captured demand in this source snapshot.</p>
                          ) : sourceItems.map((item) => {
                            const excluded = item.final_quantity === 0;
                            const store = itemStoreLabel(item);
                            const haulCurrency = detail.haul.currency;
                            const priceIsCurrent = item.price_amount != null
                              && item.price_source != null
                              && item.price_currency === haulCurrency;
                            const productLabel = [item.brand_name, item.product_title].filter(Boolean).join(' · ');
                            return (
                              <article
                                key={item.id}
                                className={`relative border-l border-white/15 px-4 py-4 sm:px-6 ${excluded ? 'opacity-45' : ''}`}
                              >
                                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,5.5rem)_auto_auto] sm:items-center sm:gap-x-3 sm:gap-y-2">
                                  <div className="min-w-0">
                                    <h3 className="text-sm font-semibold text-brand-50">{item.name_snapshot}</h3>
                                    <p className="mt-0.5 text-[11px] text-white/40">{sourceDemandLabel(item)}</p>
                                  </div>
                                  <div className="min-w-0 sm:col-start-2">
                                    {item.product_title ? (
                                      <p className="text-sm text-white/70">{productLabel}</p>
                                    ) : !itemPreparationLocked(item.id) ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setChooseProductFirst(true);
                                          setEditingItem(item);
                                        }}
                                        className="rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold text-[#16110d]"
                                      >
                                        Choose Product
                                      </button>
                                    ) : (
                                      <p className="text-sm text-white/45">Product not set</p>
                                    )}
                                  </div>
                                  <div className="min-w-0 text-xs text-white/45 sm:col-start-3">
                                    {store ?? (item.product_title ? 'Store not set' : '—')}
                                  </div>
                                  <div className="text-sm text-white/65 sm:col-start-4 sm:text-right">
                                    {priceIsCurrent ? (
                                      <>
                                        {formatHaulCurrency(item.price_amount!, item.price_currency ?? haulCurrency)}
                                        {item.price_source === 'manual' ? (
                                          <span className="block text-[10px] text-white/40">Manual</span>
                                        ) : null}
                                      </>
                                    ) : item.product_title && item.final_quantity > 0 ? (
                                      <span className="text-xs text-amber-100/70">Price needed</span>
                                    ) : (
                                      <span className="text-white/30">—</span>
                                    )}
                                  </div>
                                  <div className="inline-flex w-fit items-center rounded-full border border-white/20 sm:col-start-5">
                                    {!itemPreparationLocked(item.id) && (
                                      <button
                                        type="button"
                                        aria-label={`Decrease ${item.name_snapshot} final Haul quantity`}
                                        onClick={() => void changeQuantity(item, -1)}
                                        disabled={itemBusy === item.id}
                                        className="h-8 w-9 text-sm text-white/60 disabled:opacity-35"
                                      >
                                        −
                                      </button>
                                    )}
                                    <span className="min-w-9 text-center text-xs font-semibold" aria-label={`Final Haul quantity ${item.final_quantity}`}>
                                      {item.final_quantity}
                                    </span>
                                    {!itemPreparationLocked(item.id) && (
                                      <button
                                        type="button"
                                        aria-label={`Increase ${item.name_snapshot} final Haul quantity`}
                                        onClick={() => void changeQuantity(item, 1)}
                                        disabled={itemBusy === item.id}
                                        className="h-8 w-9 text-sm text-white/60 disabled:opacity-35"
                                      >
                                        +
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex justify-end sm:col-start-6">
                                    {!itemPreparationLocked(item.id) && (
                                      <details className="relative shrink-0">
                                        <summary aria-label={`More actions for ${item.name_snapshot}`} className="cursor-pointer list-none rounded-full px-2 py-1 text-lg tracking-widest text-white/65">
                                          •••
                                        </summary>
                                        <div className="absolute right-0 z-20 mt-1 w-28 rounded-xl border border-white/15 bg-[#2a2119] p-1 shadow-xl">
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                                              setChooseProductFirst(false);
                                              setEditingItem(item);
                                            }}
                                            className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-white/[0.06]"
                                          >
                                            Edit
                                          </button>
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                </div>
                                {excluded && (
                                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                                    Excluded from estimate and shopping execution
                                  </p>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-12 rounded-[24px] border border-white/25 p-6 sm:p-8" aria-labelledby="shopping-summary-title">
              <h2 id="shopping-summary-title" className="text-xl font-semibold text-brand-50">Shopping Summary</h2>
              <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Haul name
                <input
                  value={metadata.title}
                  readOnly={metadataReadOnly}
                  onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
                  className="mt-1.5 min-h-10 w-full max-w-md rounded-xl border border-white/10 bg-transparent px-3 text-sm font-medium normal-case tracking-normal text-white/80 outline-none focus:border-white/30"
                />
              </label>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Shopping date
                  <input
                    type="date"
                    value={metadata.shoppingDate}
                    readOnly={metadataReadOnly}
                    onChange={(event) => setMetadata({ ...metadata, shoppingDate: event.target.value })}
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-transparent px-3 text-base font-normal normal-case tracking-normal text-white outline-none focus:border-white/45"
                  />
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  Budget ({metadata.currency})
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={metadata.budgetAmount}
                    readOnly={metadataReadOnly}
                    onChange={(event) => setMetadata({ ...metadata, budgetAmount: event.target.value })}
                    placeholder="Optional"
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-transparent px-3 text-base font-normal normal-case tracking-normal text-white outline-none focus:border-white/45"
                  />
                </label>
              </div>
              <p className="mt-6 text-4xl font-light text-brand-50">
                {formatHaulCurrency(detail.estimate.estimated_total, detail.estimate.currency)}
              </p>
              <p className="mt-2 text-xs text-white/45">
                {detail.estimate.priced_item_count} priced · {detail.estimate.unpriced_item_count} unpriced · {detail.estimate.excluded_item_count} excluded
              </p>
              {detail.haul.budget_amount != null && (
                <p className="mt-3 text-sm text-white/65">
                  Budget {formatHaulCurrency(detail.haul.budget_amount, detail.haul.currency)} ·{' '}
                  {detail.estimate.estimated_total <= detail.haul.budget_amount
                    ? `${formatHaulCurrency(detail.haul.budget_amount - detail.estimate.estimated_total, detail.haul.currency)} remaining`
                    : `${formatHaulCurrency(detail.estimate.estimated_total - detail.haul.budget_amount, detail.haul.currency)} over`}
                </p>
              )}
              {detail.estimate.by_store.length > 0 && (
                <div className="mt-6 space-y-3 border-t border-white/15 pt-5">
                  {detail.estimate.by_store.map((store) => (
                    <div key={store.store_key} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-white/60">{store.store_location || store.retailer || 'Store not set'} · {store.priced_item_count} priced</span>
                      <span className="font-semibold text-brand-50">{formatHaulCurrency(store.estimated_subtotal, detail.estimate.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {(detail.estimate.missing_product_count > 0 || detail.estimate.missing_store_count > 0) && (
                <p className="mt-6 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100/75">
                  Review: {detail.estimate.missing_product_count} without a product · {detail.estimate.missing_store_count} without a store.
                </p>
              )}
              <p className="mt-5 text-xs text-white/35">
                Based on persisted Haul prices. Tax is not included.
              </p>
              {activePrepareView ? (
                <Link
                  href={APP_ROUTE_BUILDERS.foodHaulShop(haulId)}
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-50 px-6 text-sm font-semibold text-[#16110d] sm:w-auto"
                >
                  Continue to Shopping View
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void requestShoppingView()}
                  disabled={activationBusy}
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-50 px-6 text-sm font-semibold text-[#16110d] disabled:opacity-50 sm:w-auto"
                >
                  {activationBusy ? 'Checking readiness…' : 'Open Shopping View'}
                </button>
              )}
            </section>
          </div>
        )}
      </SignedInPageScroll>
      <JournalFooterNav />

      <HaulItemEditor
        haulId={haulId}
        item={editingItem}
        openInProductSearch={chooseProductFirst}
        onClose={() => {
          setChooseProductFirst(false);
          setEditingItem(null);
        }}
        onSaved={reloadDetail}
      />

      <HaulExecutionReadinessDialog
        open={readinessOpen}
        readiness={readiness}
        items={detail?.items ?? []}
        starting={activationBusy}
        onClose={() => setReadinessOpen(false)}
        onContinue={continueFromReadiness}
      />

      <AppDialog
        open={addListsOpen}
        onClose={() => setAddListsOpen(false)}
        labelledBy="add-lists-title"
        panelClassName="border border-white/15 bg-[#211a14] p-6 text-white shadow-2xl"
      >
        <h2 id="add-lists-title" className="text-2xl font-light text-brand-50">Add source Lists</h2>
        <p className="mt-2 text-sm text-white/50">New memberships and their current demand snapshots are added atomically.</p>
        <div className="relative mt-5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={addListQuery}
            onChange={(event) => setAddListQuery(event.target.value)}
            placeholder="Search active Lists"
            className="min-h-11 w-full rounded-xl border border-white/15 bg-[#16110d] pl-10 pr-3 text-xl outline-none"
          />
        </div>
        <div className="mt-3 space-y-2">
          {visibleAddLists.length === 0 ? (
            <p className="rounded-xl border border-white/10 px-4 py-4 text-sm text-white/45">No additional active Lists found.</p>
          ) : visibleAddLists.map((list) => (
            <label key={list.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3">
              <input
                type="checkbox"
                checked={selectedListIds.includes(list.id)}
                onChange={() => setSelectedListIds((current) =>
                  current.includes(list.id)
                    ? current.filter((id) => id !== list.id)
                    : [...current, list.id],
                )}
                className="h-4 w-4 accent-white"
              />
              <span className="text-sm font-semibold">{groceryListTitle(list)}</span>
            </label>
          ))}
        </div>
        {addListsError && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{addListsError}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setAddListsOpen(false)} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={() => void addSelectedLists()} disabled={selectedListIds.length === 0 || addingLists} className="rounded-full bg-brand-50 px-6 py-2.5 text-sm font-semibold text-[#16110d] disabled:opacity-40">
            {addingLists ? 'Adding…' : 'Add Lists'}
          </button>
        </div>
      </AppDialog>
    </div>
  );
}
