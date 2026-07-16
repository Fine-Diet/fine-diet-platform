'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { GroceryItem } from '@/lib/plans/types';
import type {
  GroceryHaulSummary,
  GroceryPriceObservation,
  GroceryPriceSearchOffer,
  GroceryPriceSearchQuota,
  GroceryPriceSearchResult,
} from '@/lib/plans/groceryPricingTypes';
import {
  formatGroceryCurrency,
  formatGroceryHaulCoverage,
  formatGroceryHaulSummaryHeadline,
  formatGroceryPriceQuotaMessage,
} from '@/lib/plans/groceryPricingFormat';
import { formatAvailablePackageLabel } from '@/lib/plans/groceryPricePackageDetails';
import {
  GroceryPriceQuotaExceededClientError,
  GroceryPriceManualReplaceRequiredError,
  loadGroceryPriceSearchPrefs,
  saveGroceryPriceSearchPrefs,
} from '@/lib/plans/groceryPricingClient';
import {
  canShowMoreOffers,
  GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS,
  sliceOffersForDisplay,
} from '@/lib/plans/groceryPricingOfferDisplay';

type PricePanelStep = 'search' | 'offers' | 'manual' | 'replace-manual';

export function GroceryHaulSummaryCard({
  summary,
  loading,
  error,
  onRefresh,
}: {
  summary: GroceryHaulSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-2xl bg-denim-500/10 border border-denim-400/20 overflow-hidden">
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-denim-200/80 antialiased">
            Haul estimate
          </p>
          {loading ? (
            <p className="text-sm text-white/45 antialiased mt-1">Loading prices…</p>
          ) : error ? (
            <p className="text-sm text-red-200 antialiased mt-1">{error}</p>
          ) : summary ? (
            <>
              <p className="text-lg font-semibold text-white antialiased mt-0.5">
                {formatGroceryHaulSummaryHeadline(summary)}
              </p>
              <p className="text-[11px] text-white/45 antialiased mt-0.5">
                {formatGroceryHaulCoverage(summary)}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/45 antialiased mt-1">No price data yet.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-[10px] text-denim-200/80 hover:text-denim-100 disabled:text-white/20 antialiased mt-0.5"
        >
          Refresh
        </button>
      </div>
      {summary && !loading && !error && (
        <div className="px-3 pb-3 space-y-1">
          {summary.is_incomplete_estimate && (
            <p className="text-[10px] text-amber-200/80 antialiased">
              Partial estimate — some eligible items are not priced yet.
            </p>
          )}
          {summary.confidence_summary && (
            <p className="text-[10px] text-white/35 antialiased">{summary.confidence_summary}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/30 antialiased">
            <span>Manual: {formatGroceryCurrency(summary.manual_subtotal, summary.currency)}</span>
            <span>Sourced: {formatGroceryCurrency(summary.sourced_subtotal, summary.currency)}</span>
            {summary.stale_item_count > 0 && (
              <span>{summary.stale_item_count} stale price{summary.stale_item_count === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GroceryPriceQuotaBanner({
  quota,
}: {
  quota: GroceryPriceSearchQuota | null;
}) {
  if (!quota) return null;

  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        quota.upgrade_required
          ? 'bg-amber-500/10 border-amber-500/25'
          : 'bg-white/[0.03] border-white/10'
      }`}
    >
      <p
        className={`text-[11px] antialiased ${
          quota.upgrade_required ? 'text-amber-100/90' : 'text-white/50'
        }`}
      >
        {formatGroceryPriceQuotaMessage(quota)}
      </p>
      {quota.upgrade_required && (
        <Link
          href="/upgrade"
          className="inline-block mt-1.5 text-[11px] font-medium text-denim-200 hover:text-denim-100 antialiased"
        >
          View upgrade options →
        </Link>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  selected,
  onSelect,
}: {
  offer: GroceryPriceSearchOffer;
  selected: boolean;
  onSelect: () => void;
}) {
  const availablePackage = formatAvailablePackageLabel(offer.package_size, offer.package_unit);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl px-3 py-2 transition-colors ${
        selected ? 'bg-denim-500/20 border border-denim-400/30' : 'hover:bg-white/[0.05] border border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-white antialiased">{offer.title}</p>
        <p className="text-sm font-medium text-denim-200 antialiased flex-shrink-0">
          {formatGroceryCurrency(offer.price, offer.currency)}
        </p>
      </div>
      <p className="text-[10px] text-white/35 antialiased mt-0.5">
        {offer.retailer}
        {offer.location_label ? ` · ${offer.location_label}` : ''}
        {availablePackage ? ` · Available ${availablePackage}` : ''}
      </p>
      {offer.match_reasons.length > 0 && (
        <p className="text-[10px] text-white/25 antialiased mt-0.5">
          {offer.match_reasons.slice(0, 2).join(' · ')}
        </p>
      )}
    </button>
  );
}

export function GroceryPricePanel({
  item,
  currentObservation = null,
  entryMode = 'search',
  busy,
  onClose,
  onSearch,
  onConfirmOffer,
  onSaveManual,
  onQuotaUpdate,
  onObservationSaved,
}: {
  item: GroceryItem;
  currentObservation?: GroceryPriceObservation | null;
  entryMode?: 'search' | 'manual-only';
  busy: boolean;
  onClose: () => void;
  onSearch?: (input: { retailer: string; postal_code: string }) => Promise<GroceryPriceSearchResult>;
  onConfirmOffer?: (input: {
    search_event_id: string;
    provider_result_id: string;
    package_count: number;
    replace_manual?: boolean;
  }) => Promise<GroceryPriceObservation>;
  onSaveManual: (input: {
    retailer?: string | null;
    postal_code?: string | null;
    product_title?: string | null;
    unit_price: number;
    currency?: string;
    package_count?: number;
  }) => Promise<GroceryPriceObservation>;
  onQuotaUpdate?: (quota: GroceryPriceSearchQuota | null) => void;
  onObservationSaved: (observation: GroceryPriceObservation) => void;
}) {
  const manualOnly = entryMode === 'manual-only';
  const prefs = loadGroceryPriceSearchPrefs();
  const [step, setStep] = useState<PricePanelStep>(manualOnly ? 'manual' : 'search');
  const [retailer, setRetailer] = useState(prefs.retailer);
  const [postalCode, setPostalCode] = useState(prefs.postal_code);
  const [searchResult, setSearchResult] = useState<GroceryPriceSearchResult | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [packageCount, setPackageCount] = useState('1');
  const [manualUnitPrice, setManualUnitPrice] = useState('');
  const [manualProductTitle, setManualProductTitle] = useState(item.name);
  const [manualRetailer, setManualRetailer] = useState(prefs.retailer);
  const [manualPostalCode, setManualPostalCode] = useState(prefs.postal_code);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [offersExpanded, setOffersExpanded] = useState(false);
  const [pendingReplaceObservation, setPendingReplaceObservation] =
    useState<GroceryPriceObservation | null>(null);

  const confirmableOffers = (searchResult?.offers ?? []).slice(0, GROCERY_PRICE_MAX_CONFIRMABLE_OFFERS);
  const visibleOffers = sliceOffersForDisplay(confirmableOffers, offersExpanded);
  const selectedOffer = confirmableOffers.find(
    (offer) => offer.provider_result_id === selectedOfferId,
  ) ?? null;
  const manualObservationForReplace = pendingReplaceObservation ?? (
    currentObservation?.source === 'manual' ? currentObservation : null
  );

  useEffect(() => {
    setManualProductTitle(item.name);
    setStep(manualOnly ? 'manual' : 'search');
  }, [item.name, manualOnly]);

  const handleSearch = useCallback(async () => {
    if (!onSearch) return;
    const trimmedRetailer = retailer.trim();
    const trimmedPostal = postalCode.trim();
    if (!trimmedRetailer || !trimmedPostal) {
      setError('Enter a retailer and ZIP/postal code.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      saveGroceryPriceSearchPrefs({
        retailer: trimmedRetailer,
        postal_code: trimmedPostal,
      });
      const result = await onSearch({
        retailer: trimmedRetailer,
        postal_code: trimmedPostal,
      });
      setSearchResult(result);
      onQuotaUpdate?.(result.quota);
      setOffersExpanded(false);
      setSelectedOfferId(result.offers[0]?.provider_result_id ?? null);
      setStep('offers');
    } catch (err) {
      if (err instanceof GroceryPriceQuotaExceededClientError) {
        onQuotaUpdate?.(err.quota);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Price search failed.');
      }
    } finally {
      setWorking(false);
    }
  }, [onSearch, onQuotaUpdate, postalCode, retailer]);

  async function submitConfirmedOffer(replaceManual: boolean) {
    if (!onConfirmOffer) return;
    if (!searchResult || !selectedOffer) {
      setError('Select an offer to confirm.');
      return;
    }
    const count = Number(packageCount);
    if (!Number.isFinite(count) || count < 1) {
      setError('Package count must be at least 1.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const observation = await onConfirmOffer({
        search_event_id: searchResult.search_event_id,
        provider_result_id: selectedOffer.provider_result_id,
        package_count: count,
        replace_manual: replaceManual || undefined,
      });
      onObservationSaved(observation);
      onClose();
    } catch (err) {
      if (err instanceof GroceryPriceManualReplaceRequiredError) {
        setPendingReplaceObservation(err.currentObservation);
        setStep('replace-manual');
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to confirm price.');
      }
    } finally {
      setWorking(false);
    }
  }

  async function handleConfirmOffer() {
    if (manualObservationForReplace) {
      setStep('replace-manual');
      setError(null);
      return;
    }
    await submitConfirmedOffer(false);
  }

  async function handleReplaceManualPrice() {
    await submitConfirmedOffer(true);
  }

  async function handleSaveManual() {
    const unitPrice = Number(manualUnitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError('Enter a valid unit price.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const observation = await onSaveManual({
        retailer: manualRetailer.trim() || null,
        postal_code: manualPostalCode.trim() || null,
        product_title: manualProductTitle.trim() || item.name,
        unit_price: unitPrice,
        package_count: 1,
      });
      onObservationSaved(observation);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save manual price.');
    } finally {
      setWorking(false);
    }
  }

  const panelBusy = busy || working;

  return (
    <div className="fixed inset-0 z-50 bg-brand-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-3 py-5">
      <div className="w-full max-w-lg rounded-3xl bg-brand-900 border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-denim-300/70 antialiased">
                {step === 'manual' || manualOnly ? 'Enter price manually' : 'Find price'}
              </p>
              <h2 className="text-base font-semibold text-white antialiased mt-1">{item.name}</h2>
              <p className="text-[11px] text-white/40 antialiased mt-1">
                Pricing is optional guidance only. Required amounts and shopping status are unchanged.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={panelBusy}
              className="text-white/40 hover:text-white/70 disabled:text-white/20 text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {step === 'search' && !manualOnly && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 col-span-2 sm:col-span-1">
                  <span className="block text-[10px] text-white/40 antialiased">Retailer</span>
                  <input
                    type="text"
                    value={retailer}
                    onChange={(e) => setRetailer(e.target.value)}
                    placeholder="Target, Whole Foods…"
                    className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                  />
                </label>
                <label className="space-y-1 col-span-2 sm:col-span-1">
                  <span className="block text-[10px] text-white/40 antialiased">ZIP / postal</span>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="94110"
                    className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={panelBusy}
                className="w-full rounded-xl bg-denim-500/25 border border-denim-400/30 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/30 disabled:opacity-50 antialiased"
              >
                {panelBusy ? 'Searching…' : 'Search prices'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('manual');
                  setManualRetailer(retailer);
                  setManualPostalCode(postalCode);
                  setError(null);
                }}
                disabled={panelBusy}
                className="w-full text-[11px] text-white/45 hover:text-white/70 antialiased"
              >
                Enter price manually instead
              </button>
            </>
          )}

          {step === 'offers' && searchResult && (
            <>
              {searchResult.outcome === 'provider_error' && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <p className="text-sm text-red-200 antialiased">
                    {searchResult.provider_error?.message ?? 'Price provider unavailable.'}
                  </p>
                </div>
              )}
              {searchResult.outcome === 'zero_results' && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <p className="text-sm text-amber-100/90 antialiased">
                    No offers found for {searchResult.retailer} near {searchResult.postal_code}.
                  </p>
                </div>
              )}
              {searchResult.cache_hit && (
                <p className="text-[10px] text-white/30 antialiased">Cached results from recent search.</p>
              )}
              {confirmableOffers.length > 0 ? (
                <div className="space-y-1">
                  {visibleOffers.map((offer) => (
                    <OfferRow
                      key={offer.provider_result_id}
                      offer={offer}
                      selected={selectedOfferId === offer.provider_result_id}
                      onSelect={() => setSelectedOfferId(offer.provider_result_id)}
                    />
                  ))}
                  {canShowMoreOffers(offersExpanded, confirmableOffers.length) && (
                    <button
                      type="button"
                      onClick={() => setOffersExpanded(true)}
                      disabled={panelBusy}
                      className="w-full rounded-xl border border-white/10 px-3 py-2 text-[11px] text-white/55 hover:text-white/80 antialiased disabled:opacity-50"
                    >
                      Show more results ({confirmableOffers.length - visibleOffers.length} more)
                    </button>
                  )}
                </div>
              ) : null}
              {selectedOffer && (
                <label className="block space-y-1">
                  <span className="block text-[10px] text-white/40 antialiased">Packages to buy</span>
                  {formatAvailablePackageLabel(selectedOffer.package_size, selectedOffer.package_unit) && (
                    <p className="text-[10px] text-white/30 antialiased">
                      Available package:{' '}
                      {formatAvailablePackageLabel(selectedOffer.package_size, selectedOffer.package_unit)}
                    </p>
                  )}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={packageCount}
                    onChange={(e) => setPackageCount(e.target.value)}
                    className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmOffer()}
                  disabled={panelBusy || !selectedOffer}
                  className="flex-1 min-w-[140px] rounded-xl bg-denim-500/25 border border-denim-400/30 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/30 disabled:opacity-50 antialiased"
                >
                  {panelBusy ? 'Confirming…' : 'Confirm selected price'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('search');
                    setError(null);
                  }}
                  disabled={panelBusy}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:text-white antialiased disabled:opacity-50"
                >
                  New search
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('manual');
                    setManualRetailer(searchResult.retailer);
                    setManualPostalCode(searchResult.postal_code);
                    setError(null);
                  }}
                  disabled={panelBusy}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:text-white antialiased disabled:opacity-50"
                >
                  Manual entry
                </button>
              </div>
            </>
          )}

          {step === 'replace-manual' && manualObservationForReplace && selectedOffer && searchResult && (
            <>
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-3 space-y-2">
                <p className="text-sm text-amber-50/95 antialiased font-medium">
                  Replace your manual price?
                </p>
                <p className="text-[11px] text-amber-100/75 antialiased">
                  You already saved a manual price for this item. Confirming a retailer offer will
                  add a new sourced price and keep your manual entry in history.
                </p>
                <div className="grid grid-cols-1 gap-2 pt-1">
                  <div className="rounded-lg bg-brand-900/60 border border-white/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
                      Current manual price
                    </p>
                    <p className="text-sm text-white antialiased mt-0.5">
                      {formatGroceryCurrency(
                        manualObservationForReplace.line_total,
                        manualObservationForReplace.currency,
                      )}
                      {manualObservationForReplace.retailer
                        ? ` · ${manualObservationForReplace.retailer}`
                        : ''}
                    </p>
                    <p className="text-[10px] text-white/35 antialiased mt-0.5">
                      {manualObservationForReplace.product_title}
                    </p>
                  </div>
                  <div className="rounded-lg bg-brand-900/60 border border-white/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 antialiased">
                      Selected retailer price
                    </p>
                    <p className="text-sm text-white antialiased mt-0.5">
                      {formatGroceryCurrency(
                        selectedOffer.price * (Number(packageCount) || 1),
                        selectedOffer.currency,
                      )}
                      {selectedOffer.retailer ? ` · ${selectedOffer.retailer}` : ''}
                    </p>
                    <p className="text-[10px] text-white/35 antialiased mt-0.5">{selectedOffer.title}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={panelBusy}
                  className="w-full rounded-xl bg-denim-500/25 border border-denim-400/30 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/30 disabled:opacity-50 antialiased"
                >
                  Keep manual price
                </button>
                <button
                  type="button"
                  onClick={() => void handleReplaceManualPrice()}
                  disabled={panelBusy}
                  className="w-full rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 hover:bg-red-500/15 disabled:opacity-50 antialiased"
                >
                  {panelBusy ? 'Replacing…' : 'Replace with selected price'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('offers');
                    setError(null);
                  }}
                  disabled={panelBusy}
                  className="w-full text-[11px] text-white/45 hover:text-white/70 antialiased"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {step === 'manual' && (
            <>
              <label className="block space-y-1">
                <span className="block text-[10px] text-white/40 antialiased">Product title</span>
                <input
                  type="text"
                  value={manualProductTitle}
                  onChange={(e) => setManualProductTitle(e.target.value)}
                  className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="block text-[10px] text-white/40 antialiased">Unit price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualUnitPrice}
                    onChange={(e) => setManualUnitPrice(e.target.value)}
                    placeholder="3.99"
                    className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[10px] text-white/40 antialiased">Retailer (optional)</span>
                  <input
                    type="text"
                    value={manualRetailer}
                    onChange={(e) => setManualRetailer(e.target.value)}
                    className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="block text-[10px] text-white/40 antialiased">ZIP / postal (optional)</span>
                <input
                  type="text"
                  value={manualPostalCode}
                  onChange={(e) => setManualPostalCode(e.target.value)}
                  className="w-full rounded-xl bg-brand-800 border border-white/10 px-3 py-2 text-sm text-white antialiased focus:outline-none focus:border-denim-400"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSaveManual()}
                disabled={panelBusy}
                className="w-full rounded-xl bg-denim-500/25 border border-denim-400/30 px-3 py-2 text-sm text-denim-100 hover:bg-denim-500/30 disabled:opacity-50 antialiased"
              >
                {panelBusy ? 'Saving…' : 'Save manual price'}
              </button>
              {!manualOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setStep(searchResult ? 'offers' : 'search');
                    setError(null);
                  }}
                  disabled={panelBusy}
                  className="w-full text-[11px] text-white/45 hover:text-white/70 antialiased"
                >
                  Back to {searchResult ? 'offers' : 'search'}
                </button>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-200 antialiased">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export function GroceryPriceObservationBadge({
  observation,
}: {
  observation: GroceryPriceObservation;
}) {
  return (
    <p className="text-[10px] text-denim-200/75 antialiased mt-0.5">
      Priced: {formatGroceryCurrency(observation.line_total, observation.currency)}
      {observation.retailer ? ` · ${observation.retailer}` : ''}
      {observation.source === 'manual' ? ' · manual' : observation.user_confirmed ? ' · confirmed' : ''}
    </p>
  );
}
