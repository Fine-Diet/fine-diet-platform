'use client';

import {
  useEffect,
  useState,
} from 'react';

import { PlanMealComposerPanel } from '@/components/journal/plans/PlanMealComposerPanel';
import { MealStateMarker } from '@/components/plans/home/MealStateMarker';
import { PlansHomeColumn } from '@/components/plans/home/PlansHomeColumn';
import type {
  PlansLogMealHandler,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
} from '@/lib/plans/home/types';
import type { PlanComposerDraftIdentity } from '@/lib/plans/planComposerDraftStore';
import { cn } from '@/lib/utils';
import type { MealSlotKey, PlannedMeal, PlanSlot, PlanSlotBlock } from '@/lib/plans/types';

function monthLabel(dateKey: string): string {
  const [year, month] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function rowStatus(row: PlansMealGuidanceRow): string | null {
  if (row.state === 'eaten') return 'Logged';
  if (row.state === 'skipped') return 'Skipped — planning remains complete';
  if (row.mealId) return 'Planned';
  return null;
}

function slotBlockForTime(time: string): PlanSlotBlock {
  const hour = Number(time.split(':')[0]);
  if (Number.isFinite(hour) && hour < 11) return 'morning';
  if (Number.isFinite(hour) && hour < 17) return 'midday';
  return 'evening';
}

function authoringSlot(row: PlansMealGuidanceRow): PlanSlot {
  return row.planSlot ?? {
    id: '',
    plan_day_id: '',
    person_id: '',
    slot_block: slotBlockForTime(row.targetTimeValue),
    slot_ordinal: 0,
    slot_label: row.label,
    target_time: row.targetTimeValue,
    created_at: '',
    updated_at: '',
  };
}

function draftIdentityForRow(
  row: PlansMealGuidanceRow,
  planId: string | null,
  dateLocal: string,
): PlanComposerDraftIdentity | undefined {
  if (row.meal?.plan_slot_id) {
    return {
      personId: row.meal.person_id,
      planId: row.meal.plan_id,
      planDayId: row.meal.plan_day_id,
      planSlotId: row.meal.plan_slot_id,
      dateLocal,
    };
  }
  if (!planId || !row.planSlot?.id || !row.planSlot.plan_day_id || !row.planSlot.person_id) {
    return undefined;
  }
  return {
    personId: row.planSlot.person_id,
    planId,
    planDayId: row.planSlot.plan_day_id,
    planSlotId: row.planSlot.id,
    dateLocal,
  };
}

export function MealGuidanceModule({
  model,
  onSelectDate,
  onShiftWeek,
  onLog,
  onOpenLog,
  onResolveTarget,
  onCreateSaved,
  onEditSaved,
  onSetupRhythm,
  onRetry,
}: {
  model: PlansMealGuidanceViewModel;
  onSelectDate: (date: string) => void;
  onShiftWeek: (delta: -1 | 1) => void;
  onLog: PlansLogMealHandler;
  onOpenLog: (row: PlansMealGuidanceRow) => void;
  onResolveTarget: (row: PlansMealGuidanceRow) => Promise<{
    planId: string;
    planDayId: string;
    planSlotId: string;
    dateLocal?: string;
    slotKey?: MealSlotKey;
  }>;
  onCreateSaved: (result: {
    meal: PlannedMeal;
    target: {
      planId: string;
      planDayId: string;
      planSlotId: string;
      dateLocal?: string;
      slotKey?: MealSlotKey;
    };
  }) => void | Promise<void>;
  onEditSaved: () => void | Promise<void>;
  onSetupRhythm: () => void;
  onRetry: () => void;
}) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    setOpenRowKey(null);
    setRowError(null);
  }, [model.selectedDate]);

  async function handleLog(row: PlansMealGuidanceRow) {
    setBusyRowKey(row.slotKey);
    setRowError(null);
    const result = await onLog(row);
    setBusyRowKey(null);
    setOpenRowKey(null);
    if (!result.ok) {
      setRowError(result.errorMessage ?? 'Could not open this planned meal in Log.');
    }
  }

  const breadcrumbRow = (
    <div
      className="overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-plans-breadcrumb
    >
      <div className="flex items-center gap-2 text-2xl font-semibold text-white">
        <span>Plans</span>
        <span aria-hidden className="text-4xl font-light leading-none text-white">›</span>
        <span>Overview</span>
      </div>
    </div>
  );

  if (model.status === 'no_schedule') {
    return (
      <section className="relative w-full px-5 sm:px-5" aria-labelledby="plans-heading">
        <PlansHomeColumn>
          {breadcrumbRow}
          <h1
            id="plans-heading"
            className="mt-1 text-[2.5rem] font-normal leading-none tracking-tight text-white sm:text-[2.75rem]"
          >
            Set your meal rhythm
          </h1>
          <p className="mt-2 text-base font-light text-white/50">
            Add meal windows in your profile so Plans can guide today.
          </p>
          <button
            type="button"
            onClick={onSetupRhythm}
            className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90"
          >
            Set meal windows
          </button>
        </PlansHomeColumn>
      </section>
    );
  }

  return (
    <section
      className={cn('relative w-full px-5 sm:px-12', openRowKey ? 'z-20' : 'z-0')}
      aria-labelledby="plans-heading"
    >
      <PlansHomeColumn>
        {breadcrumbRow}
        <h1
          id="plans-heading"
          className="mt-1 text-[2.5rem] font-normal leading-none tracking-tight text-white sm:text-[2.75rem]"
        >
          Your summary by week
        </h1>
        <p className="mt-1 text-sm font-semibold text-white/50">
          {monthLabel(model.selectedDate)}
        </p>

        {model.status === 'loading' && (
          <p className="mt-10 text-sm text-white/50">Loading your planning week…</p>
        )}

        {model.status === 'error' && (
          <div className="mt-8">
            <p className="text-sm text-semantic-error" role="alert">
              {model.errorMessage ?? 'Could not load Plans Home.'}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Try again
            </button>
          </div>
        )}

        {model.status !== 'loading' && model.status !== 'error' && (
          <>
            <div className="mt-4 flex items-stretch -mx-1 border-b border-white/15" data-plans-week-tabs>
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => onShiftWeek(-1)}
                className="grid shrink-0 place-items-center self-center pl-2 text-xl text-white/50 hover:text-white"
              >
                ‹
              </button>
              <div className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-[700px]" role="tablist" aria-label="Planning week">
                  {model.days.map((day) => {
                    const selected = day.date === model.selectedDate;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onSelectDate(day.date)}
                        className={cn(
                          'min-w-[100px] flex-1 rounded-t-xl px-2 py-3 text-xl font-semibold transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/60',
                          selected
                            ? 'border border-b-0 border-white/20 bg-white text-black'
                            : 'border border-white/50 text-white/75 hover:bg-white/[0.04] hover:text-white',
                        )}
                      >
                        {day.weekdayShort} {day.dayOfMonth}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => onShiftWeek(1)}
                className="grid shrink-0 place-items-center self-center pr-2 text-xl text-white/50 hover:text-white"
              >
                ›
              </button>
            </div>

            <ul className="my-1 -mx-1" role="list">
              {model.rows.map((row) => {
                const active = openRowKey === row.slotKey;
                const busy = busyRowKey === row.slotKey;
                const status = rowStatus(row);

                return (
                  <li
                    key={row.slotKey}
                    className={cn('relative', openRowKey === row.slotKey && 'z-20')}
                  >
                    <div
                      className={cn(
                        'relative flex min-h-12 items-center gap-4 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30',
                        active && 'bg-black/15',
                      )}
                      onClick={(event) => {
                        if (!(event.target as HTMLElement).closest('button, input, select, textarea')) {
                          setOpenRowKey((current) =>
                            current === row.slotKey ? null : row.slotKey,
                          );
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-white/60">
                            <MealStateMarker planned={Boolean(row.mealId)} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-base text-white/50">
                              {row.targetTimeLabel} {periodLabelFromTimeValue(row.targetTimeValue)}
                            </p>
                            <p className="text-xl text-white">{row.label}</p>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-expanded={active}
                        aria-label={`${active ? 'Collapse' : 'Expand'} ${row.label}`}
                        disabled={busy}
                        onClick={() =>
                          setOpenRowKey((current) => current === row.slotKey ? null : row.slotKey)
                        }
                        className="grid h-7 w-8 shrink-0 place-items-center rounded-md text-base text-white/55 hover:text-white"
                      >
                        <svg
                          aria-hidden
                          className={`h-[15px] w-[15px] flex-shrink-0 transition-transform duration-200 ${
                            active ? 'rotate-180' : ''
                          }`}
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <polygon points="12,18 2,6 22,6" />
                        </svg>
                      </button>
                    </div>
                    {active && (
                      <div className="mb-3 bg-black/15 px-4 pb-4 pt-1">
                        {row.state === 'pending' && row.meal ? (
                          <PlanMealComposerPanel
                            key={row.meal.id}
                            mode="edit"
                            meal={row.meal}
                            presentation="capture-draft"
                            density="compact"
                            primaryLabel="Save"
                            draftIdentity={draftIdentityForRow(
                              row,
                              model.planId,
                              model.selectedDate,
                            )}
                            onSubmittingChange={(value) =>
                              setBusyRowKey(value ? row.slotKey : null)
                            }
                            onSaved={async () => {
                              await onEditSaved();
                              setOpenRowKey(null);
                            }}
                            onCancel={() => setOpenRowKey(null)}
                          />
                        ) : row.state === 'empty' ? (
                          <PlanMealComposerPanel
                            key={`${model.selectedDate}:${row.slotKey}`}
                            mode="create"
                            slot={authoringSlot(row)}
                            presentation="capture-draft"
                            density="compact"
                            primaryLabel="Save"
                            createContext="plans_home"
                            draftIdentity={draftIdentityForRow(
                              row,
                              model.planId,
                              model.selectedDate,
                            )}
                            resolveTarget={() => onResolveTarget(row)}
                            onSubmittingChange={(value) =>
                              setBusyRowKey(value ? row.slotKey : null)
                            }
                            onSaved={async (result) => {
                              await onCreateSaved(result);
                              setOpenRowKey(null);
                            }}
                            onCancel={() => setOpenRowKey(null)}
                          />
                        ) : (
                          <div className="flex flex-wrap items-center gap-3 py-2">
                            <span className="text-xs text-white/45">{status}</span>
                            {row.journalEntryId && (
                              <button
                                type="button"
                                onClick={() => onOpenLog(row)}
                                className="text-xs font-semibold text-white/70 hover:text-white"
                              >
                                Open Log entry
                              </button>
                            )}
                          </div>
                        )}
                        {row.state === 'pending' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleLog(row)}
                            className="mt-3 text-xs font-semibold text-white/60 hover:text-white"
                          >
                            Quick Log
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/15 px-4 py-4 text-xs"
              data-plans-summary
            >
              <span className="font-semibold text-white/50">
                Planned meals {model.plannedCount} of {model.totalCount}
              </span>
              <span className="font-semibold text-white/50">
                NDS: {model.projectedNds == null ? '—' : Math.round(model.projectedNds)}
              </span>
              <span className="font-semibold text-white/50">
                kCal:{' '}
                {model.plannedCalories == null ? '—' : Math.round(model.plannedCalories)}
                /{model.dailyCalorieGoal == null ? '—' : Math.round(model.dailyCalorieGoal)}
              </span>
            </div>

            {rowError && (
              <p className="mt-3 text-sm text-semantic-error" role="alert">{rowError}</p>
            )}
          </>
        )}
      </PlansHomeColumn>
    </section>
  );
}

function periodLabelFromTimeValue(hhmm: string): 'am' | 'pm' {
  const hour = Number(hhmm.split(':')[0]);
  return Number.isFinite(hour) && hour >= 12 ? 'pm' : 'am';
}

function weekOverviewDescription(model: PlansMealGuidanceViewModel): string {
  if (model.status === 'no_active_plan') {
    return 'Nothing is planned for this date yet. Choose a meal window to begin.';
  }
  if (model.status === 'out_of_range' && model.errorMessage) {
    return model.errorMessage;
  }
  return 'See what’s planned and shape the week ahead.';
}
