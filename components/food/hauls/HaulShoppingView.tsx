'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll } from '@/components/layout/SignedInPageShell';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type {
  GroceryHaulExecutionDetail,
  GroceryHaulExecutionItem,
  GroceryHaulExecutionItemState,
} from '@/lib/plans/types';
import { HaulAcquisitionEditor } from './HaulAcquisitionEditor';
import {
  acquiredStoreLabel,
  acquisitionOutcomeDiverged,
  allowedExecutionActions,
  executionSourceDemandLabel,
  factualAcquiredSubtotal,
  formatHaulCurrency,
  formatHaulDate,
  preparedExecutionSubtotal,
  preparedInstructionLabel,
  preparedStoreLabel,
} from './presentation';

type LoadState = 'loading' | 'ready' | 'error';

function executionStateLabel(state: GroceryHaulExecutionItemState): string {
  if (state === 'in_basket') return 'In basket';
  if (state === 'skipped') return 'Skipped';
  return 'Pending';
}

function ExecutionItemRow({
  item,
  currency,
  busy,
  onState,
  onSubstitute,
  onRetry,
  mutationError,
}: {
  item: GroceryHaulExecutionItem;
  currency: string;
  busy: boolean;
  onState: (state: GroceryHaulExecutionItemState) => void;
  onSubstitute: () => void;
  onRetry: () => void;
  mutationError: string | null;
}) {
  const actions = allowedExecutionActions(item.state);
  const diverged = acquisitionOutcomeDiverged(item);
  const preparedStore = preparedStoreLabel(item);
  const acquiredStore = acquiredStoreLabel(item);
  const skipped = item.state === 'skipped';
  const basketed = item.state === 'in_basket';

  return (
    <article className={`border-b border-white/15 py-5 ${skipped ? 'opacity-45' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-50">{item.source_name_snapshot}</h3>
          <p className="mt-1 text-[11px] text-white/40">
            {item.source_list_title?.trim() || 'Source List'} · {executionSourceDemandLabel(item)}
          </p>
          <p className="mt-2 text-sm text-white/70">{preparedInstructionLabel(item)}</p>
          {preparedStore && !diverged && (
            <p className="mt-1 text-xs text-white/45">{preparedStore}</p>
          )}
          {item.prepared_price_amount != null && (
            <p className="mt-1 text-sm text-white/65">
              Prepared {formatHaulCurrency(item.prepared_price_amount, item.prepared_price_currency ?? currency)}
            </p>
          )}
          {diverged && (
            <p className="mt-2 text-sm text-brand-50">
              Acquired · {[item.acquired_brand_name, item.acquired_product_title].filter(Boolean).join(' · ') || 'Outcome updated'}
              {acquiredStore ? ` · ${acquiredStore}` : ''}
              {item.acquired_price_amount != null
                ? ` · ${formatHaulCurrency(item.acquired_price_amount, item.acquired_price_currency ?? currency)}`
                : ''}
            </p>
          )}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
          basketed
            ? 'border-brand-50/40 text-brand-50'
            : skipped
              ? 'border-white/15 text-white/45'
              : 'border-white/20 text-white/55'
        }`}>
          {executionStateLabel(item.state)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.markInBasket && (
          <button
            type="button"
            onClick={() => onState('in_basket')}
            disabled={busy}
            className="rounded-full bg-brand-50 px-4 py-2 text-xs font-semibold text-[#16110d] disabled:opacity-40"
          >
            In Basket
          </button>
        )}
        {actions.skip && (
          <button
            type="button"
            onClick={() => onState('skipped')}
            disabled={busy}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Skip
          </button>
        )}
        {actions.substitute && (
          <button
            type="button"
            onClick={onSubstitute}
            disabled={busy}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Substitute
          </button>
        )}
        {actions.returnToPending && item.state === 'in_basket' && (
          <button
            type="button"
            onClick={() => onState('pending')}
            disabled={busy}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Remove from basket
          </button>
        )}
        {actions.returnToPending && item.state === 'skipped' && (
          <button
            type="button"
            onClick={() => onState('pending')}
            disabled={busy}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Return to pending
          </button>
        )}
      </div>
      {mutationError && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <span>{mutationError}</span>
          <button type="button" onClick={onRetry} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}
    </article>
  );
}

