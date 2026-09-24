'use client';

import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { ItemManagementSection } from '@/components/food/itemManagement/ItemManagementSection';
import { PackageFields } from '@/components/food/itemManagement/PackageFields';
import { PurchaseDetailsSummary } from '@/components/food/itemManagement/PurchaseDetailsSummary';
import type {
  GroceryListPriceObservation,
  GroceryListPurchasingChoice,
} from '@/lib/plans/types';
import type { FoodSearchResult } from '@/lib/food/types';

import { isGroceryPrimaryProductChoiceCandidate } from '@/lib/plans/groceryListAddIntent';
import { groceryListNeedUnitPlaceholder } from '@/lib/plans/groceryListNeedQuantity';

import {
  listsPurchasingHasChoice,
  listsPurchasingSummaryInput,
} from './listsPurchasingDetails';

export type ListsEditorSubpanel = 'main' | 'change_need' | 'change_product' | 'manual_price';

type ResolveCandidate = Pick<FoodSearchResult, 'food' | 'source' | 'source_label'>;

const INPUT_CLASS =
  'mt-1.5 w-full rounded-full border border-white/20 bg-transparent px-4 py-2.5 text-base text-white outline-none placeholder:text-white/30 focus:border-white/60 focus:ring-2 focus:ring-white/10 focus:ring-offset-0';

export interface ListsManualPriceDraft {
  productTitle: string;
  purchaseQuantity: string;
  purchaseUnit: string;
  retailer: string;
  packageSize: string;
  packageUnit: string;
  packageCount: string;
  unitPrice: string;
}

export interface ListsItemEditorProps {
  open: boolean;
  needName: string;
  needResolved: boolean;
  unresolvedNeedName: string;
  onUnresolvedNeedNameChange: (value: string) => void;
  quantity: string;
  onQuantityChange: (value: string) => void;
  unit: string;
  onUnitChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  choice: GroceryListPurchasingChoice | undefined;
  price: GroceryListPriceObservation | undefined;
  hasPurchasingChoice: boolean;
  subpanel: ListsEditorSubpanel;
  onSubpanelChange: (panel: ListsEditorSubpanel) => void;
  needSearchQuery: string;
  onNeedSearchQueryChange: (value: string) => void;
  needSearchResults: ResolveCandidate[];
  needSearchBusy: boolean;
  productSearchQuery: string;
  onProductSearchQueryChange: (value: string) => void;
  productSearchResults: ResolveCandidate[];
  productSearchBusy: boolean;
  manualDraft: ListsManualPriceDraft;
  onManualDraftChange: (patch: Partial<ListsManualPriceDraft>) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onRemoveFromList: () => void;
  onSelectNeedCandidate: (candidate: ResolveCandidate) => void;
  onSelectProductCandidate: (candidate: ResolveCandidate) => void;
  onOpenPriceSearch: () => void;
  onSaveManualPrice: () => void;
}

function needResolveLabel(candidate: ResolveCandidate): string {
  return candidate.food.canonicalName;
}

function productChoiceLabel(candidate: ResolveCandidate): string {
  const food = candidate.food;
  if (food.brandName?.trim()) {
    return `${food.brandName.trim()} — ${food.canonicalName}`;
  }
  return food.canonicalName;
}

function NeedResolveResultsList({
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
    return <p className="py-3 text-sm text-white/45">Searching foods…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="py-3 text-sm text-white/40">
        Search for the food you need (common ingredients and your foods — not store products).
      </p>
    );
  }
  return results.map((candidate) => (
    <button
      key={candidate.food.id}
      type="button"
      disabled={disabled}
      onClick={() => onSelect(candidate)}
      className="block w-full border-b border-white/[0.06] px-3 py-3 text-left last:border-0 hover:bg-white/[0.04]"
    >
      <span className="block text-sm font-medium text-white">{needResolveLabel(candidate)}</span>
      <span className="mt-0.5 block text-[11px] text-white/40">Requested need</span>
      <span className="block text-xs text-white/30">
        {candidate.source_label ?? candidate.source}
      </span>
    </button>
  ));
}

