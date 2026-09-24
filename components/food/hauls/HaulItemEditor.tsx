'use client';

import { useEffect, useState } from 'react';

import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { ItemManagementSection } from '@/components/food/itemManagement/ItemManagementSection';
import { PackageFields } from '@/components/food/itemManagement/PackageFields';
import { PurchaseDetailsSummary } from '@/components/food/itemManagement/PurchaseDetailsSummary';
import { planService } from '@/lib/plans';
import type { FoodSearchResult } from '@/lib/food/types';
import type {
  GroceryHaulItem,
  GroceryListPriceObservation,
} from '@/lib/plans/types';

import { sourceDemandLabel } from './presentation';
import { buildHaulItemPreparationPatch, validateHaulItemSave } from './haulItemSave';
import {
  type HaulPurchasingDraft,
  haulDraftFromItem,
  haulPurchasingHasDetails,
  haulPurchasingSummaryInput,
  haulSourcedPriceWouldClearOnSave,
} from './haulPurchasingDetails';
import { haulListQuoteCompatibleWithPreparedProduct } from '@/lib/plans/groceryHaul/haulListQuoteCompatibility';

export type HaulEditorSubpanel = 'main' | 'change_product' | 'manual_price' | 'source_quotes';

interface HaulItemEditorProps {
  haulId: string;
  haulCurrency: string;
  item: GroceryHaulItem | null;
  openInProductSearch?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

type ResolveCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

const INPUT_CLASS =
  'mt-1.5 w-full rounded-full border border-white/20 bg-transparent px-4 py-2.5 text-base text-white outline-none placeholder:text-white/30 focus:border-white/60 focus:ring-2 focus:ring-white/10 focus:ring-offset-0';

function FoodSearchResultsList({
  busy,
  results,
  disabled,
  onSelect,
}: {
  busy: boolean;
  results: ResolveCandidate[];
  disabled: boolean;
  onSelect: (candidate: ResolveCandidate) => void;
}) {
  if (busy) {
    return <p className="py-3 text-sm text-white/45">Searching…</p>;
  }
  if (results.length === 0) {
    return <p className="py-3 text-sm text-white/40">Search for a product.</p>;
  }
  return results.map((candidate) => (
    <button
      key={candidate.food.id}
      type="button"
      disabled={disabled}
      onClick={() => onSelect(candidate)}
      className="block w-full border-b border-white/[0.06] px-2 py-3 text-left last:border-0 hover:bg-white/[0.04]"
    >
      <span className="block text-sm text-white">
        {candidate.food.brandName
          ? `${candidate.food.brandName} — ${candidate.food.canonicalName}`
          : candidate.food.canonicalName}
      </span>
    </button>
  ));
}

function applyDraftPatch(
  draft: HaulPurchasingDraft,
  patch: Partial<HaulPurchasingDraft>,
): HaulPurchasingDraft {
  return { ...draft, ...patch };
}

export function HaulItemEditor({
  haulId,
  haulCurrency,
  item,
  openInProductSearch = false,
  onClose,
  onSaved,
}: HaulItemEditorProps) {
  const [draft, setDraft] = useState<HaulPurchasingDraft | null>(null);
  const [subpanel, setSubpanel] = useState<HaulEditorSubpanel>('main');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<ResolveCandidate[]>([]);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [listQuotes, setListQuotes] = useState<GroceryListPriceObservation[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualPriceIntent, setManualPriceIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setDraft(haulDraftFromItem(item));
    setManualPriceIntent(false);
    setSubpanel(openInProductSearch ? 'change_product' : 'main');
    setProductSearchQuery(item.product_title ?? item.name_snapshot);
    setProductSearchResults([]);
    setListQuotes([]);
    setError(null);
  }, [item, openInProductSearch]);

