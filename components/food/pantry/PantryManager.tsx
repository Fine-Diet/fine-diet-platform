'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { AppDialog } from '@/components/ui/AppDialog';
import { PantryQuickStartView } from './PantryQuickStartView';
import {
  earliestExpirationEvidence,
  filterAndSortPantryItems,
  sortAcquisitionLots,
  type InventoryFilter,
  type PerishabilityFilter,
} from './pantryPolicy';
import type { FoodSearchResponse, FoodSearchResult } from '@/lib/food/types';
import {
  planService,
  type PantryAcquisitionLotInput,
} from '@/lib/plans/planService';
import type {
  PantryAcquisitionLot,
  PantryOnHandItem,
} from '@/lib/plans/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { emitPantryQuickStartEvent } from '@/lib/plans/pantryQuickStart/emitEvent';
import {
  writesForAcceptedStaples,
  type PantryQuickStartProposal,
} from '@/lib/plans/pantryQuickStart/proposalPolicy';
import { savePantryQuickStartWrites } from '@/lib/plans/pantryQuickStart/save';

type LoadState = 'loading' | 'ready' | 'error';
type FoodCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

interface LotDraft {
  acquiredOn: string;
  expiresOn: string;
  expectedShelfLifeDays: string;
  quantityAcquired: string;
  quantityRemaining: string;
  unit: string;
  productTitle: string;
  brandName: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  retailer: string;
  priceAmount: string;
  currency: string;
}

const inputClass =
  'mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/40';

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatAmount(quantity: number | null, unit: string | null): string {
  if (quantity == null) return unit ? `Amount saved · ${unit}` : 'Amount saved';
  return unit ? `${quantity} ${unit}` : String(quantity);
}

