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
  onShiftMonth,
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
  onShiftMonth: (delta: -1 | 1) => void;
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

  if (model.status === 'no_schedule') {
    return (
      <section className="relative w-full px-6 sm:px-12" aria-labelledby="plans-heading">
        <PlansHomeColumn>
          <p className="text-2xl font-semibold text-white">Plans</p>
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
      className={cn('relative w-full px-6 sm:px-12', openRowKey ? 'z-20' : 'z-0')}
      aria-labelledby="plans-heading"
    >
      <PlansHomeColumn>
        <p className="text-2xl font-semibold text-white">Plans</p>
        <h1
          id="plans-heading"
          className="mt-1 text-[2.5rem] font-normal leading-none tracking-tight text-white sm:text-[2.75rem]"
        >
          Your week overview
        </h1>
        <p className="mt-2 text-base font-light leading-relaxed text-white/50">
          See what’s planned and shape the week ahead.
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
            {model.status === 'no_active_plan' && (
              <p className="mt-5 text-sm text-white/55">
                Nothing is planned for this date yet. Choose a meal window to begin.
              </p>
            )}
            {model.status === 'out_of_range' && model.errorMessage && (
              <p className="mt-5 text-sm text-white/55">{model.errorMessage}</p>
            )}

            <div className="mt-6 -mx-1 overflow-x-auto border-b border-white/15 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        'min-w-[100px] flex-1 rounded-t-xl px-2 py-2 text-sm font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/60',
                        selected
                          ? 'border border-b-0 border-white/20 bg-white/[0.06] text-white'
                          : 'text-white/75 hover:bg-white/[0.04] hover:text-white',
                      )}
                    >
                      {day.weekdayShort} {day.dayOfMonth}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-white/15 px-2 py-2 text-xs text-white/45">
              <span>{monthLabel(model.selectedDate)}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => onShiftMonth(-1)}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10 hover:text-white"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => onShiftMonth(1)}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10 hover:text-white"
                >
                  ›
                </button>
              </div>
            </div>

            <ul className="my-1" role="list">
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
                        'relative flex min-h-12 items-start gap-3 rounded-lg px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/30 sm:gap-4',
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
                      <div className="flex w-[4.5rem] shrink-0 items-start text-sm text-white/45">
                        <span>{row.targetTimeLabel}</span>
                        <span className="ml-1 pt-0.5 text-[7px]">
                          {periodLabelFromTimeValue(row.targetTimeValue)}
                        </span>
                      </div>
                      <span className="mt-1.5 text-white/60">
                        <MealStateMarker planned={Boolean(row.mealId)} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-baseline gap-4">
                          <span className="w-28 shrink-0 text-sm text-white/55 sm:w-36">
                            {row.label}
                          </span>
                          {row.mealId ? (
                            <span className="truncate text-left text-sm text-white/65">
                              {row.mealName?.trim() || 'Planned meal'}
                            </span>
                          ) : active ? (
                            <span className="text-left text-sm font-medium text-white/45">
                              Create a meal
                            </span>
                          ) : (
                            <span className="h-5" aria-hidden />
                          )}
                        </div>
                        {active && status && (
                          <p className="mt-1 pl-32 text-xs text-white/35 sm:pl-40">{status}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-expanded={active}
                        aria-label={`${active ? 'Collapse' : 'Expand'} ${row.label}`}
                        disabled={busy}
                        onClick={() =>
                          setOpenRowKey((current) => current === row.slotKey ? null : row.slotKey)
                        }
                        className="grid h-7 w-8 shrink-0 place-items-center rounded-md text-base text-white/55 hover:bg-white/10 hover:text-white"
                      >
                        {active ? '⌃' : '⌄'}
                      </button>
                    </div>
                    {active && (
                      <div className="mx-2 mb-3 rounded-b-xl bg-black/15 px-4 pb-4 pt-1">
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

            {rowError && (
              <p className="mt-3 text-sm text-semantic-error" role="alert">{rowError}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-white/15 px-2 py-3 text-xs">
              <span className="font-semibold text-white/65">Summary</span>
              <span className="text-white/45">
                Planned {model.plannedCount} of {model.totalCount}
              </span>
              <span className="text-white/45">
                NDS {model.projectedNds == null ? '—' : Math.round(model.projectedNds)}
              </span>
              <span className="text-white/45">
                {model.plannedCalories == null ? '—' : Math.round(model.plannedCalories)} cal
                {' '}of {model.dailyCalorieGoal == null ? '—' : Math.round(model.dailyCalorieGoal)}
              </span>
            </div>
          </>
        )}
      </PlansHomeColumn>
    </section>
  );
}

function periodLabelFromTimeValue(hhmm: string): 'AM' | 'PM' {
  const hour = Number(hhmm.split(':')[0]);
  return Number.isFinite(hour) && hour >= 12 ? 'PM' : 'AM';
}