  useEffect(() => {
    if (!item || subpanel !== 'change_product') return;
    const query = productSearchQuery.trim();
    if (query.length < 2) {
      setProductSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingProduct(true);
      try {
        const params = new URLSearchParams({ q: query, limit: '8' });
        const response = await fetch(`/api/foods/search?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Product search failed.');
        const body = (await response.json()) as { results?: ResolveCandidate[] };
        setProductSearchResults(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setProductSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearchingProduct(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [item, subpanel, productSearchQuery]);

  useEffect(() => {
    if (!item || subpanel !== 'source_quotes' || !item.grocery_item_id) return;
    let cancelled = false;
    setQuotesLoading(true);
    void planService
      .getPersistentGroceryPriceQuotes(item.source_grocery_list_id)
      .then((bundle) => {
        if (cancelled) return;
        const pool = bundle.pool_by_item_id[item.grocery_item_id!] ?? [];
        setListQuotes(
          pool.filter((observation) =>
            haulListQuoteCompatibleWithPreparedProduct(observation, item, haulCurrency),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setListQuotes([]);
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, subpanel, haulCurrency]);

  if (!item || !draft) return null;

  const editableItem = item;

  const sourcedWouldClear = haulSourcedPriceWouldClearOnSave(editableItem, draft);
  const summaryInput = haulPurchasingSummaryInput(
    editableItem,
    draft,
    haulCurrency,
    manualPriceIntent,
  );
  const hasDetails = haulPurchasingHasDetails(draft);

  function updateDraft(patch: Partial<HaulPurchasingDraft>) {
    setDraft((current) => (current ? applyDraftPatch(current, patch) : current));
  }

  function selectProduct(candidate: ResolveCandidate) {
    updateDraft({
      selectedFoodObjectId: candidate.food.id,
      productTitle: candidate.food.canonicalName,
      brandName: candidate.food.brandName ?? '',
      purchaseUnit: candidate.food.servingUnit ?? '',
    });
    setSubpanel('main');
    setError(null);
  }

  function selectListQuote(observation: GroceryListPriceObservation) {
    setDraft((current) =>
      current
        ? {
            ...current,
            pendingSourcePriceObservationId: observation.id,
            priceAmount: '',
          }
        : current,
    );
    setManualPriceIntent(false);
    setSubpanel('main');
  }

  async function save() {
    if (saving || !draft) return;
    const validationError = validateHaulItemSave(editableItem, draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const patch = buildHaulItemPreparationPatch(editableItem, draft, { manualPriceIntent });
    if (!patch) {
      onClose();
      return;
    }
    const nextPackageSize = patch.package_size;
    const nextPackageCount = patch.package_count;
    if (
      (nextPackageSize != null && (typeof nextPackageSize !== 'number' || nextPackageSize <= 0))
      || (nextPackageCount != null && (typeof nextPackageCount !== 'number' || nextPackageCount <= 0))
    ) {
      setError('Package size and count must be positive when set.');
      return;
    }
    const nextPrice = patch.price_amount;
    if (
      nextPrice != null
      && (typeof nextPrice !== 'number' || !Number.isFinite(nextPrice) || nextPrice < 0)
    ) {
      setError('Price must be zero or greater.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await planService.updateGroceryHaulItem(haulId, editableItem.id, patch);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this Haul item.');
    } finally {
      setSaving(false);
    }
  }

  const panelTitle =
    subpanel === 'change_product'
      ? 'Change product'
      : subpanel === 'manual_price'
        ? 'Edit purchasing manually'
        : subpanel === 'source_quotes'
          ? 'Find / update price'
          : 'Edit Haul item';

  return (
    <ItemManagementDialog
      open={Boolean(item)}
      onClose={onClose}
      labelledBy="haul-item-editor-title"
      busy={saving}
      shell="workspace"
      footer={(
        <>
          {error && (
            <p className="mb-3 text-sm text-red-200" role="alert">{error}</p>
          )}
          {subpanel === 'main' ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm text-white/55"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : subpanel === 'manual_price' ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSubpanel('main')}
                disabled={saving}
                className="px-4 py-2 text-sm text-white/55"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  updateDraft({ pendingSourcePriceObservationId: null });
                  setSubpanel('main');
                }}
                disabled={saving}
                className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d]"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSubpanel('main')}
                disabled={saving}
                className="px-4 py-2 text-sm text-white/55"
              >
                Back
              </button>
            </div>
          )}
        </>
      )}
    >
      <p className="text-base text-white/45 lg:font-semibold">Haul item</p>
      <h2
        id="haul-item-editor-title"
        className="mt-2 text-[2.35rem] font-medium leading-tight text-white sm:text-[2.5rem] lg:mt-4 lg:text-[44px] lg:font-normal lg:leading-[44px]"
      >
        {panelTitle}
      </h2>

      {subpanel === 'main' && (
        <>
          <p className="mt-2 text-sm text-white/45">
            These purchasing details belong to this Haul only. The source List stays unchanged.
          </p>
          <ItemManagementSection title="Source need">
            <p className="text-lg font-semibold text-white">{editableItem.name_snapshot}</p>
            <p className="mt-1 text-xs text-white/45">{sourceDemandLabel(editableItem)}</p>
            <p className="mt-2 text-[11px] text-white/35">
              Source need snapshot is read-only provenance for this Haul.
            </p>
          </ItemManagementSection>
        </>
      )}

      {subpanel === 'change_product' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-white/45">
            Changes the prepared product for this Haul only, not the source List need.
          </p>
          <input
            autoFocus
            type="search"
            value={productSearchQuery}
            onChange={(event) => setProductSearchQuery(event.target.value)}
            placeholder="Search products"
            className={INPUT_CLASS}
          />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
            <FoodSearchResultsList
              busy={searchingProduct}
              results={productSearchResults}
              disabled={saving}
              onSelect={selectProduct}
            />
          </div>
        </div>
      )}

      {subpanel === 'source_quotes' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-white/45">
            Select a compatible price from the source List quote history. Provider search is not
            available in the Haul editor in this phase.
          </p>
          {!item.grocery_item_id ? (
            <p className="text-sm text-white/40">This item has no linked source List row.</p>
          ) : quotesLoading ? (
            <p className="text-sm text-white/45">Loading List quotes…</p>
          ) : listQuotes.length === 0 ? (
            <p className="text-sm text-white/40">No List price quotes found for this item.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {listQuotes.map((observation) => (
                <button
                  key={observation.id}
                  type="button"
                  disabled={saving}
                  onClick={() => selectListQuote(observation)}
                  className="block w-full rounded-xl border border-white/10 px-3 py-3 text-left hover:bg-white/[0.04]"
                >
                  <span className="block text-sm text-white">{observation.product_title}</span>
                  <span className="mt-1 block text-xs text-white/45">
                    {[observation.retailer, observation.postal_code].filter(Boolean).join(' · ')}
                    {' · '}
                    {observation.unit_price}
                    {observation.currency ? ` ${observation.currency}` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {subpanel === 'manual_price' && (
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs text-white/55">Product title</span>
            <input
              value={draft.productTitle}
              onChange={(event) => updateDraft({ productTitle: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/55">Brand</span>
            <input
              value={draft.brandName}
              onChange={(event) => updateDraft({ brandName: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/55">Purchase unit</span>
            <input
              value={draft.purchaseUnit}
              onChange={(event) => updateDraft({ purchaseUnit: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <PackageFields
            packageSize={draft.packageSize}
            packageUnit={draft.packageUnit}
            packageCount={draft.packageCount}
            onPackageSizeChange={(value) => updateDraft({ packageSize: value })}
            onPackageUnitChange={(value) => updateDraft({ packageUnit: value })}
            onPackageCountChange={(value) => updateDraft({ packageCount: value })}
            inputClassName={INPUT_CLASS}
          />
          <label className="block">
            <span className="text-xs text-white/55">Retailer</span>
            <input
              value={draft.retailer}
              onChange={(event) => updateDraft({ retailer: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/55">Store location</span>
            <input
              value={draft.storeLocation}
              onChange={(event) => updateDraft({ storeLocation: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/55">ZIP/postal</span>
            <input
              value={draft.postalCode}
              onChange={(event) => updateDraft({ postalCode: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/55">Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.priceAmount}
              onChange={(event) => {
                setManualPriceIntent(true);
                updateDraft({
                  priceAmount: event.target.value,
                  pendingSourcePriceObservationId: null,
                });
              }}
              className={INPUT_CLASS}
            />
          </label>
        </div>
      )}

      {subpanel === 'main' && (
        <div className="mt-6">
          <ItemManagementSection title="Purchasing">
            {sourcedWouldClear && (
              <p className="mb-3 text-xs text-amber-100/80" role="status">
                Sourced List price will clear when you save these context changes.
              </p>
            )}
            {hasDetails ? (
              <>
                <PurchaseDetailsSummary
                  details={summaryInput}
                  onEditManually={() => setSubpanel('manual_price')}
                  onFindUpdate={() => setSubpanel('source_quotes')}
                />
                <button
                  type="button"
                  onClick={() => setSubpanel('change_product')}
                  disabled={saving}
                  className="mt-3 rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
                >
                  Change product
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/45">
                  Choose a product, then add store and price details for this Haul trip.
                </p>
                <button
                  type="button"
                  onClick={() => setSubpanel('change_product')}
                  className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d]"
                >
                  Choose product
                </button>
                <button
                  type="button"
                  onClick={() => setSubpanel('manual_price')}
                  className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white hover:bg-white/[0.06]"
                >
                  Edit manually
                </button>
              </div>
            )}
          </ItemManagementSection>
        </div>
      )}
    </ItemManagementDialog>
  );
}
