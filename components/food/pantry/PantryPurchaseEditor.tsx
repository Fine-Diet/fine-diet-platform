'use client';

import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { PackageFields } from '@/components/food/itemManagement/PackageFields';
import { PurchaseDetailsSummary } from '@/components/food/itemManagement/PurchaseDetailsSummary';
import { PANTRY_EMBEDDED_SUMMARY_FORMAT } from '@/components/food/itemManagement/purchaseDetailsSummaryFormat';
import type {
  PantryProductSearchOffer,
  PantryProductSearchProvenance,
} from '@/lib/plans/pantryProductSearchTypes';
import type { PantryAcquisitionLot } from '@/lib/plans/types';

import { pantryPurchaseEditorIsDirty } from './pantryLotSave';
import { isPantryLotTerminal } from './pantryPolicy';
import { expectedShelfLifeDetailsProps } from './pantryExpectedShelfLifeDetails';
import { PantryProductLookupPanel } from './PantryProductLookupPanel';
import type { PantryLotDraft } from './pantryLotSave';

export type PurchaseDetailsMode = 'manual' | 'search';

export const PANTRY_PURCHASE_PILL_INPUT_CLASS =
  'mt-1.5 w-full rounded-full border border-white/20 bg-transparent px-4 py-2.5 text-base text-white outline-none placeholder:text-white/30 focus:border-white/60 focus:ring-2 focus:ring-white/10 focus:ring-offset-0';

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
  onRemovePurchase?: () => void;
  onResolvePurchase?: (outcome: 'completed' | 'disposed') => void;
  resolvingPurchase?: boolean;
}

const labelClass = 'text-[13px] text-white/50';

