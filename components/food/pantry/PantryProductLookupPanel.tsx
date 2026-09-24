'use client';

import type {
  PantryProductSearchOffer,
  PantryProductSearchProvenance,
} from '@/lib/plans/pantryProductSearchTypes';

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

export interface PantryProductLookupPanelProps {
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
  onSearch: () => void;
  onSelectOffer: (offer: PantryProductSearchOffer) => void;
  onBackToSummary?: () => void;
  variant?: 'card' | 'embedded';
}

export function PantryProductLookupPanel({
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
  onSearch,
  onSelectOffer,
  onBackToSummary,
  variant = 'card',
}: PantryProductLookupPanelProps) {
  const normalizedPostal = productSearchPostalValidation.ok
    ? productSearchPostalValidation.value ?? productSearchPostal
    : productSearchPostal;
  const embedded = variant === 'embedded';

  const scopeCopy = (() => {
    if (productSearchState === 'searching' && productSearchPostalValidation.ok) {
      return productSearchScopeLabel(normalizedPostal, productSearchRetailer);
    }
    if (productSearchState === 'results' && productSearchProvenance) {
      return productSearchScopeLabel(
        productSearchProvenance.requested_postal_code,
        productSearchProvenance.retailer ?? '',
      );
    }
    return null;
  })();

  const wrapperClass = embedded
    ? 'space-y-4'
    : 'rounded-xl border border-white/10 bg-white/[0.03] p-4';

  return (
    <div className={wrapperClass}>
      {!embedded && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-white/55">Find product details</p>
          {onBackToSummary && (
            <button
              type="button"
              onClick={onBackToSummary}
              className="text-xs font-medium text-white/45 hover:text-white"
            >
              Back to summary
            </button>
          )}
        </div>
      )}
      <div className={embedded ? 'space-y-4' : 'mt-3 space-y-3'}>
        <label className="block">
          <span className="text-[13px] text-white/50">Search product</span>
          <input
            value={productSearchQuery}
            onChange={(event) => onProductSearchQueryChange(event.target.value)}
            placeholder="Search retail products"
            className={inputClassName}
          />
        </label>
        <div
          className={
            embedded
              ? 'grid min-w-0 grid-cols-3 gap-3'
              : 'grid grid-cols-1 gap-3 sm:grid-cols-2'
          }
        >
          <label className={embedded ? 'col-span-1 block' : 'block'}>
            <span className="text-[13px] text-white/50">ZIP/postal code</span>
            <input
              value={productSearchPostal}
              onChange={(event) => onProductSearchPostalChange(event.target.value)}
              onBlur={onProductSearchPostalBlur}
              placeholder="ZIP or postal code"
              autoComplete="postal-code"
              className={inputClassName}
            />
          </label>
          <label className={embedded ? 'col-span-2 block' : 'block'}>
            <span className="text-[13px] text-white/50">Retailer filter (optional)</span>
            <input
              value={productSearchRetailer}
              onChange={(event) => onProductSearchRetailerChange(event.target.value)}
              placeholder="Any retailer"
              className={inputClassName}
            />
          </label>
        </div>
        {productSearchPostalTouched && !productSearchPostalValidation.ok && (
          <p className="text-xs text-red-200" role="alert">
            {productSearchPostalValidation.message}
          </p>
        )}
        <div className={embedded ? undefined : 'flex justify-end'}>
          <button
            type="button"
            onClick={onSearch}
            disabled={productSearchState === 'searching' || !productSearchCanSubmit}
            className={
              embedded
                ? 'w-full rounded-full bg-white/10 py-3 text-center text-base font-medium text-white hover:bg-white/[0.14] disabled:opacity-40'
                : 'shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/[0.06] disabled:opacity-40'
            }
          >
            {productSearchState === 'searching' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>
      {scopeCopy && (
        <p className="text-sm text-white/45">{scopeCopy}</p>
      )}
      {productSearchState === 'zero_results' && (
        <p className="text-sm text-white/45">
          No retail matches found. You can still enter product details manually.
        </p>
      )}
      {productSearchState === 'quota_exceeded' && productSearchError && (
        <p className="text-sm text-amber-200" role="alert">{productSearchError}</p>
      )}
      {productSearchState === 'error' && productSearchError && (
        <p className="text-sm text-red-200" role="alert">{productSearchError}</p>
      )}
      {productSearchState === 'results' && productSearchOffers.length > 0 && (
        <ul
          className={
            embedded
              ? 'max-h-72 divide-y divide-white/10 overflow-y-auto border-t border-white/10'
              : 'mt-3 max-h-56 space-y-2 overflow-y-auto'
          }
        >
          {productSearchOffers.map((offer) => (
            <li key={offer.provider_result_id}>
              <button
                type="button"
                onClick={() => onSelectOffer(offer)}
                className={
                  embedded
                    ? 'flex w-full items-start gap-4 px-1 py-4 text-left hover:bg-white/[0.04] active:bg-white/[0.06]'
                    : 'flex w-full items-start gap-3 rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/[0.05]'
                }
              >
                {offer.image_url && (
                  <img
                    src={offer.image_url}
                    alt=""
                    className={
                      embedded
                        ? 'h-14 w-14 shrink-0 rounded-lg object-cover'
                        : 'mt-0.5 h-10 w-10 shrink-0 rounded object-cover'
                    }
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-base font-medium text-white">{offer.title}</span>
                  <span className="mt-0.5 block text-sm text-white/50">
                    {[
                      offer.retailer,
                      offer.price != null
                        ? formatCurrency(offer.price, offer.currency)
                        : null,
                      offer.package_text
                        ?? (offer.package_size != null
                          ? `${offer.package_size}${offer.package_unit ? ` ${offer.package_unit}` : ''}`
                          : null),
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
