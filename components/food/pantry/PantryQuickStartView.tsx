'use client';

import Link from 'next/link';
import {
  PANTRY_QUICK_START_CATEGORY_LABELS,
  PANTRY_QUICK_START_STAPLE_LABELS,
} from '@/lib/plans/pantryQuickStart/catalog';
import { emitPantryQuickStartEvent } from '@/lib/plans/pantryQuickStart/emitEvent';
import {
  acceptPantryQuickStartCategory,
  confirmHaveNowForAcceptedStaples,
  setPantryQuickStartQuantity,
  skipPantryQuickStartCategory,
  togglePantryQuickStartItem,
  writesForAcceptedStaples,
  type PantryQuickStartProposal,
} from '@/lib/plans/pantryQuickStart/proposalPolicy';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

function eventCounts(proposal: PantryQuickStartProposal) {
  return {
    policyId: proposal.policyId,
    policyVersion: proposal.policyVersion,
    proposalSource: proposal.source,
    reasonCodes: proposal.reasonCodes,
    acceptedCount: proposal.acceptedCount,
    skippedCategoryCount: proposal.categories.filter((category) => category.skipped).length,
    alreadySavedCount: proposal.alreadySavedCount,
  };
}

export function PantryQuickStartView({
  proposal,
  saving,
  error,
  onChange,
  onSave,
  onAddOwn,
  onAbandon,
}: {
  proposal: PantryQuickStartProposal;
  saving: boolean;
  error: string | null;
  onChange: (next: PantryQuickStartProposal) => void;
  onSave: () => void;
  onAddOwn: () => void;
  onAbandon: () => void;
}) {
  const writableCount = writesForAcceptedStaples(proposal).length;
  const sourceLine =
    proposal.source === 'saved_pantry'
      ? 'Your saved pantry stays as-is. These extras are only starting suggestions.'
      : 'Starting suggestions — not learned facts. Confirm what you usually have.';

  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70 antialiased">
        Pantry quick start
      </p>
      <h3 className="mt-1 text-lg font-semibold text-brand-50 antialiased">
        Confirm a useful starting pantry
      </h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
        {sourceLine} Skip anything that isn’t you. “Usually have” is a habit, not
        Pantry quantity, so it is not saved. Confirm “I have this now” to save 1
        item, or track a measured amount.
      </p>

      <div className="mt-5 space-y-4">
        {proposal.categories.map((category) => {
          const items = proposal.items.filter((item) => item.categoryId === category.id);
          return (
            <section
              key={category.id}
              className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-brand-50 antialiased">
                    {PANTRY_QUICK_START_CATEGORY_LABELS[category.id]}
                  </h4>
                  {category.skipped ? (
                    <p className="mt-1 text-xs text-white/40 antialiased">Skipped</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const next = skipPantryQuickStartCategory(proposal, category.id);
                      emitPantryQuickStartEvent({
                        event: 'pantry_quick_start_category_skipped',
                        ...eventCounts(next),
                        path: 'secondary',
                        stapleId: null,
                        categoryId: category.id,
                      });
                      onChange(next);
                    }}
                    className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      onChange(acceptPantryQuickStartCategory(proposal, category.id))
                    }
                    className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                  >
                    Include
                  </button>
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {items.map((item) => (
                  <StapleRow
                    key={item.stapleId}
                    proposal={proposal}
                    stapleId={item.stapleId}
                    saving={saving}
                    onChange={onChange}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 antialiased">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(confirmHaveNowForAcceptedStaples(proposal))}
          disabled={saving || proposal.acceptedCount < 1}
          className="inline-flex justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          I have the selected items now
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || writableCount < 1}
          className="inline-flex justify-center rounded-full bg-[#d7ecff] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:opacity-50"
        >
          {saving
            ? 'Saving...'
            : `Save ${writableCount} on-hand item${writableCount === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={onAddOwn}
          disabled={saving}
          className="inline-flex justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-brand-50/80 transition-colors hover:bg-white/[0.08] hover:text-brand-50 disabled:opacity-50"
        >
          Add my own
        </button>
        <Link
          href={APP_ROUTES.todayPlan}
          onClick={onAbandon}
          className="inline-flex justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Plan without pantry
        </Link>
      </div>
      {proposal.acceptedCount > 0 && writableCount < 1 ? (
        <p className="mt-3 text-sm text-white/55 antialiased">
          Selected items are marked as usually have, which is not saved as Pantry
          quantity. Confirm “I have this now” or track a measured amount.
        </p>
      ) : null}
    </div>
  );
}

function StapleRow({
  proposal,
  stapleId,
  saving,
  onChange,
}: {
  proposal: PantryQuickStartProposal;
  stapleId: string;
  saving: boolean;
  onChange: (next: PantryQuickStartProposal) => void;
}) {
  const item = proposal.items.find((row) => row.stapleId === stapleId);
  if (!item) return null;
  const label = PANTRY_QUICK_START_STAPLE_LABELS[item.stapleId] ?? item.stapleId;
  const locked = item.alreadySaved || !item.resolvable;

  return (
    <li className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-[#d7ecff]"
          checked={item.accepted}
          disabled={saving || locked}
          onChange={(event) => {
            const next = togglePantryQuickStartItem(
              proposal,
              item.stapleId,
              event.target.checked,
            );
            emitPantryQuickStartEvent({
              event: 'pantry_quick_start_item_toggled',
              ...eventCounts(next),
              path: 'primary',
              stapleId: item.stapleId,
              categoryId: item.categoryId,
            });
            onChange(next);
          }}
          aria-label={label}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-brand-50 antialiased">{label}</p>
          {item.alreadySaved ? (
            <p className="mt-0.5 text-xs text-emerald-100/70 antialiased">Already in your pantry</p>
          ) : !item.resolvable ? (
            <p className="mt-0.5 text-xs text-white/45 antialiased">
              Not in the food catalog yet — add it manually if you have it
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-white/45 antialiased">
              Usually have · habit only, not saved as Pantry quantity
            </p>
          )}

          {item.accepted && item.resolvable && !item.alreadySaved ? (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-white/55">
                <input
                  type="checkbox"
                  className="accent-[#d7ecff]"
                  checked={item.quantityMode === 'have_now' || item.quantityMode === 'tracked'}
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      setPantryQuickStartQuantity(proposal, item.stapleId, {
                        quantityMode: event.target.checked ? 'have_now' : 'usually_have',
                      }),
                    )
                  }
                />
                I have this now
              </label>
              <label className="flex items-center gap-2 text-xs text-white/55">
                <input
                  type="checkbox"
                  className="accent-[#d7ecff]"
                  checked={item.quantityMode === 'tracked'}
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      setPantryQuickStartQuantity(proposal, item.stapleId, {
                        quantityMode: event.target.checked ? 'tracked' : 'have_now',
                        quantity: item.quantity,
                        unit: item.unit,
                      }),
                    )
                  }
                />
                Track a quantity
              </label>
            </div>
          ) : null}

          {item.quantityMode === 'tracked' && item.accepted ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="any"
                value={item.quantity}
                disabled={saving}
                onChange={(event) =>
                  onChange(
                    setPantryQuickStartQuantity(proposal, item.stapleId, {
                      quantityMode: 'tracked',
                      quantity: Number(event.target.value),
                      unit: item.unit,
                    }),
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-brand-50 outline-none focus:border-emerald-300/50"
                aria-label={`${label} quantity`}
              />
              <input
                type="text"
                value={item.unit}
                disabled={saving}
                onChange={(event) =>
                  onChange(
                    setPantryQuickStartQuantity(proposal, item.stapleId, {
                      quantityMode: 'tracked',
                      quantity: item.quantity,
                      unit: event.target.value,
                    }),
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-brand-50 outline-none focus:border-emerald-300/50"
                aria-label={`${label} unit`}
              />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
