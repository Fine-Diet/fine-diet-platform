'use client';

import { CreateResourceDialogFooter } from '@/components/food/itemManagement/CreateResourceDialogFooter';
import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
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
    <ItemManagementDialog
      open={open}
      onClose={onClose}
      labelledBy="haul-readiness-title"
      busy={starting}
      shell="create-resource"
      footer={(
        readiness.can_start ? (
          <CreateResourceDialogFooter
            primaryLabel={starting ? 'Opening…' : 'Continue to Shopping View'}
            onPrimary={onContinue}
            primaryBusy={starting}
            onSecondary={onClose}
            secondaryDisabled={starting}
            secondaryLabel="Return to preparation"
          />
        ) : (
          <div className="flex w-full flex-col items-stretch">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 w-full text-sm text-white/55"
            >
              Return to preparation
            </button>
          </div>
        )
      )}
    >
      <h2 id="haul-readiness-title" className="text-2xl font-semibold text-white">
        {blocked ? 'Shopping View is not ready' : 'Review before Shopping View'}
      </h2>
      <p className="mt-2 text-sm text-white/50">
        {blocked
          ? 'At least one item must have a final quantity above zero before this Haul can enter Shopping View.'
          : 'Review anything that needs attention. You can still continue.'}
      </p>

      <div className="mt-2 max-h-[min(24rem,50dvh)] overflow-y-auto overscroll-contain">
        <FindingList heading="Blocking issues" findings={readiness.blockers} items={items} />
        <FindingList heading="Warnings" findings={readiness.warnings} items={items} />
        <FindingList
          heading="Deferred checks"
          findings={readiness.deferred_findings}
          items={items}
        />
      </div>

    </ItemManagementDialog>
  );
}
