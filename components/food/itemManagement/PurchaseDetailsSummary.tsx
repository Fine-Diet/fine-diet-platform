'use client';

import {
  formatPurchaseDetailsSummary,
  type PurchaseDetailsSummaryFormatOptions,
  type PurchaseDetailsSummaryInput,
} from './purchaseDetailsSummaryFormat';

export type { PurchaseDetailsSummaryInput };

export function PurchaseDetailsSummary({
  details,
  onEditManually,
  onFindUpdate,
  variant = 'standalone',
  formatOptions,
}: {
  details: PurchaseDetailsSummaryInput;
  onEditManually?: () => void;
  onFindUpdate?: () => void;
  variant?: 'standalone' | 'embedded';
  formatOptions?: PurchaseDetailsSummaryFormatOptions;
}) {
  const summary = formatPurchaseDetailsSummary(details, formatOptions);
  const embedded = variant === 'embedded';

  return (
    <div
      className={
        embedded
          ? 'px-4 py-4'
          : 'rounded-xl border border-white/10 bg-white/[0.03] p-4'
      }
    >
      <p className={`${embedded ? 'text-base' : 'text-sm'} font-medium text-white`}>
        {summary.productTitle}
      </p>
      {embedded ? (
        <>
          {summary.packageRetailerLine && (
            <p className="mt-1 text-sm text-white/50">{summary.packageRetailerLine}</p>
          )}
          {summary.brandLine && (
            <p className="mt-1 text-sm text-white/50">{summary.brandLine}</p>
          )}
        </>
      ) : (
        <>
          {summary.brandLine && (
            <p className="mt-1 text-xs text-white/50">{summary.brandLine}</p>
          )}
          {summary.packageRetailerLine && (
            <p className="mt-1 text-xs text-white/50">{summary.packageRetailerLine}</p>
          )}
        </>
      )}
      {summary.priceLine && (
        <p className={`mt-1 ${embedded ? 'text-base font-semibold text-white' : 'text-sm text-brand-50'}`}>
          {summary.priceLine}
        </p>
      )}
      {!summary.hasDetails && (
        <p className="mt-1 text-sm text-white/40">
          Add product and purchase details manually or search retail offers.
        </p>
      )}
      {!embedded && onEditManually && onFindUpdate && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEditManually}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/[0.06]"
          >
            Edit manually
          </button>
          <button
            type="button"
            onClick={onFindUpdate}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-brand-50 hover:bg-white/[0.06]"
          >
            Find / update details
          </button>
        </div>
      )}
    </div>
  );
}