export default function HaulShoppingView({ haulId }: { haulId: string }) {
  const router = useRouter();
  const [execution, setExecution] = useState<GroceryHaulExecutionDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [pendingRetry, setPendingRetry] = useState<Record<string, GroceryHaulExecutionItemState>>({});
  const [editingItem, setEditingItem] = useState<GroceryHaulExecutionItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const haulDetail = await planService.getGroceryHaul(haulId);
      if (haulDetail.haul.status === 'planned') {
        await router.replace(APP_ROUTE_BUILDERS.foodHaul(haulId));
        return;
      }
      if (haulDetail.haul.status === 'closed' || haulDetail.haul.status === 'cancelled') {
        await router.replace(APP_ROUTE_BUILDERS.foodHaul(haulId));
        return;
      }
      const next = await planService.getGroceryHaulExecution(haulId);
      setExecution(next);
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Shopping View.');
      setLoadState('error');
    }
  }, [haulId, router]);

  useEffect(() => {
    setLoadState('loading');
    void load();
  }, [load]);

  async function changeState(item: GroceryHaulExecutionItem, state: GroceryHaulExecutionItemState) {
    if (itemBusy) return;
    const allowed = allowedExecutionActions(item.state);
    if (state === 'in_basket' && !allowed.markInBasket) return;
    if (state === 'skipped' && !allowed.skip) return;
    if (state === 'pending' && !allowed.returnToPending) return;
    setItemBusy(item.id);
    setItemErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setPendingRetry((current) => ({ ...current, [item.id]: state }));
    try {
      const updated = await planService.updateGroceryHaulExecutionItem(haulId, item.id, { state });
      setExecution((current) => {
        if (!current) return current;
        const items = current.items.map((candidate) => candidate.id === item.id ? updated : candidate);
        return {
          ...current,
          items,
          summary: {
            ...current.summary,
            pending_count: items.filter((candidate) => candidate.state === 'pending').length,
            in_basket_count: items.filter((candidate) => candidate.state === 'in_basket').length,
            skipped_count: items.filter((candidate) => candidate.state === 'skipped').length,
          },
        };
      });
    } catch (err) {
      setItemErrors((current) => ({
        ...current,
        [item.id]: err instanceof Error ? err.message : 'Unable to update this item.',
      }));
    } finally {
      setItemBusy(null);
    }
  }

  function replaceItem(updated: GroceryHaulExecutionItem) {
    setExecution((current) => current ? {
      ...current,
      items: current.items.map((candidate) => candidate.id === updated.id ? updated : candidate),
    } : current);
  }

  if (loadState === 'loading') {
    return (
      <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
        <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14">
          <div className="mx-auto max-w-[1000px] space-y-4">
            <div className="h-12 w-2/3 animate-pulse rounded-xl bg-white/[0.05]" />
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        </SignedInPageScroll>
        <JournalFooterNav />
      </div>
    );
  }

  const acquiredSubtotal = execution ? factualAcquiredSubtotal(execution.items) : null;
  const preparedSubtotal = execution ? preparedExecutionSubtotal(execution.items) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#16110d] text-white">
      <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14">
        {loadState === 'error' || !execution ? (
          <div className="mx-auto max-w-[800px]">
            <p role="alert" className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error || 'Unable to load Shopping View.'}
            </p>
            <button type="button" onClick={() => void load()} className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : execution.items.length === 0 ? (
          <div className="mx-auto max-w-[800px]">
            <p role="alert" className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              This active Haul has no executable shopping rows. That is an inconsistent execution state, not an empty shopping list.
            </p>
            <Link href={APP_ROUTES.foodHauls} className="mt-4 inline-flex rounded-full border border-white/20 px-5 py-2 text-sm font-semibold">
              Back to Hauls
            </Link>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1000px]">
            <Link href={APP_ROUTES.foodHauls} className="text-xs font-semibold text-white/45 hover:text-white/75">
              ← Hauls
            </Link>
            <header className="mt-5">
              <p className="text-lg font-semibold text-white">Shopping View</p>
              <h1 className="mt-1 text-4xl font-light tracking-tight text-brand-50 sm:text-5xl">
                {execution.haul.title || `Haul · ${formatHaulDate(execution.haul.shopping_date)}`}
              </h1>
              <p className="mt-2 text-sm text-white/50">
                {formatHaulDate(execution.haul.shopping_date)} · Active shopping
              </p>
            </header>

            <section className="mt-8 rounded-[24px] border border-white/25 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Progress</p>
              <p className="mt-3 text-sm text-white/70">
                {execution.summary.pending_count} pending · {execution.summary.in_basket_count} in basket · {execution.summary.skipped_count} skipped
              </p>
              <p className="mt-5 text-sm text-white/55">
                Prepared estimate {formatHaulCurrency(preparedSubtotal, execution.haul.currency)}
              </p>
              {acquiredSubtotal != null && (
                <p className="mt-1 text-sm text-brand-50">
                  Acquired subtotal {formatHaulCurrency(acquiredSubtotal, execution.haul.currency)}
                </p>
              )}
              <p className="mt-3 text-xs text-white/35">
                Based on persisted prices × quantities. Tax is not included.
              </p>
            </section>

            <section className="mt-10" aria-labelledby="shopping-items-title">
              <h2 id="shopping-items-title" className="border-b border-white/20 pb-3 text-sm font-semibold text-brand-50">
                Shopping items
              </h2>
              {execution.items.map((item) => (
                <ExecutionItemRow
                  key={item.id}
                  item={item}
                  currency={execution.haul.currency}
                  busy={itemBusy === item.id}
                  mutationError={itemErrors[item.id] ?? null}
                  onState={(state) => void changeState(item, state)}
                  onSubstitute={() => setEditingItem(item)}
                  onRetry={() => {
                    const retryState = pendingRetry[item.id];
                    if (retryState) void changeState(item, retryState);
                  }}
                />
              ))}
            </section>
          </div>
        )}
      </SignedInPageScroll>
      <JournalFooterNav />
      <HaulAcquisitionEditor
        haulId={haulId}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={replaceItem}
      />
    </div>
  );
}
