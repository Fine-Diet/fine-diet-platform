'use client';

import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { ItemManagementSection } from '@/components/food/itemManagement/ItemManagementSection';
import { PackageFields } from '@/components/food/itemManagement/PackageFields';
import { PurchaseDetailsSummary } from '@/components/food/itemManagement/PurchaseDetailsSummary';
import type {
  PantryProductSearchOffer,
  PantryProductSearchProvenance,
} from '@/lib/plans/pantryProductSearchTypes';
import type { PantryAcquisitionLot } from '@/lib/plans/types';

import { PantryProductLookupPanel } from './PantryProductLookupPanel';
import type { PantryLotDraft } from './pantryLotSave';

export type PurchaseDetailsMode = 'summary' | 'manual' | 'search';

export interface PantryPurchaseEditorProps {
  open: boolean;
  itemName: string;
  existingLot: PantryAcquisitionLot | null;
  lotForm: PantryLotDraft;
  lotBusy: boolean;
  lotError: string | null;
  purchaseDetailsMode: PurchaseDetailsMode;
  inputClassName: string;
  productSearchQuery: string;
  onProductSearchQueryChange: (value: string) => void;
  productSearchPostal: string;
  onProductSearchPostalChange: (value: string) => void;
  onProductSearchPostalBlur: () => void;
  productSearchRetailer: string;
  onProductSearchRetailerChange: (value: string) => void;
  productSearchPostalTouched: boolean;
  productSearchPostalValidation: { ok: boolean; message?: string; value?: string };
  productSearchCanSubmit: boolean;
  productSearchState:
    | 'idle'
    | 'searching'
    | 'results'
    | 'zero_results'
    | 'error'
    | 'quota_exceeded';
  productSearchScopeLabel: (postalCode: string, retailer: string) => string;
  productSearchOffers: PantryProductSearchOffer[];
  productSearchError: string | null;
  productSearchProvenance: PantryProductSearchProvenance | null;
  onClose: () => void;
  onSave: () => void;
  onUpdateLotForm: (patch: Partial<PantryLotDraft>) => void;
  onUpdateAcquiredQuantity: (value: string) => void;
  onSetPurchaseDetailsMode: (mode: PurchaseDetailsMode) => void;
  onOpenProductSearch: () => void;
  onRunProductSearch: () => void;
  onSelectProductOffer: (offer: PantryProductSearchOffer) => void;
}

