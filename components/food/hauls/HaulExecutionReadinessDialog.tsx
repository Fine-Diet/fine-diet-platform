'use client';

import { AppDialog } from '@/components/ui/AppDialog';
import type {
  GroceryHaulExecutionDeferredFinding,
  GroceryHaulExecutionFinding,
  GroceryHaulExecutionReadiness,
  GroceryHaulItem,
} from '@/lib/plans/types';
import { findingItemLabel } from './presentation';

function FindingList({
  heading,
  findings,
  items,
  emptyLabel,
}: {
  heading: string;
  findings: Array<GroceryHaulExecutionFinding | GroceryHaulExecutionDeferredFinding>;
  items: GroceryHaulItem[];
  emptyLabel?: string;
}) {
  if (findings.length === 0) {
    return emptyLabel ? <p className="mt-3 text-sm text-white/45">{emptyLabel}</p> : null;
  }
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{heading}</h3>
      <ul className="mt-2 space-y-2">
        {findings.map((finding) => {
          const itemName = 'haul_item_id' in finding
            ? findingItemLabel(finding, items)
            : null;
          const evaluation = 'evaluation' in finding ? finding.evaluation : null;
          return (
            <li
              key={finding.code + (itemName ?? '')}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/75"
            >
              <p>{'message' in finding && finding.message ? finding.message : finding.code.replace(/_/g, ' ')}</p>
              {itemName && <p className="mt-1 text-xs text-white/45">{itemName}</p>}
              {evaluation === 'not_evaluated' && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                  Not evaluated
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HaulExecutionReadinessDialog({
  open,
  readiness,
  items,
  starting,
  onClose,
  onContinue,
}: {
  open: boolean;
  readiness: GroceryHaulExecutionReadiness | null;
  items: GroceryHaulItem[];
  starting: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  if (!readiness) return null;
  const blocked = readiness.blockers.length > 0 || !readiness.can_start;
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      labelledBy="haul-readiness-title"
      panelClassName="border border-white/15 bg-[#211a14] p-6 text-white shadow-2xl"
    >
      <h2 id="haul-readiness-title" className="text-2xl font-light text-brand-50">
        {blocked ? 'Shopping View is not ready' : 'Review before Shopping View'}
      </h2>
      <p className="mt-2 text-sm text-white/50">
        {blocked
          ? 'At least one item must have a final quantity above zero before this Haul can enter Shopping View.'
          : 'Warnings and deferred checks are shown as-is. They do not automatically block shopping.'}
      </p>

      <FindingList heading="Blocking issues" findings={readiness.blockers} items={items} />
      <FindingList heading="Warnings" findings={readiness.warnings} items={items} />
      <FindingList
        heading="Deferred checks"
        findings={readiness.deferred_findings}
        items={items}
      />

      <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold"
        >
          Return to preparation
        </button>
        {readiness.can_start && (
          <button
            type="button"
            onClick={onContinue}
            disabled={starting}
            className="rounded-full bg-brand-50 px-6 py-2.5 text-sm font-semibold text-[#16110d] disabled:opacity-50"
          >
            {starting ? 'Opening…' : 'Continue to Shopping View'}
          </button>
        )}
      </div>
    </AppDialog>
  );
}