export function PantryPurchaseEditor({
  open,
  itemName,
  existingLot,
  lotForm,
  lotBusy,
  lotError,
  purchaseDetailsMode,
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
  onRemovePurchase,
  onResolvePurchase,
  resolvingPurchase = false,
}: PantryPurchaseEditorProps) {
  const pillInput = PANTRY_PURCHASE_PILL_INPUT_CLASS;
  const eyebrow = existingLot ? 'Edit purchase' : 'Add purchase';
  const readOnly = existingLot != null && isPantryLotTerminal(existingLot);
  const remainingQuantity = Number(lotForm.quantityRemaining);
  const canDiscardRemaining = Number.isFinite(remainingQuantity) && remainingQuantity > 0;
  const purchaseDraftDirty = existingLot != null
    && pantryPurchaseEditorIsDirty(existingLot, lotForm);
  const hasExactExpiration = Boolean(lotForm.expiresOn.trim());
  const shelfLifeDetailsProps = expectedShelfLifeDetailsProps(
    lotForm.expiresOn,
    lotForm.expectedShelfLifeDays,
  );

  const summaryDetails = {
    productTitle: lotForm.productTitle,
    brandName: lotForm.brandName,
    packageSize: lotForm.packageSize,
    packageUnit: lotForm.packageUnit,
    packageCount: lotForm.packageCount,
    retailer: lotForm.retailer,
    priceAmount: lotForm.priceAmount,
    currency: lotForm.currency,
  };

  function switchToSearch() {
    onOpenProductSearch();
    onSetPurchaseDetailsMode('search');
  }

  return (
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="purchase-editor-title"
      busy={lotBusy}
      shell="workspace"
      footer={(
        <>
          {lotError && (
            <p className="mb-3 text-sm text-red-200" role="alert">{lotError}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            {existingLot && onRemovePurchase ? (
              <button
                type="button"
                onClick={onRemovePurchase}
                disabled={lotBusy}
                className="text-sm text-red-200/75 hover:text-red-200 disabled:opacity-40"
              >
                Remove purchase
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
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
                disabled={lotBusy || readOnly}
                className="rounded-full bg-brand-50 px-5 py-2 text-sm font-semibold text-[#16110d] disabled:opacity-40"
              >
                {lotBusy ? 'Saving…' : existingLot ? 'Save' : 'Add purchase'}
              </button>
            </div>
          </div>
        </>
      )}
    >
      <p className="text-base text-white/45">{eyebrow}</p>
      <h2
        id="purchase-editor-title"
        className="mt-2 text-[2.35rem] font-medium leading-tight text-white sm:text-[2.5rem]"
      >
        {itemName}
      </h2>

      <div className="mt-10 space-y-10">
        <section className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Purchased on</span>
              <input
                type="date"
                value={lotForm.acquiredOn}
                onChange={(event) => onUpdateLotForm({ acquiredOn: event.target.value })}
                disabled={readOnly}
                className={pillInput}
              />
            </label>
            <label>
              <span className={labelClass}>Expiration date</span>
              <input
                type="date"
                value={lotForm.expiresOn}
                onChange={(event) => onUpdateLotForm({ expiresOn: event.target.value })}
                disabled={readOnly}
                className={pillInput}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <label>
              <span className={labelClass}>Amount acquired</span>
              <input
                type="number"
                min="0.01"
                step="any"
                value={lotForm.quantityAcquired}
                onChange={(event) => onUpdateAcquiredQuantity(event.target.value)}
                disabled={readOnly}
                className={pillInput}
              />
            </label>
            <label>
              <span className={labelClass}>Remaining</span>
              <input
                type="number"
                min="0"
                step="any"
                value={lotForm.quantityRemaining}
                onChange={(event) => onUpdateLotForm({ quantityRemaining: event.target.value })}
                disabled={readOnly}
                className={pillInput}
              />
            </label>
            <label>
              <span className={labelClass}>Unit</span>
              <input
                value={lotForm.unit}
                onChange={(event) => onUpdateLotForm({ unit: event.target.value })}
                disabled={readOnly}
                className={pillInput}
              />
            </label>
          </div>
          <details
            className="group"
            {...(readOnly ? { open: false } : shelfLifeDetailsProps)}
          >
            <summary
              className={`text-sm select-none ${
                readOnly ? 'cursor-default text-white/35' : 'cursor-pointer'
              } ${hasExactExpiration ? 'text-white/35' : 'text-white/50'}`}
            >
              * Don&apos;t know the exact date? Use expected shelf life
            </summary>
            <label className="mt-3 block max-w-xs">
              <span className="sr-only">Expected shelf life in days</span>
              <input
                type="number"
                min="1"
                step="1"
                value={lotForm.expectedShelfLifeDays}
                onChange={(event) => onUpdateLotForm({
                  expectedShelfLifeDays: event.target.value,
                })}
                disabled={readOnly}
                className={pillInput}
              />
            </label>
          </details>
        </section>

        <section>
          <h3 className="text-2xl font-medium text-white">
            Product &amp; purchase details
          </h3>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/15">
            <PurchaseDetailsSummary
              variant="embedded"
              details={summaryDetails}
              formatOptions={PANTRY_EMBEDDED_SUMMARY_FORMAT}
            />
            <div
              className="grid grid-cols-2 border-y border-white/10"
              role="tablist"
              aria-label="Product details entry mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={purchaseDetailsMode === 'manual'}
                onClick={() => onSetPurchaseDetailsMode('manual')}
                className={
                  purchaseDetailsMode === 'manual'
                    ? 'bg-white/15 py-3 text-center text-base font-medium text-white'
                    : 'bg-transparent py-3 text-center text-base text-white/45 hover:text-white/70'
                }
              >
                Edit manually
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={purchaseDetailsMode === 'search'}
                onClick={switchToSearch}
                disabled={readOnly}
                className={
                  purchaseDetailsMode === 'search'
                    ? 'bg-white/15 py-3 text-center text-base font-medium text-white'
                    : 'bg-transparent py-3 text-center text-base text-white/45 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40'
                }
              >
                Find / update details
              </button>
            </div>
            <div className="bg-white/[0.03] px-4 py-5 sm:px-5">
              {purchaseDetailsMode === 'manual' || readOnly ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                    <label className="sm:col-span-2">
                      <span className={labelClass}>Product title</span>
                      <input
                        value={lotForm.productTitle}
                        onChange={(event) => onUpdateLotForm({ productTitle: event.target.value })}
                        disabled={readOnly}
                        className={pillInput}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>Brand (optional)</span>
                      <input
                        value={lotForm.brandName}
                        onChange={(event) => onUpdateLotForm({ brandName: event.target.value })}
                        disabled={readOnly}
                        className={pillInput}
                      />
                    </label>
                  </div>
                  <PackageFields
                    packageSize={lotForm.packageSize}
                    packageUnit={lotForm.packageUnit}
                    packageCount={lotForm.packageCount}
                    onPackageSizeChange={(value) => onUpdateLotForm({ packageSize: value })}
                    onPackageUnitChange={(value) => onUpdateLotForm({ packageUnit: value })}
                    onPackageCountChange={(value) => onUpdateLotForm({ packageCount: value })}
                    inputClassName={pillInput}
                    disabled={readOnly}
                  />
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                    <label className="sm:col-span-2">
                      <span className={labelClass}>Purchased at</span>
                      <input
                        value={lotForm.retailer}
                        onChange={(event) => onUpdateLotForm({ retailer: event.target.value })}
                        disabled={readOnly}
                        className={pillInput}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>Price</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lotForm.priceAmount}
                        onChange={(event) => onUpdateLotForm({ priceAmount: event.target.value })}
                        disabled={readOnly}
                        className={pillInput}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <PantryProductLookupPanel
                  variant="embedded"
                  inputClassName={pillInput}
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
                />
              )}
            </div>
          </div>
        </section>

        {existingLot && !readOnly && onResolvePurchase && (
          <div className="border-t border-white/10 pt-5">
            <p className="text-xs text-white/40">End this purchase record</p>
            {purchaseDraftDirty && (
              <p className="mt-1 text-xs text-white/45">
                Save changes before resolving this purchase.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={lotBusy || resolvingPurchase || purchaseDraftDirty}
                onClick={() => onResolvePurchase('completed')}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/35 disabled:opacity-40"
              >
                Mark completed / used
              </button>
              {canDiscardRemaining && (
                <button
                  type="button"
                  disabled={lotBusy || resolvingPurchase || purchaseDraftDirty}
                  onClick={() => onResolvePurchase('disposed')}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:border-white/35 disabled:opacity-40"
                >
                  Discard remaining
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ItemManagementDialog>
  );
}