export function PantryPurchaseEditor({
  open,
  itemName,
  existingLot,
  lotForm,
  lotBusy,
  lotError,
  purchaseDetailsMode,
  inputClassName,
  productSearchQuery,
  onProductSearchQueryChange,
  productSearchPostal,
  onProductSearchPostalChange,
  onProductSearchPostalBlur,
  productSearchRetailer,
  onProductSearchRetailerChange,
  productSearchPostalTouched,
  productSearchPostalValidation,
  productSearchCanSubmit,
  productSearchState,
  productSearchScopeLabel,
  productSearchOffers,
  productSearchError,
  productSearchProvenance,
  onClose,
  onSave,
  onUpdateLotForm,
  onUpdateAcquiredQuantity,
  onSetPurchaseDetailsMode,
  onOpenProductSearch,
  onRunProductSearch,
  onSelectProductOffer,
}: PantryPurchaseEditorProps) {
  const eyebrow = existingLot ? 'Edit purchase' : 'Add purchase';
  const hasExactExpiration = Boolean(lotForm.expiresOn.trim());

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="purchase-editor-title"
      busy={lotBusy}
      footer={(
        <>
          {lotError && (
            <p className="mb-3 text-sm text-red-200" role="alert">{lotError}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/25" aria-hidden="true">
              {/* Destructive lot delete deferred — no API in Phase 1 */}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={lotBusy}
                className="px-4 py-2 text-sm text-white/55"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={lotBusy}
                className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40"
              >
                {lotBusy ? 'Saving…' : existingLot ? 'Save' : 'Add purchase'}
              </button>
            </div>
          </div>
        </>
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">
        {eyebrow}
      </p>
      <h2 id="purchase-editor-title" className="mt-1 text-2xl font-semibold text-white">
        {itemName}
      </h2>
      <p className="mt-2 text-sm text-white/45">
        Purchase details do not change your total on-hand amount.
      </p>

      <div className="mt-6 space-y-6">
        <ItemManagementSection title="Purchase">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs text-white/55">Purchased on</span>
              <input
                type="date"
                value={lotForm.acquiredOn}
                onChange={(event) => onUpdateLotForm({ acquiredOn: event.target.value })}
                className={inputClassName}
              />
            </label>
            <label>
              <span className="text-xs text-white/55">Expiration date</span>
              <input
                type="date"
                value={lotForm.expiresOn}
                onChange={(event) => onUpdateLotForm({ expiresOn: event.target.value })}
                className={inputClassName}
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs text-white/55">Amount acquired</span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={lotForm.quantityAcquired}
                onChange={(event) => onUpdateAcquiredQuantity(event.target.value)}
                className={inputClassName}
              />
            </label>
            <label>
              <span className="text-xs text-white/55">Unit</span>
              <input
                value={lotForm.unit}
                onChange={(event) => onUpdateLotForm({ unit: event.target.value })}
                className={inputClassName}
              />
            </label>
          </div>
          <details
            className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
            open={!hasExactExpiration && Boolean(lotForm.expectedShelfLifeDays.trim())}
          >
            <summary
              className={`cursor-pointer text-xs select-none ${
                hasExactExpiration ? 'text-white/35' : 'text-white/55'
              }`}
            >
              Expected shelf life
              {hasExactExpiration ? ' (fallback when no expiration date)' : ''}
            </summary>
            <label className="mt-2 block">
              <span className="sr-only">Expected shelf life in days</span>
              <input
                type="number"
                min="1"
                step="1"
                value={lotForm.expectedShelfLifeDays}
                onChange={(event) => onUpdateLotForm({
                  expectedShelfLifeDays: event.target.value,
                })}
                className={inputClassName}
              />
            </label>
          </details>
        </ItemManagementSection>

        <ItemManagementSection title="Product & purchase details">
          {purchaseDetailsMode === 'summary' && (
            <PurchaseDetailsSummary
              details={{
                productTitle: lotForm.productTitle,
                brandName: lotForm.brandName,
                packageSize: lotForm.packageSize,
                packageUnit: lotForm.packageUnit,
                packageCount: lotForm.packageCount,
                retailer: lotForm.retailer,
                priceAmount: lotForm.priceAmount,
                currency: lotForm.currency,
              }}
              onEditManually={() => onSetPurchaseDetailsMode('manual')}
              onFindUpdate={() => {
                onOpenProductSearch();
                onSetPurchaseDetailsMode('search');
              }}
            />
          )}
          {purchaseDetailsMode === 'manual' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onSetPurchaseDetailsMode('summary')}
                  className="text-xs font-medium text-white/45 hover:text-white"
                >
                  Back to summary
                </button>
              </div>
              <label className="block">
                <span className="text-xs text-white/55">Product title</span>
                <input
                  value={lotForm.productTitle}
                  onChange={(event) => onUpdateLotForm({ productTitle: event.target.value })}
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/55">Brand</span>
                <input
                  value={lotForm.brandName}
                  onChange={(event) => onUpdateLotForm({ brandName: event.target.value })}
                  className={inputClassName}
                />
              </label>
              <PackageFields
                packageSize={lotForm.packageSize}
                packageUnit={lotForm.packageUnit}
                packageCount={lotForm.packageCount}
                onPackageSizeChange={(value) => onUpdateLotForm({ packageSize: value })}
                onPackageUnitChange={(value) => onUpdateLotForm({ packageUnit: value })}
                onPackageCountChange={(value) => onUpdateLotForm({ packageCount: value })}
                inputClassName={inputClassName}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-xs text-white/55">Purchased at</span>
                  <input
                    value={lotForm.retailer}
                    onChange={(event) => onUpdateLotForm({ retailer: event.target.value })}
                    className={inputClassName}
                  />
                </label>
                <label>
                  <span className="text-xs text-white/55">Price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={lotForm.priceAmount}
                    onChange={(event) => onUpdateLotForm({ priceAmount: event.target.value })}
                    className={inputClassName}
                  />
                </label>
              </div>
            </div>
          )}
          {purchaseDetailsMode === 'search' && (
            <PantryProductLookupPanel
              inputClassName={inputClassName}
              productSearchQuery={productSearchQuery}
              onProductSearchQueryChange={onProductSearchQueryChange}
              productSearchPostal={productSearchPostal}
              onProductSearchPostalChange={onProductSearchPostalChange}
              onProductSearchPostalBlur={onProductSearchPostalBlur}
              productSearchRetailer={productSearchRetailer}
              onProductSearchRetailerChange={onProductSearchRetailerChange}
              productSearchPostalTouched={productSearchPostalTouched}
              productSearchPostalValidation={productSearchPostalValidation}
              productSearchCanSubmit={productSearchCanSubmit}
              productSearchState={productSearchState}
              productSearchScopeLabel={productSearchScopeLabel}
              productSearchOffers={productSearchOffers}
              productSearchError={productSearchError}
              productSearchProvenance={productSearchProvenance}
              onSearch={onRunProductSearch}
              onSelectOffer={onSelectProductOffer}
              onBackToSummary={() => onSetPurchaseDetailsMode('summary')}
            />
          )}
        </ItemManagementSection>
      </div>
    </ItemManagementDialog>
  );
}
