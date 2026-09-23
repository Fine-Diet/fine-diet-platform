'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useRouter } from 'next/router';

import { FoodSectionViewSwitcher } from '@/components/food/FoodSectionViewSwitcher';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { AppDialog } from '@/components/ui/AppDialog';
import { PantryPurchaseEditor, type PurchaseDetailsMode } from './PantryPurchaseEditor';
import { PantryQuickStartView } from './PantryQuickStartView';
import {
  type PantryLotDraft,
  validatePantryLotSave,
} from './pantryLotSave';
import {
  expirationEvidence,
  expirationEvidenceTense,
  filterAndSortPantryItems,
  formatExpirationEvidenceLabel,
  formatPurchaseStateLabel,
  localTodayYmd,
  parentDisplayExpirationEvidence,
  sortPurchaseHistoryLots,
  type InventoryFilter,
  type PerishabilityFilter,
} from './pantryPolicy';
import { applyPantryProductOfferToLotDraft } from '@/lib/plans/pantryProductSearchMapping';
import {
  fetchPantryProductSearch,
  formatPantryProductSearchProviderErrorMessage,
  PantryProductSearchQuotaExceededError,
} from '@/lib/plans/pantryProductSearchClient';
import {
  loadGroceryPriceSearchPrefs,
  saveGroceryPriceSearchPrefs,
} from '@/lib/plans/groceryPricingClient';
import { tryNormalizePostalCode } from '@/lib/plans/groceryPricingValidation';
import type { PantryProductSearchProvenance } from '@/lib/plans/pantryProductSearchTypes';
import type { PantryProductSearchOffer } from '@/lib/plans/pantryProductSearchTypes';
import type { FoodSearchResponse, FoodSearchResult } from '@/lib/food/types';
import {
  planService,
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

type LotDraft = PantryLotDraft;

const inputClass =
  'mt-1 w-full rounded-xl border border-white/15 bg-[#16110d] px-3 py-2 text-xl text-white outline-none placeholder:text-white/25 focus:border-white/40';

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

function formatQuantityLine(
  remaining: number,
  acquired: number,
  unit: string | null,
): string {
  const remainingText = formatAmount(remaining, unit);
  const acquiredText = unit ? `${acquired} ${unit}` : String(acquired);
  return `${remainingText} remaining · ${acquiredText} purchased`;
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

function LotCard({
  lot,
  onEdit,
  todayYmd,
}: {
  lot: PantryAcquisitionLot;
  onEdit: () => void;
  todayYmd: string;
}) {
  const product = [lot.brand_name, lot.product_title].filter(Boolean).join(' · ');
  const packageText = packageLabel(lot);
  const purchaseState = formatPurchaseStateLabel(lot, todayYmd);
  const evidence = expirationEvidence(lot);
  const purchaseStateEmphasis = lot.quantity_remaining === 0
    || (evidence?.kind === 'exact'
      && ['expired', 'today'].includes(expirationEvidenceTense(evidence, todayYmd)));
  return (
    <article className="border-t border-white/[0.09] py-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {product && <p className="text-xl font-semibold text-white">{product}</p>}
          <p className={`${product ? 'mt-1' : ''} text-sm text-white/50`}>
            {formatQuantityLine(lot.quantity_remaining, lot.quantity_acquired, lot.unit)}
          </p>
          <p className="mt-1 text-sm text-white/50">Purchased {formatDate(lot.acquired_on)}</p>
          <p className={`mt-1 text-sm text-white/50 ${purchaseStateEmphasis ? 'font-semibold' : ''}`}>
            {purchaseState}
          </p>
          {packageText && <p className="mt-1 text-sm text-white/50">{packageText}</p>}
          {lot.retailer && <p className="mt-1 text-sm text-white/50">{lot.retailer}</p>}
          {lot.source_haul_id && <p className="mt-1 text-sm text-white/50">From a Haul</p>}
          {lot.price_amount != null && (
            <p className="mt-2 text-xl font-semibold text-white/50">
              {formatCurrency(lot.price_amount, lot.currency)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-sm font-medium text-white/50 hover:text-white"
        >
          Edit
        </button>
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
  const [purchaseDetailsMode, setPurchaseDetailsMode] =
    useState<PurchaseDetailsMode>('summary');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchPostal, setProductSearchPostal] = useState('');
  const [productSearchRetailer, setProductSearchRetailer] = useState('');
  const [productSearchPostalTouched, setProductSearchPostalTouched] = useState(false);
  const [productSearchState, setProductSearchState] = useState<
    'idle' | 'searching' | 'results' | 'zero_results' | 'error' | 'quota_exceeded'
  >('idle');
  const [productSearchOffers, setProductSearchOffers] = useState<PantryProductSearchOffer[]>([]);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [productSearchProvenance, setProductSearchProvenance] =
    useState<PantryProductSearchProvenance | null>(null);
  const todayYmd = localTodayYmd();

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
    for (const key of Object.keys(grouped)) grouped[key] = sortPurchaseHistoryLots(grouped[key]);
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

  function resetProductSearch() {
    setPurchaseDetailsMode('summary');
    setProductSearchQuery('');
    setProductSearchPostal('');
    setProductSearchRetailer('');
    setProductSearchPostalTouched(false);
    setProductSearchState('idle');
    setProductSearchOffers([]);
    setProductSearchError(null);
    setProductSearchProvenance(null);
  }

  function openLot(item: PantryOnHandItem, lot: PantryAcquisitionLot | null = null) {
    setLotContext({ pantryKey: item.key, itemName: item.name, lot });
    setLotForm(lot ? lotDraft(lot) : emptyLotDraft(item.unit));
    setLotError(null);
    setPurchaseDetailsMode('summary');
    resetProductSearch();
  }

  function openProductSearch() {
    const prefs = loadGroceryPriceSearchPrefs();
    const savedPostal = tryNormalizePostalCode(prefs.postal_code);
    const defaultQuery = lotForm.productTitle.trim() || lotContext?.itemName || '';
    const lotRetailer = lotForm.retailer.trim();
    setProductSearchQuery(defaultQuery);
    setProductSearchPostal(savedPostal.ok ? savedPostal.value : '');
    setProductSearchRetailer(lotRetailer || prefs.retailer.trim());
    setProductSearchPostalTouched(false);
    setProductSearchState('idle');
    setProductSearchOffers([]);
    setProductSearchError(null);
    setProductSearchProvenance(null);
  }

  function productSearchScopeLabel(postalCode: string, retailer: string): string {
    const retailerLabel = retailer.trim();
    return retailerLabel
      ? `Searching ${retailerLabel} offers near ${postalCode}`
      : `Searching offers near ${postalCode}`;
  }

  const productSearchPostalValidation = tryNormalizePostalCode(productSearchPostal);
  const productSearchCanSubmit =
    productSearchQuery.trim().length >= 2 && productSearchPostalValidation.ok;

  async function runProductSearch() {
    const query = productSearchQuery.trim();
    setProductSearchPostalTouched(true);
    if (query.length < 2) {
      setProductSearchError('Enter at least two characters to search.');
      setProductSearchState('error');
      return;
    }
    if (!productSearchPostalValidation.ok) {
      setProductSearchError(
        productSearchPostalValidation.message
          || 'Enter a valid US ZIP or Canadian postal code.',
      );
      setProductSearchState('error');
      return;
    }
    const retailer = productSearchRetailer.trim() || null;
    setProductSearchState('searching');
    setProductSearchError(null);
    setProductSearchOffers([]);
    setProductSearchProvenance(null);
    try {
      const result = await fetchPantryProductSearch({
        query,
        postal_code: productSearchPostalValidation.value,
        retailer,
      });
      saveGroceryPriceSearchPrefs({
        postal_code: productSearchPostalValidation.value,
        retailer: retailer ?? '',
      });
      if (result.outcome === 'provider_error') {
        setProductSearchState('error');
        setProductSearchError(
          formatPantryProductSearchProviderErrorMessage(result.provider_error),
        );
        return;
      }
      if (
        result.outcome === 'zero_results'
        || !Array.isArray(result.offers)
        || result.offers.length === 0
      ) {
        setProductSearchState('zero_results');
        return;
      }
      setProductSearchOffers(result.offers);
      setProductSearchProvenance(result.search_provenance);
      setProductSearchState('results');
    } catch (err) {
      if (err instanceof PantryProductSearchQuotaExceededError) {
        setProductSearchState('quota_exceeded');
        setProductSearchError('Product lookup quota exceeded for now.');
        return;
      }
      setProductSearchState('error');
      setProductSearchError(err instanceof Error ? err.message : 'Product search failed.');
    }
  }

  function selectProductOffer(offer: PantryProductSearchOffer) {
    setLotForm((current) => applyPantryProductOfferToLotDraft(current, offer));
    setPurchaseDetailsMode('summary');
    setProductSearchState('idle');
    setProductSearchOffers([]);
    setProductSearchError(null);
    setProductSearchProvenance(null);
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

  async function deletePurchaseLot() {
    if (!lotContext?.lot) return;
    const message =
      'Remove this purchase from history? This removes purchase details only and does not change your total on-hand amount.';
    if (!window.confirm(message)) return;
    setLotBusy(true);
    setLotError(null);
    try {
      await planService.deletePantryAcquisitionLot(lotContext.lot.id);
      setLots((current) => current.filter((lot) => lot.id !== lotContext.lot!.id));
      setLotContext(null);
    } catch (err) {
      setLotError(err instanceof Error ? err.message : 'Unable to remove purchase.');
    } finally {
      setLotBusy(false);
    }
  }

  async function saveLot() {
    if (!lotContext) return;
    const validated = validatePantryLotSave(lotForm, lotContext.lot);
    if (!validated.ok) return setLotError(validated.error);
    const input = validated.input;
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
      setLotError(err instanceof Error ? err.message : 'Unable to save purchase details.');
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
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#17130f] via-brand-900 to-neutral-700 text-white">
      <SignedInPageScroll className="px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto w-full max-w-[760px]">
          <header className="text-center">
            <FoodSectionViewSwitcher
              currentView="pantry"
              align="center"
              anchorBackgroundClass="bg-[#17130f]"
            />
            <h1 className="text-[2.5rem] font-medium tracking-tight text-brand-50 sm:text-[2.75rem] leading-[1]">
              Your inventory truth <br /> as a feed
            </h1>
          </header>

          <section className="mt-8">
            <div className="flex border-b border-white/25">
              <button
                type="button"
                onClick={openAdd}
                className="flex flex-1 min-h-11 items-center justify-center gap-2 rounded-t-xl bg-brand-50 px-6 py-4 text-xl font-semibold text-[#16110d] sm:flex-none sm:min-w-48 sm:text-xl"
              >
                <Plus className="h-4 w-4" />
                Add Pantry Item
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen((open) => !open)}
                className="flex min-h-11 flex-1 items-center justify-between gap-2 pl-4 text-xl font-medium text-white/55 hover:text-white sm:justify-between"
              >
                Search Pantry
                <Search className="h-4 w-4" />
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
                  className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-2.5 pl-10 pr-10 text-xl text-white outline-none placeholder:text-white/28 focus:border-white/30"
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
                <span className="block text-sm font-semibold text-white/50">
                  Perishability
                </span>
                <select
                  value={perishability}
                  onChange={(event) => setPerishability(event.target.value as PerishabilityFilter)}
                  className="mt-1 w-full bg-transparent text-xl font-regular text-white/50 outline-none"
                >
                  <option value="all">All items</option>
                  <option value="evidence">Expiration evidence</option>
                  <option value="no_evidence">No expiration evidence</option>
                </select>
              </label>
              <label className="min-w-36">
                <span className="block text-sm font-semibold text-white/50">
                  Inventory Status
                </span>
                <select
                  value={inventory}
                  onChange={(event) => setInventory(event.target.value as InventoryFilter)}
                  className="mt-1 w-full bg-transparent text-xl font-regular text-white/50 outline-none"
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
                const evidence = parentDisplayExpirationEvidence(itemLots, todayYmd);
                const evidenceLabel = evidence
                  ? formatExpirationEvidenceLabel(evidence, todayYmd)
                  : null;
                const evidenceTense = evidence
                  ? expirationEvidenceTense(evidence, todayYmd)
                  : null;
                const isAttentionEvidence = evidence?.kind === 'exact'
                  && (evidenceTense === 'expired' || evidenceTense === 'today');
                const showExpiredDot = evidence?.kind === 'exact' && evidenceTense === 'expired';
                const expanded = expandedKey === item.key;
                return (
                  <article
                    key={item.key}
                    className={`relative transition-colors ${expanded ? 'bg-white/[0.055]' : ''}`}
                  >
                    <div className="flex min-h-[72px] items-start gap-3 px-3 py-4">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : item.key)}
                        aria-expanded={expanded}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block text-xl font-semibold text-white">{item.name}</span>
                        {evidenceLabel && (
                          <span className={`mt-1 flex items-center gap-1.5 text-sm text-white/50 ${isAttentionEvidence ? 'font-semibold' : ''}`}>
                            {showExpiredDot && (
                              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                            )}
                            {evidenceLabel}
                          </span>
                        )}
                        <span className="mt-1 block text-sm text-white/50">
                          {formatAmount(item.quantity, item.unit)}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
                        onClick={() => setExpandedKey(expanded ? null : item.key)}
                        className="mt-1 grid h-7 w-8 shrink-0 place-items-center rounded-md text-base text-white/55 hover:text-white focus:outline-none focus-visible:text-white"
                      >
                        <svg
                          aria-hidden
                          className={`h-[15px] w-[15px] flex-shrink-0 transition-transform duration-200 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <polygon points="12,18 2,6 22,6" />
                        </svg>
                      </button>
                    </div>

                    {expanded && (
                      <div className="px-4 pb-5 sm:px-6">
                        <button
                          type="button"
                          onClick={() => openAggregateEdit(item)}
                          className="text-sm font-medium text-white/50 hover:text-white"
                        >
                          Edit on-hand amount
                        </button>
                        <div className="mt-4 border-t border-white/[0.12] pt-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white/50">
                                Purchase history
                              </p>
                              <p className="mt-1 text-sm text-white/50">
                                Each purchase is tracked separately from your total on hand.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openLot(item)}
                              className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-white/90 focus:outline-none focus:ring-1 focus:ring-white/40"
                            >
                              + Add purchase
                            </button>
                          </div>
                          {itemLots.length === 0 ? (
                            <p className="mt-4 text-sm text-white/50">
                              No purchases recorded yet.
                            </p>
                          ) : (
                            <div className="mt-4">
                              {itemLots.map((lot) => (
                                <LotCard
                                  key={lot.id}
                                  lot={lot}
                                  todayYmd={todayYmd}
                                  onEdit={() => openLot(item, lot)}
                                />
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
            {editItem?.name} · Purchase history stays unchanged.
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

      <PantryPurchaseEditor
        open={Boolean(lotContext)}
        itemName={lotContext?.itemName ?? ''}
        existingLot={lotContext?.lot ?? null}
        lotForm={lotForm}
        lotBusy={lotBusy}
        lotError={lotError}
        purchaseDetailsMode={purchaseDetailsMode}
        inputClassName={inputClass}
        productSearchQuery={productSearchQuery}
        onProductSearchQueryChange={setProductSearchQuery}
        productSearchPostal={productSearchPostal}
        onProductSearchPostalChange={setProductSearchPostal}
        onProductSearchPostalBlur={() => setProductSearchPostalTouched(true)}
        productSearchRetailer={productSearchRetailer}
        onProductSearchRetailerChange={setProductSearchRetailer}
        productSearchPostalTouched={productSearchPostalTouched}
        productSearchPostalValidation={productSearchPostalValidation}
        productSearchCanSubmit={productSearchCanSubmit}
        productSearchState={productSearchState}
        productSearchScopeLabel={productSearchScopeLabel}
        productSearchOffers={productSearchOffers}
        productSearchError={productSearchError}
        productSearchProvenance={productSearchProvenance}
        onClose={() => !lotBusy && setLotContext(null)}
        onSave={() => void saveLot()}
        onUpdateLotForm={updateLotForm}
        onUpdateAcquiredQuantity={updateAcquiredQuantity}
        onSetPurchaseDetailsMode={setPurchaseDetailsMode}
        onOpenProductSearch={openProductSearch}
        onRunProductSearch={() => void runProductSearch()}
        onSelectProductOffer={selectProductOffer}
        onRemovePurchase={
          lotContext?.lot ? () => void deletePurchaseLot() : undefined
        }
      />

      <JournalFooterNav />
    </div>
  );
}