function formatCurrency(amount: number, currency: string | null): string {
  if (!currency) return String(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function packageLabel(lot: PantryAcquisitionLot): string | null {
  const size = lot.package_size == null
    ? null
    : `${lot.package_size}${lot.package_unit ? ` ${lot.package_unit}` : ''}`;
  const count = lot.package_count == null ? null : `${lot.package_count} count`;
  return [size, count].filter(Boolean).join(' · ') || null;
}

function emptyLotDraft(unit: string | null): LotDraft {
  return {
    acquiredOn: new Date().toISOString().slice(0, 10),
    expiresOn: '',
    expectedShelfLifeDays: '',
    quantityAcquired: '',
    quantityRemaining: '',
    unit: unit ?? '',
    productTitle: '',
    brandName: '',
    packageSize: '',
    packageUnit: '',
    packageCount: '',
    retailer: '',
    priceAmount: '',
    currency: 'USD',
  };
}

function lotDraft(lot: PantryAcquisitionLot): LotDraft {
  return {
    acquiredOn: lot.acquired_on,
    expiresOn: lot.expires_on ?? '',
    expectedShelfLifeDays: lot.expected_shelf_life_days == null
      ? ''
      : String(lot.expected_shelf_life_days),
    quantityAcquired: String(lot.quantity_acquired),
    quantityRemaining: String(lot.quantity_remaining),
    unit: lot.unit ?? '',
    productTitle: lot.product_title ?? '',
    brandName: lot.brand_name ?? '',
    packageSize: lot.package_size == null ? '' : String(lot.package_size),
    packageUnit: lot.package_unit ?? '',
    packageCount: lot.package_count == null ? '' : String(lot.package_count),
    retailer: lot.retailer ?? '',
    priceAmount: lot.price_amount == null ? '' : String(lot.price_amount),
    currency: lot.currency ?? 'USD',
  };
}

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

function lotInputFromDraft(draft: LotDraft): PantryAcquisitionLotInput {
  return {
    acquired_on: draft.acquiredOn,
    expires_on: draft.expiresOn || null,
    expected_shelf_life_days: optionalNumber(draft.expectedShelfLifeDays),
    quantity_acquired: Number(draft.quantityAcquired),
    quantity_remaining: Number(draft.quantityRemaining),
    unit: draft.unit.trim() || null,
    product_title: draft.productTitle.trim() || null,
    brand_name: draft.brandName.trim() || null,
    package_size: optionalNumber(draft.packageSize),
    package_unit: draft.packageUnit.trim() || null,
    package_count: optionalNumber(draft.packageCount),
    retailer: draft.retailer.trim() || null,
    price_amount: optionalNumber(draft.priceAmount),
    currency: draft.priceAmount.trim() ? draft.currency.trim().toUpperCase() || 'USD' : null,
  };
}

function LotCard({
  lot,
  onEdit,
}: {
  lot: PantryAcquisitionLot;
  onEdit: () => void;
}) {
  const evidence = earliestExpirationEvidence([lot]);
  const product = [lot.brand_name, lot.product_title].filter(Boolean).join(' · ');
  const packageText = packageLabel(lot);
  return (
    <article className="border-t border-white/[0.09] py-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {product && <p className="text-sm font-medium text-white">{product}</p>}
          <p className={`${product ? 'mt-1' : ''} text-xs text-white/65`}>
            {formatAmount(lot.quantity_remaining, lot.unit)} remaining
            {' · '}
            {formatAmount(lot.quantity_acquired, lot.unit)} acquired
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-xs font-medium text-white/50 hover:text-white"
        >
          Edit
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/42">
        <span>Acquired {formatDate(lot.acquired_on)}</span>
        {evidence && (
          <span>
            {evidence.kind === 'exact' ? 'Expires' : 'Expected expiration'}{' '}
            {formatDate(evidence.date)}
          </span>
        )}
        {packageText && <span>{packageText}</span>}
        {lot.retailer && <span>{lot.retailer}</span>}
        {lot.price_amount != null && (
          <span>{formatCurrency(lot.price_amount, lot.currency)}</span>
        )}
        {lot.source_haul_id && <span>From a Haul</span>}
      </div>
    </article>
  );
}

export default function PantryManager() {
  const router = useRouter();
  const autoOpenHandledRef = useRef(false);
  const [items, setItems] = useState<PantryOnHandItem[]>([]);
  const [lots, setLots] = useState<PantryAcquisitionLot[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [perishability, setPerishability] = useState<PerishabilityFilter>('all');
  const [inventory, setInventory] = useState<InventoryFilter>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<FoodCandidate[]>([]);
  const [selectedFood, setSelectedFood] = useState<{ id: string; name: string } | null>(null);
  const [addQuantity, setAddQuantity] = useState('');
  const [addUnit, setAddUnit] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [searchingFoods, setSearchingFoods] = useState(false);

  const [editItem, setEditItem] = useState<PantryOnHandItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [lotContext, setLotContext] = useState<{
    pantryKey: string;
    itemName: string;
    lot: PantryAcquisitionLot | null;
  } | null>(null);
  const [lotForm, setLotForm] = useState<LotDraft>(() => emptyLotDraft(null));
  const [lotBusy, setLotBusy] = useState(false);
  const [lotError, setLotError] = useState<string | null>(null);

  const [quickStartProposal, setQuickStartProposal] =
    useState<PantryQuickStartProposal | null>(null);
  const [quickStartLoad, setQuickStartLoad] =
    useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [quickStartSaving, setQuickStartSaving] = useState(false);
  const [quickStartError, setQuickStartError] = useState<string | null>(null);
  const quickStartShownRef = useRef(false);

  const loadPantry = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [pantryItems, acquisitionLots] = await Promise.all([
        planService.listPantryOnHandItems(),
        planService.listPantryAcquisitionLots(),
      ]);
      setItems(pantryItems);
      setLots(acquisitionLots);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Pantry.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadPantry();
  }, [loadPantry]);

  useEffect(() => {
    if (!router.isReady || autoOpenHandledRef.current) return;
    if (router.query.action === 'add') {
      autoOpenHandledRef.current = true;
      openAdd();
      void router.replace(APP_ROUTES.foodPantry, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.action]);

  const lotsByPantryKey = useMemo(() => {
    const grouped: Record<string, PantryAcquisitionLot[]> = {};
    for (const lot of lots) {
      if (!lot.pantry_item_key) continue;
      grouped[lot.pantry_item_key] = [...(grouped[lot.pantry_item_key] ?? []), lot];
    }
    for (const key of Object.keys(grouped)) grouped[key] = sortAcquisitionLots(grouped[key]);
    return grouped;
  }, [lots]);

  const visibleItems = useMemo(
    () => filterAndSortPantryItems({
      items,
      lotsByPantryKey,
      query,
      perishability,
      inventory,
    }),
    [inventory, items, lotsByPantryKey, perishability, query],
  );

  const pantryKnownEmpty = loadState === 'ready' && items.length === 0;
  useEffect(() => {
    if (!pantryKnownEmpty || quickStartLoad !== 'idle') return;
    setQuickStartLoad('loading');
    void fetch('/api/journal/plans/pantry/quick-start', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load starting suggestions.');
        return response.json() as Promise<{ proposal?: PantryQuickStartProposal }>;
      })
      .then(({ proposal }) => {
        if (!proposal) throw new Error('Unable to load starting suggestions.');
        setQuickStartProposal(proposal);
        setQuickStartLoad('ready');
      })
      .catch((err) => {
        setQuickStartError(err instanceof Error ? err.message : 'Unable to load suggestions.');
        setQuickStartLoad('error');
      });
  }, [pantryKnownEmpty, quickStartLoad]);

  useEffect(() => {
    if (
      quickStartLoad !== 'ready'
      || !quickStartProposal
      || quickStartShownRef.current
    ) return;
    quickStartShownRef.current = true;
    emitPantryQuickStartEvent({
      event: 'pantry_quick_start_proposal_shown',
      policyId: quickStartProposal.policyId,
      policyVersion: quickStartProposal.policyVersion,
      proposalSource: quickStartProposal.source,
      path: 'exposed',
      reasonCodes: quickStartProposal.reasonCodes,
      acceptedCount: quickStartProposal.acceptedCount,
      skippedCategoryCount: quickStartProposal.categories.filter((category) => category.skipped).length,
      alreadySavedCount: quickStartProposal.alreadySavedCount,
      stapleId: null,
      categoryId: null,
    });
  }, [quickStartLoad, quickStartProposal]);

  useEffect(() => {
    if (!addOpen || selectedFood) return;
    const foodQuery = addQuery.trim();
    if (foodQuery.length < 2) {
      setAddResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingFoods(true);
      const params = new URLSearchParams({
        q: foodQuery,
        limit: '12',
        sectionLimit: '4',
        consumer: 'flat',
        pageContext: 'pantry_direct_add',
      });
      void fetch(`/api/foods/search?${params}`, {
        credentials: 'include',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Food search failed.');
          return response.json() as Promise<FoodSearchResponse>;
        })
        .then((body) => setAddResults(body.results.slice(0, 12)))
        .catch((err) => {
          if (!controller.signal.aborted) {
            setAddError(err instanceof Error ? err.message : 'Food search failed.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchingFoods(false);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addOpen, addQuery, selectedFood]);

  function openAdd() {
    setAddOpen(true);
    setSelectedFood(null);
    setAddQuery('');
    setAddResults([]);
    setAddQuantity('');
    setAddUnit('');
    setAddError(null);
  }

  async function saveAdd() {
    if (!selectedFood) return setAddError('Select a canonical food first.');
    const quantity = Number(addQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return setAddError('Quantity must be a non-negative number.');
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const saved = await planService.createPantryOnHandItem({
        food_object_id: selectedFood.id,
        quantity,
        unit: addUnit.trim() || null,
      });
      setItems((current) => [
        ...current.filter((item) => item.key !== saved.key),
        saved,
      ]);
      setAddOpen(false);
      setExpandedKey(saved.key);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to add Pantry item.');
    } finally {
      setAddBusy(false);
    }
  }

  function openAggregateEdit(item: PantryOnHandItem) {
    setMenuKey(null);
    setEditItem(item);
    setEditQuantity(item.quantity == null ? '' : String(item.quantity));
    setEditUnit(item.unit ?? '');
    setEditError(null);
  }

  async function saveAggregateEdit() {
    if (!editItem) return;
    const quantity = Number(editQuantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return setEditError('Quantity must be a non-negative number.');
    }
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await planService.updatePantryOnHandItem(editItem.key, {
        quantity,
        unit: editUnit.trim() || null,
      });
      setItems((current) => [
        ...current.filter((item) => item.key !== editItem.key && item.key !== updated.key),
        updated,
      ]);
      setEditItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save Pantry item.');
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteAggregateItem() {
    if (!editItem || !window.confirm(`Remove ${editItem.name} from your Pantry?`)) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await planService.deletePantryOnHandItem(editItem.key);
      setItems((current) => current.filter((item) => item.key !== editItem.key));
      setEditItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to remove Pantry item.');
    } finally {
      setEditBusy(false);
    }
  }

  function openLot(item: PantryOnHandItem, lot: PantryAcquisitionLot | null = null) {
    setMenuKey(null);
    setLotContext({ pantryKey: item.key, itemName: item.name, lot });
    setLotForm(lot ? lotDraft(lot) : emptyLotDraft(item.unit));
    setLotError(null);
  }

  function updateLotForm(patch: Partial<LotDraft>) {
    setLotForm((current) => ({ ...current, ...patch }));
  }

  function updateAcquiredQuantity(value: string) {
    setLotForm((current) => ({
      ...current,
      quantityAcquired: value,
      quantityRemaining:
        !lotContext?.lot
        && (!current.quantityRemaining || current.quantityRemaining === current.quantityAcquired)
          ? value
          : current.quantityRemaining,
    }));
  }

  async function saveLot() {
    if (!lotContext) return;
    const input = lotInputFromDraft(lotForm);
    if (!input.acquired_on) return setLotError('Acquired date is required.');
    if (!Number.isFinite(input.quantity_acquired) || input.quantity_acquired <= 0) {
      return setLotError('Quantity acquired must be greater than zero.');
    }
    if (
      !Number.isFinite(input.quantity_remaining)
      || input.quantity_remaining < 0
      || input.quantity_remaining > input.quantity_acquired
    ) {
      return setLotError('Quantity remaining must be between zero and quantity acquired.');
    }
    setLotBusy(true);
    setLotError(null);
    try {
      if (lotContext.lot) {
        const updated = await planService.updatePantryAcquisitionLot(
          lotContext.lot.id,
          input,
        );
        setLots((current) => current.map((lot) => (
          lot.id === updated.id
            ? { ...updated, pantry_item_key: lotContext.pantryKey }
            : lot
        )));
      } else {
        const created = await planService.createPantryAcquisitionLot(
          lotContext.pantryKey,
          input,
        );
        setLots((current) => [
          ...current,
          { ...created, pantry_item_key: lotContext.pantryKey },
        ]);
      }
      setExpandedKey(lotContext.pantryKey);
      setLotContext(null);
    } catch (err) {
      setLotError(err instanceof Error ? err.message : 'Unable to save acquisition details.');
    } finally {
      setLotBusy(false);
    }
  }

  async function saveQuickStart() {
    if (!quickStartProposal) return;
    const writes = writesForAcceptedStaples(quickStartProposal);
    if (writes.length === 0) {
      return setQuickStartError('Select at least one item you have now.');
    }
    setQuickStartSaving(true);
    setQuickStartError(null);
    const result = await savePantryQuickStartWrites(writes);
    if (!result.ok) {
      setQuickStartError(result.error);
      setQuickStartSaving(false);
      return;
    }
    emitPantryQuickStartEvent({
      event: 'pantry_quick_start_saved',
      policyId: quickStartProposal.policyId,
      policyVersion: quickStartProposal.policyVersion,
      proposalSource: quickStartProposal.source,
      path: 'primary',
      reasonCodes: quickStartProposal.reasonCodes,
      acceptedCount: writes.length,
      skippedCategoryCount: quickStartProposal.categories.filter((category) => category.skipped).length,
      alreadySavedCount: quickStartProposal.alreadySavedCount + result.skippedExisting,
      stapleId: null,
      categoryId: null,
    });
    setItems(result.saved);
    setQuickStartSaving(false);
    void loadPantry();
  }

  function abandonQuickStart() {
    if (!quickStartProposal) return;
    emitPantryQuickStartEvent({
      event: 'pantry_quick_start_abandoned',
      policyId: quickStartProposal.policyId,
      policyVersion: quickStartProposal.policyVersion,
      proposalSource: quickStartProposal.source,
      path: 'cancel',
      reasonCodes: quickStartProposal.reasonCodes,
      acceptedCount: quickStartProposal.acceptedCount,
      skippedCategoryCount: quickStartProposal.categories.filter((category) => category.skipped).length,
      alreadySavedCount: quickStartProposal.alreadySavedCount,
      stapleId: null,
      categoryId: null,
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <SignedInPageScroll className="px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto w-full max-w-[760px]">
          <header className="text-center">
            <p className="text-sm font-semibold text-white/90">Pantry</p>
            <h1 className="mt-1 text-3xl font-medium tracking-tight text-brand-50 sm:text-4xl">
              Your inventory truth as a feed
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/48">
              Keep aggregate on-hand amounts separate from where, when, and what you acquired.
            </p>
          </header>

          <section className="mt-8">
            <div className="flex border-b border-white/25">
              <button
                type="button"
                onClick={openAdd}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-t-xl bg-brand-50 px-4 text-sm font-semibold text-[#16110d] sm:flex-none sm:min-w-48"
              >
                <Plus className="h-4 w-4" />
                Add Pantry Item
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen((open) => !open)}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 px-4 text-sm font-medium text-white/55 hover:text-white sm:justify-start"
              >
                <Search className="h-4 w-4" />
                Search Pantry
              </button>
            </div>

            {searchOpen && (
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search items, products, brands, or retailers"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-2.5 pl-10 pr-10 text-sm text-white outline-none placeholder:text-white/28 focus:border-white/30"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear Pantry search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3 border-b border-white/[0.08] pb-3">
              <label className="min-w-40">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
                  Perishability
                </span>
                <select
                  value={perishability}
                  onChange={(event) => setPerishability(event.target.value as PerishabilityFilter)}
                  className="mt-1 w-full bg-transparent text-sm text-white/75 outline-none"
                >
                  <option value="all">All items</option>
                  <option value="evidence">Expiration evidence</option>
                  <option value="no_evidence">No expiration evidence</option>
                </select>
              </label>
              <label className="min-w-36">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
                  Inventory Status
                </span>
                <select
                  value={inventory}
                  onChange={(event) => setInventory(event.target.value as InventoryFilter)}
                  className="mt-1 w-full bg-transparent text-sm text-white/75 outline-none"
                >
                  <option value="all">All amounts</option>
                  <option value="positive">Positive amount</option>
                  <option value="zero">Exactly zero</option>
                </select>
              </label>
              <p className="ml-auto text-xs text-white/35">
                {visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'}
              </p>
            </div>
          </section>

          {error && (
            <p className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100" role="alert">
              {error}
            </p>
          )}

          {loadState === 'loading' && (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
              ))}
            </div>
          )}

          {loadState === 'error' && (
            <button
              type="button"
              onClick={() => void loadPantry()}
              className="mt-5 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70"
            >
              Try again
            </button>
          )}

          {pantryKnownEmpty && (
            <div className="mt-6">
              {quickStartLoad === 'loading' && (
                <p className="rounded-2xl border border-white/[0.08] p-6 text-sm text-white/50">
                  Preparing Pantry Quick Start…
                </p>
              )}
              {quickStartLoad === 'error' && (
                <div className="rounded-2xl border border-dashed border-white/12 p-6 text-center">
                  <p className="font-medium">Start with your Essentials</p>
                  <p className="mt-2 text-sm text-white/45">{quickStartError}</p>
                  <button
                    type="button"
                    onClick={openAdd}
                    className="mt-4 rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d]"
                  >
                    Add Pantry Item
                  </button>
                </div>
              )}
              {quickStartLoad === 'ready' && quickStartProposal && (
                <PantryQuickStartView
                  proposal={quickStartProposal}
                  saving={quickStartSaving}
                  error={quickStartError}
                  onChange={setQuickStartProposal}
                  onSave={() => void saveQuickStart()}
                  onAddOwn={openAdd}
                  onAbandon={abandonQuickStart}
                />
              )}
            </div>
          )}

          {loadState === 'ready' && items.length > 0 && visibleItems.length === 0 && (
            <div className="py-12 text-center text-sm text-white/45">
              No Pantry items match these factual filters.
            </div>
          )}

          {loadState === 'ready' && visibleItems.length > 0 && (
            <div className="mt-2">
              {visibleItems.map((item) => {
                const itemLots = lotsByPantryKey[item.key] ?? [];
                const evidence = earliestExpirationEvidence(itemLots);
                const expanded = expandedKey === item.key;
                return (
                  <article
                    key={item.key}
                    className={`relative border-b border-white/[0.1] transition-colors ${expanded ? 'bg-white/[0.055]' : ''}`}
                  >
                    <div className="flex min-h-[72px] items-start gap-3 px-3 py-4">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : item.key)}
                        aria-expanded={expanded}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block text-[15px] font-semibold text-white">{item.name}</span>
                        <span className="mt-0.5 block text-xs text-white/52">
                          {formatAmount(item.quantity, item.unit)}
                        </span>
                        {evidence && (
                          <span className="mt-0.5 block text-xs text-white/38">
                            {evidence.kind === 'exact' ? 'Expires' : 'Expected expiration'}{' '}
                            {formatDate(evidence.date)}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : item.key)}
                        aria-label={expanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
                        className="mt-1 text-white/40 hover:text-white"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuKey(menuKey === item.key ? null : item.key)}
                          aria-label={`Actions for ${item.name}`}
                          className="rounded-full p-1 text-white/70 hover:bg-white/10"
                        >
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                        {menuKey === item.key && (
                          <div className="absolute right-0 top-8 z-10 w-48 rounded-xl border border-white/12 bg-[#211a14] p-1 shadow-2xl">
                            <button
                              type="button"
                              onClick={() => openAggregateEdit(item)}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.06]"
                            >
                              Edit on-hand amount
                            </button>
                            <button
                              type="button"
                              onClick={() => openLot(item)}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.06]"
                            >
                              Add acquisition details
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="px-4 pb-5 sm:px-6">
                        <div className="border-t border-white/[0.12] pt-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
                                Acquisition details
                              </p>
                              <p className="mt-1 text-xs text-white/42">
                                Lot history does not change the aggregate on-hand amount.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openLot(item)}
                              className="shrink-0 text-xs font-semibold text-white/65 hover:text-white"
                            >
                              + Add details
                            </button>
                          </div>
                          {itemLots.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openLot(item)}
                              className="mt-4 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/60 hover:text-white"
                            >
                              Add Product Details
                            </button>
                          ) : (
                            <div className="mt-4">
                              {itemLots.map((lot) => (
                                <LotCard key={lot.id} lot={lot} onEdit={() => openLot(item, lot)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </SignedInPageScroll>

      <AppDialog
        open={addOpen}
        onClose={() => !addBusy && setAddOpen(false)}
        labelledBy="add-pantry-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="add-pantry-title" className="text-xl font-semibold text-white">
            Add Pantry Item
          </h2>
          {!selectedFood ? (
            <>
              <p className="mt-1 text-sm text-white/45">Find a canonical food for inventory truth.</p>
              <input
                autoFocus
                type="search"
                value={addQuery}
                onChange={(event) => {
                  setAddQuery(event.target.value);
                  setAddError(null);
                }}
                placeholder="Search foods"
                className={inputClass}
              />
              <div className="mt-3 max-h-72 overflow-y-auto">
                {searchingFoods ? (
                  <p className="py-3 text-sm text-white/45">Searching…</p>
                ) : addResults.map((candidate) => (
                  <button
                    key={candidate.food.id}
                    type="button"
                    onClick={() => {
                      setSelectedFood({
                        id: candidate.food.id,
                        name: candidate.food.canonicalName,
                      });
                      setAddError(null);
                    }}
                    className="block w-full border-b border-white/[0.06] px-2 py-3 text-left hover:bg-white/[0.04]"
                  >
                    <span className="block text-sm text-white">{candidate.food.canonicalName}</span>
                    <span className="block text-xs text-white/35">
                      {candidate.food.brandName ? `${candidate.food.brandName} · ` : ''}
                      {candidate.source_label ?? candidate.source}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-white/45">{selectedFood.name}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <label>
                  <span className="text-xs text-white/55">Aggregate quantity</span>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="any"
                    value={addQuantity}
                    onChange={(event) => setAddQuantity(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label>
                  <span className="text-xs text-white/55">Unit</span>
                  <input
                    value={addUnit}
                    onChange={(event) => setAddUnit(event.target.value)}
                    placeholder="item, cup, g…"
                    className={inputClass}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="mt-3 text-xs text-white/45 hover:text-white"
              >
                Choose a different food
              </button>
            </>
          )}
          {addError && <p className="mt-3 text-sm text-red-200" role="alert">{addError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} disabled={addBusy} className="px-4 py-2 text-sm text-white/55">
              Cancel
            </button>
            {selectedFood && (
              <button type="button" onClick={() => void saveAdd()} disabled={addBusy} className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40">
                {addBusy ? 'Saving…' : 'Save Pantry Item'}
              </button>
            )}
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(editItem)}
        onClose={() => !editBusy && setEditItem(null)}
        labelledBy="edit-pantry-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="edit-pantry-title" className="text-xl font-semibold text-white">
            Edit on-hand amount
          </h2>
          <p className="mt-1 text-sm text-white/45">
            {editItem?.name} · Acquisition history stays unchanged.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs text-white/55">Aggregate quantity</span>
              <input type="number" min="0" step="any" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="text-xs text-white/55">Unit</span>
              <input value={editUnit} onChange={(event) => setEditUnit(event.target.value)} className={inputClass} />
            </label>
          </div>
          {editError && <p className="mt-3 text-sm text-red-200" role="alert">{editError}</p>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" onClick={() => void deleteAggregateItem()} disabled={editBusy} className="text-sm text-red-200/75">
              Remove from Pantry
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditItem(null)} disabled={editBusy} className="px-4 py-2 text-sm text-white/55">Cancel</button>
              <button type="button" onClick={() => void saveAggregateEdit()} disabled={editBusy} className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40">
                {editBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(lotContext)}
        onClose={() => !lotBusy && setLotContext(null)}
        labelledBy="acquisition-details-title"
        panelClassName="border border-white/10 bg-[#211a14] shadow-2xl"
      >
        <div className="p-5">
          <h2 id="acquisition-details-title" className="text-xl font-semibold text-white">
            {lotContext?.lot ? 'Edit acquisition details' : 'Add acquisition details'}
          </h2>
          <p className="mt-1 text-sm text-white/45">
            {lotContext?.itemName} · This will not change the aggregate on-hand amount.
          </p>
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <span className="text-xs text-white/55">Acquired date *</span>
                <input type="date" value={lotForm.acquiredOn} onChange={(event) => updateLotForm({ acquiredOn: event.target.value })} className={inputClass} />
              </label>
              <label>
                <span className="text-xs text-white/55">Expiration date</span>
                <input type="date" value={lotForm.expiresOn} onChange={(event) => updateLotForm({ expiresOn: event.target.value })} className={inputClass} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label>
                <span className="text-xs text-white/55">Acquired *</span>
                <input type="number" min="0.01" step="any" value={lotForm.quantityAcquired} onChange={(event) => updateAcquiredQuantity(event.target.value)} className={inputClass} />
              </label>
              <label>
                <span className="text-xs text-white/55">Remaining *</span>
                <input type="number" min="0" step="any" value={lotForm.quantityRemaining} onChange={(event) => updateLotForm({ quantityRemaining: event.target.value })} className={inputClass} />
              </label>
              <label className="col-span-2 sm:col-span-1">
                <span className="text-xs text-white/55">Unit</span>
                <input value={lotForm.unit} onChange={(event) => updateLotForm({ unit: event.target.value })} className={inputClass} />
              </label>
            </div>
            {!lotContext?.lot && (
              <p className="-mt-2 text-xs text-white/35">
                Remaining starts equal to the amount acquired; change it if some has already been used.
              </p>
            )}
            <label className="block">
              <span className="text-xs text-white/55">Expected shelf life in days</span>
              <input type="number" min="1" step="1" value={lotForm.expectedShelfLifeDays} onChange={(event) => updateLotForm({ expectedShelfLifeDays: event.target.value })} className={inputClass} />
            </label>
            <div className="border-t border-white/[0.08] pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Product details</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-xs text-white/55">Product title</span>
                  <input value={lotForm.productTitle} onChange={(event) => updateLotForm({ productTitle: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Brand</span>
                  <input value={lotForm.brandName} onChange={(event) => updateLotForm({ brandName: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Package size</span>
                  <input type="number" min="0.01" step="any" value={lotForm.packageSize} onChange={(event) => updateLotForm({ packageSize: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Package unit</span>
                  <input value={lotForm.packageUnit} onChange={(event) => updateLotForm({ packageUnit: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Package count</span>
                  <input type="number" min="1" step="1" value={lotForm.packageCount} onChange={(event) => updateLotForm({ packageCount: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Retailer</span>
                  <input value={lotForm.retailer} onChange={(event) => updateLotForm({ retailer: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Price</span>
                  <input type="number" min="0" step="0.01" value={lotForm.priceAmount} onChange={(event) => updateLotForm({ priceAmount: event.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="text-xs text-white/55">Currency</span>
                  <input maxLength={3} value={lotForm.currency} onChange={(event) => updateLotForm({ currency: event.target.value.toUpperCase() })} className={inputClass} />
                </label>
              </div>
            </div>
          </div>
          {lotError && <p className="mt-3 text-sm text-red-200" role="alert">{lotError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setLotContext(null)} disabled={lotBusy} className="px-4 py-2 text-sm text-white/55">Cancel</button>
            <button type="button" onClick={() => void saveLot()} disabled={lotBusy} className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40">
              {lotBusy ? 'Saving…' : lotContext?.lot ? 'Save changes' : 'Add acquisition'}
            </button>
          </div>
        </div>
      </AppDialog>

      <JournalFooterNav />
    </div>
  );
}