function ProductChoiceResultsList({
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
    return <p className="py-3 text-sm text-white/45">Searching products…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="py-3 text-sm text-white/40">
        Search by brand, UPC, or package label first. Generic options appear below when needed. This
        does not change the need.
      </p>
    );
  }

  const fallbackStart = results.findIndex(
    (candidate) =>
      !isGroceryPrimaryProductChoiceCandidate(candidate as FoodSearchResult),
  );

  return results.map((candidate, index) => (
    <div key={candidate.food.id}>
      {fallbackStart === index && (
        <p className="border-t border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
          Generic purchasing fallback
        </p>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(candidate)}
        className="block w-full border-b border-white/[0.06] px-3 py-3 text-left last:border-0 hover:bg-white/[0.04]"
      >
        <span className="block text-sm font-medium text-white">{productChoiceLabel(candidate)}</span>
        <span className="mt-0.5 block text-[11px] text-denim-200/80">
          {isGroceryPrimaryProductChoiceCandidate(candidate as FoodSearchResult)
            ? 'Purchasing product'
            : 'Generic product option'}
        </span>
        <span className="block text-xs text-white/30">
          {candidate.food.upc
            ? `UPC ${candidate.food.upc}`
            : candidate.source_label ?? candidate.source}
        </span>
      </button>
    </div>
  ));
}

