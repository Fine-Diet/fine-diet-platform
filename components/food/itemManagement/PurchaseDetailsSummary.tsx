'use client';

import {
  formatPurchaseDetailsSummary,
  type PurchaseDetailsSummaryInput,
} from './purchaseDetailsSummaryFormat';

export type { PurchaseDetailsSummaryInput };

export function PurchaseDetailsSummary({
  details,
  onEditManually,
  onFindUpdate,
}: {
  details: PurchaseDetailsSummaryInput;
  onEditManually: () => void;
  onFindUpdate: () => void;
}) {
  const summary = formatPurchaseDetailsSummary(details);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-medium text-white">{summary.productTitle}</p>
      {summary.brandLine && (
        <p className="mt-1 text-xs text-white/50">{summary.brandLine}</p>
      )}
      {summary.packageRetailerLine && (
        <p className="mt-1 text-xs text-white/50">{summary.packageRetailerLine}</p>
      )}
      {summary.priceLine && (
        <p className="mt-1 text-sm text-brand-50">{summary.priceLine}</p>
      )}
      {!summary.hasDetails && (
        <p className="mt-1 text-xs text-white/40">
          Add product and purchase details manually or search retail offers.
        </p>
      )}
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
    </div>
  );
}
