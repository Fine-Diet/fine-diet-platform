'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';

import { SelectionCircle } from '@/components/food/home/SelectionCircle';
import { FoodHomeColumn } from '@/components/food/home/FoodHomeColumn';
import type {
  AddToGroceryListHandler,
  FoodReadinessIngredientRow,
  FoodReadinessViewModel,
} from '@/lib/food/home/types';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

type HandoffState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; listId: string; count: number }
  | { kind: 'error'; message: string };

export function FoodReadinessModule({
  model,
  onAddToGroceryList,
}: {
  model: FoodReadinessViewModel;
  onAddToGroceryList: AddToGroceryListHandler;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<HandoffState>({ kind: 'idle' });

  const eligibleKeys = useMemo(
    () => model.rows.filter((row) => row.status === 'eligible').map((row) => row.demandKey),
    [model.rows],
  );

  const selectedEligible = useMemo(
    () => Array.from(selected).filter((key) => eligibleKeys.includes(key)),
    [selected, eligibleKeys],
  );

  function toggleRow(row: FoodReadinessIngredientRow) {
    if (row.status !== 'eligible' || handoff.kind === 'submitting') return;
    setHandoff({ kind: 'idle' });
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.demandKey)) next.delete(row.demandKey);
      else next.add(row.demandKey);
      return next;
    });
  }

  async function handleAdd() {
    if (selectedEligible.length === 0 || handoff.kind === 'submitting') return;
    setHandoff({ kind: 'submitting' });
    const result = await onAddToGroceryList(selectedEligible);
    if (!result.ok || !result.listId) {
      setHandoff({
        kind: 'error',
        message: result.errorMessage ?? 'Could not add items to your grocery list.',
      });
      return;
    }
    setHandoff({
      kind: 'success',
      listId: result.listId,
      count: result.addedCount ?? selectedEligible.length,
    });
    setSelected(new Set());
  }

  return (
    <section
      className={cn(
        'relative z-0 bg-gradient-to-b from-[#17130f] via-brand-900 to-neutral-700',
        'pb-16 pt-10 sm:pb-20 sm:pt-12',
      )}
      aria-labelledby="food-readiness-heading"
    >
      <FoodHomeColumn>
        <p className="text-sm font-medium text-white/70 antialiased">Food</p>
        <h1
          id="food-readiness-heading"
          className="mt-3 max-w-[20ch] text-4xl font-semibold leading-tight text-white antialiased sm:text-5xl"
        >
          Maintain a kitchen aligned with your goals
        </h1>
        <p className="mt-4 max-w-[38ch] text-base font-light leading-relaxed text-white/55 antialiased">
          Know what you have, what your plans require, and what to get next.
        </p>

        <div className="mt-10">
          {model.status === 'loading' && <ReadinessMessage>Loading upcoming requirements…</ReadinessMessage>}

          {model.status === 'no_active_plan' && (
            <ReadinessMessage>
              No active plan yet. Activate a plan to see what your kitchen will need next.
            </ReadinessMessage>
          )}

          {model.status === 'no_planned_requirements' && (
            <ReadinessMessage>
              No planned requirements in the current window. Add meals to your plan to surface
              ingredients here.
            </ReadinessMessage>
          )}

          {model.status === 'error' && (
            <ReadinessMessage tone="error">
              {model.errorMessage ?? 'Could not load upcoming kitchen requirements.'}
            </ReadinessMessage>
          )}

          {model.status === 'all_ready' && (
            <ReadinessMessage>
              You&apos;re covered — upcoming requirements are already on {model.groceryListLabel}.
            </ReadinessMessage>
          )}

          {(model.status === 'populated' || model.status === 'all_ready') && model.rows.length > 0 && (
            <ul className="border-t border-white/15" role="list">
              {model.rows.map((row) => {
                const isSelected = selected.has(row.demandKey) && row.status === 'eligible';
                const isCompleted = row.status === 'already_added';
                const revealContext =
                  hoveredKey === row.demandKey || focusedKey === row.demandKey || isSelected;
                const disabled = isCompleted || handoff.kind === 'submitting';

                return (
                  <li key={row.demandKey} className="border-b border-white/15">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={
                        isCompleted
                          ? `${row.name}, already on grocery list`
                          : isSelected
                            ? `Deselect ${row.name}`
                            : `Select ${row.name} to add to grocery list`
                      }
                      onClick={() => toggleRow(row)}
                      onMouseEnter={() => setHoveredKey(row.demandKey)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onFocus={() => setFocusedKey(row.demandKey)}
                      onBlur={() => setFocusedKey(null)}
                      className={cn(
                        'flex w-full items-center gap-4 px-3 py-4 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                        (isSelected || revealContext) && !isCompleted && 'bg-black/30',
                        isCompleted && 'opacity-55',
                        disabled && !isCompleted && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            'text-base font-medium antialiased sm:text-lg',
                            isCompleted ? 'text-white/55' : 'text-white',
                          )}
                        >
                          {row.name}
                        </div>
                        <div
                          className={cn(
                            'mt-0.5 text-sm text-white/50 antialiased transition-opacity',
                            revealContext ? 'opacity-100' : 'opacity-0',
                          )}
                        >
                          {row.quantityLabel} • {row.contextLabel}
                        </div>
                      </div>
                      <SelectionCircle checked={isSelected} completed={isCompleted} disabled={disabled} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedEligible.length > 0 && handoff.kind !== 'success' && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={handoff.kind === 'submitting'}
                className="text-base font-medium text-white antialiased transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {handoff.kind === 'submitting'
                  ? 'Adding…'
                  : `Add ${selectedEligible.length} to Grocery List`}
              </button>
            </div>
          )}

          {handoff.kind === 'error' && (
            <p className="mt-4 text-sm text-semantic-error antialiased" role="alert">
              {handoff.message}
            </p>
          )}

          {handoff.kind === 'success' && (
            <div className="mt-5 rounded-[20px] border border-white/15 bg-black/25 px-4 py-3">
              <p className="text-sm text-white/80 antialiased">
                Added {handoff.count} item{handoff.count === 1 ? '' : 's'} to {model.groceryListLabel}.
              </p>
              <Link
                href={APP_ROUTE_BUILDERS.foodGroceryList(handoff.listId)}
                className="mt-2 inline-block text-sm font-semibold text-denim-300 antialiased hover:text-denim-100"
              >
                Open grocery list →
              </Link>
            </div>
          )}
        </div>
      </FoodHomeColumn>
    </section>
  );
}

function ReadinessMessage({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'error';
}) {
  return (
    <p
      className={cn(
        'border-t border-white/15 py-5 text-sm leading-relaxed antialiased',
        tone === 'error' ? 'text-semantic-error' : 'text-white/55',
      )}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {children}
    </p>
  );
}