export function ListsItemEditor({
  open,
  needName,
  needResolved,
  unresolvedNeedName,
  onUnresolvedNeedNameChange,
  quantity,
  onQuantityChange,
  unit,
  onUnitChange,
  notes,
  onNotesChange,
  choice,
  price,
  hasPurchasingChoice,
  subpanel,
  onSubpanelChange,
  needSearchQuery,
  onNeedSearchQueryChange,
  needSearchResults,
  needSearchBusy,
  productSearchQuery,
  onProductSearchQueryChange,
  productSearchResults,
  productSearchBusy,
  manualDraft,
  onManualDraftChange,
  busy,
  error,
  onClose,
  onSave,
  onRemoveFromList,
  onSelectNeedCandidate,
  onSelectProductCandidate,
  onOpenPriceSearch,
  onSaveManualPrice,
}: ListsItemEditorProps) {
  const hasPurchasing = listsPurchasingHasChoice(choice, price);
  const summaryInput = listsPurchasingSummaryInput(choice, price);

  const title =
    subpanel === 'change_need'
      ? 'Change need'
      : subpanel === 'change_product'
        ? 'Change product'
        : subpanel === 'manual_price'
          ? 'Edit purchasing manually'
          : 'Edit list item';

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="lists-item-editor-title"
      busy={busy}
      shell="workspace"
      footer={(
        <>
          {error && (
            <p className="mb-3 text-sm text-red-200" role="alert">{error}</p>
          )}
          {subpanel === 'main' ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onRemoveFromList}
                disabled={busy}
                className="text-sm text-red-200/75 hover:text-red-200 disabled:opacity-40"
              >
                Remove from List
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="px-4 py-2 text-sm text-white/55"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={busy}
                  className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : subpanel === 'manual_price' ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSubpanelChange('main')}
                disabled={busy}
                className="px-4 py-2 text-sm text-white/55"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onSaveManualPrice}
                disabled={busy}
                className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save price'}
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onSubpanelChange('main')}
                disabled={busy}
                className="px-4 py-2 text-sm text-white/55"
              >
                Back
              </button>
            </div>
          )}
        </>
      )}
    >
      <p className="text-base text-white/45 lg:font-semibold">List item</p>
      <h2
        id="lists-item-editor-title"
        className="mt-2 text-[2.35rem] font-medium leading-tight text-white sm:text-[2.5rem] lg:mt-4 lg:text-[44px] lg:font-normal lg:leading-[44px]"
      >
        {title}
      </h2>
      {subpanel === 'main' && (
        <p className="mt-2 text-sm text-white/45">
          Need identity stays separate from the purchasing product you shop for.
        </p>
      )}

      {subpanel === 'change_need' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-white/45">
            Resolve what food is required. Common foods and your foods only — not store SKUs.
          </p>
          <input
            autoFocus
            type="search"
            value={needSearchQuery}
            onChange={(event) => onNeedSearchQueryChange(event.target.value)}
            placeholder="e.g. blueberries, chicken breast"
            className={INPUT_CLASS}
          />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
            <NeedResolveResultsList
              busy={needSearchBusy}
              results={needSearchResults}
              disabled={busy}
              onSelect={onSelectNeedCandidate}
            />
          </div>
        </div>
      )}

      {subpanel === 'change_product' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-white/45">
            Need stays “{needName}”. Pick the branded or packaged product you intend to buy.
          </p>
          <input
            autoFocus
            type="search"
            value={productSearchQuery}
            onChange={(event) => onProductSearchQueryChange(event.target.value)}
            placeholder="e.g. brand name, UPC, package label"
            className={INPUT_CLASS}
          />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
            <ProductChoiceResultsList
              busy={productSearchBusy}
              results={productSearchResults}
              disabled={busy}
              onSelect={onSelectProductCandidate}
            />
          </div>
        </div>
      )}

      {subpanel === 'manual_price' && (
        <div className="mt-6 space-y-4">
          {!hasPurchasingChoice && (
            <p className="text-sm text-amber-100/80" role="status">
              Choose a product before editing purchase quantity or unit.
            </p>
          )}
          <label className="block">
            <span className="text-xs text-white/55">Product title</span>
            <input
              value={manualDraft.productTitle}
              onChange={(event) => onManualDraftChange({ productTitle: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs text-white/55">Purchase quantity</span>
              <input
                value={manualDraft.purchaseQuantity}
                onChange={(event) => onManualDraftChange({ purchaseQuantity: event.target.value })}
                disabled={!hasPurchasingChoice || busy}
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <span className="text-xs text-white/55">Purchase unit</span>
              <input
                value={manualDraft.purchaseUnit}
                onChange={(event) => onManualDraftChange({ purchaseUnit: event.target.value })}
                disabled={!hasPurchasingChoice || busy}
                className={INPUT_CLASS}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-white/55">Retailer</span>
            <input
              value={manualDraft.retailer}
              onChange={(event) => onManualDraftChange({ retailer: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <PackageFields
            packageSize={manualDraft.packageSize}
            packageUnit={manualDraft.packageUnit}
            packageCount={manualDraft.packageCount}
            onPackageSizeChange={(value) => onManualDraftChange({ packageSize: value })}
            onPackageUnitChange={(value) => onManualDraftChange({ packageUnit: value })}
            onPackageCountChange={(value) => onManualDraftChange({ packageCount: value })}
            inputClassName={INPUT_CLASS}
          />
          <label className="block">
            <span className="text-xs text-white/55">Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={manualDraft.unitPrice}
              onChange={(event) => onManualDraftChange({ unitPrice: event.target.value })}
              className={INPUT_CLASS}
            />
          </label>
        </div>
      )}

      {subpanel === 'main' && (
        <div className="mt-6 space-y-6">
          <ItemManagementSection title="Need">
            {needResolved ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-lg font-semibold text-white">{needName}</p>
                <button
                  type="button"
                  onClick={() => onSubpanelChange('change_need')}
                  disabled={busy}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
                >
                  Change need
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-white/55">Requested need</span>
                  <input
                    value={unresolvedNeedName}
                    onChange={(event) => onUnresolvedNeedNameChange(event.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onSubpanelChange('change_need')}
                  disabled={busy}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
                >
                  Set need from search
                </button>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <span className="text-xs text-white/55">Quantity</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(event) => onQuantityChange(event.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
              <label>
                <span className="text-xs text-white/55">Unit</span>
                <input
                  value={unit}
                  onChange={(event) => onUnitChange(event.target.value)}
                  placeholder={groceryListNeedUnitPlaceholder()}
                  className={INPUT_CLASS}
                />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-white/35">
              Leave unit blank to count the need in items; set cup, lb, etc. when you need a measure.
            </p>
            <details className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <summary className="cursor-pointer text-xs text-white/55 select-none">
                More details
              </summary>
              <label className="mt-2 block">
                <span className="text-xs text-white/55">Notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  rows={2}
                  className={INPUT_CLASS}
                />
              </label>
            </details>
          </ItemManagementSection>

          <ItemManagementSection title="Purchasing">
            {hasPurchasing ? (
              <>
                <PurchaseDetailsSummary
                  details={summaryInput}
                  onEditManually={() => onSubpanelChange('manual_price')}
                  onFindUpdate={onOpenPriceSearch}
                />
                <button
                  type="button"
                  onClick={() => onSubpanelChange('change_product')}
                  disabled={busy}
                  className="mt-3 rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
                >
                  Change product
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/45">
                  Choose a purchasing product for this need, then add price when ready.
                </p>
                <button
                  type="button"
                  onClick={() => onSubpanelChange('change_product')}
                  disabled={busy}
                  className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] hover:bg-white disabled:opacity-40"
                >
                  Choose product
                </button>
              </div>
            )}
          </ItemManagementSection>
        </div>
      )}
    </ItemManagementDialog>
  );
}
