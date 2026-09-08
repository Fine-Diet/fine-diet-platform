'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { MealStateMarker } from '@/components/plans/home/MealStateMarker';
import { PlansHomeColumn } from '@/components/plans/home/PlansHomeColumn';
import type {
  PlansLogMealHandler,
  PlansMealGuidanceRow,
  PlansMealGuidanceViewModel,
} from '@/lib/plans/home/types';
import { cn } from '@/lib/utils';

type MenuAction = 'log' | 'plan' | 'update' | 'open_log';

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

export function MealGuidanceModule({
  model,
  onSelectDate,
  onShiftMonth,
  onLog,
  onPlan,
  onUpdate,
  onOpenLog,
  onSetupRhythm,
  onRetry,
}: {
  model: PlansMealGuidanceViewModel;
  onSelectDate: (date: string) => void;
  onShiftMonth: (delta: -1 | 1) => void;
  onLog: PlansLogMealHandler;
  onPlan: (row: PlansMealGuidanceRow) => void;
  onUpdate: (row: PlansMealGuidanceRow) => void;
  onOpenLog: (row: PlansMealGuidanceRow) => void;
  onSetupRhythm: () => void;
  onRetry: () => void;
}) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

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
                No active plan yet. Choose a meal window to begin planning.
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
                const active =
                  openRowKey === row.slotKey ||
                  hoveredKey === row.slotKey ||
                  focusedKey === row.slotKey;
                const busy = busyRowKey === row.slotKey;
                const status = rowStatus(row);

                return (
                  <li
                    key={row.slotKey}
                    className={cn('relative', openRowKey === row.slotKey && 'z-20')}
                  >
                    <div
                      className={cn(
                        'relative flex min-h-12 items-start gap-3 rounded-lg px-2 py-3 transition-colors sm:gap-4',
                        active && 'bg-black/15',
                      )}
                      onMouseEnter={() => setHoveredKey(row.slotKey)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onFocusCapture={() => setFocusedKey(row.slotKey)}
                      onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setFocusedKey(null);
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
                            <button
                              type="button"
                              onClick={() => onUpdate(row)}
                              className="truncate text-left text-sm text-white/65 hover:text-white focus-visible:outline-none focus-visible:underline"
                            >
                              {row.mealName?.trim() || 'Planned meal'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onPlan(row)}
                              className="text-left text-sm font-medium text-white/45 hover:text-white"
                            >
                              Add meal
                            </button>
                          )}
                        </div>
                        {active && status && (
                          <p className="mt-1 pl-32 text-xs text-white/35 sm:pl-40">{status}</p>
                        )}
                      </div>
                      <RowMenu
                        row={row}
                        expanded={openRowKey === row.slotKey}
                        busy={busy}
                        onToggle={() =>
                          setOpenRowKey((current) => current === row.slotKey ? null : row.slotKey)
                        }
                        onAction={(action) => {
                          if (action === 'log') void handleLog(row);
                          if (action === 'plan') onPlan(row);
                          if (action === 'update') onUpdate(row);
                          if (action === 'open_log') onOpenLog(row);
                          if (action !== 'log') setOpenRowKey(null);
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {rowError && (
              <p className="mt-3 text-sm text-semantic-error" role="alert">{rowError}</p>
            )}

            <div className="mt-2 flex items-center gap-6 border-y border-white/15 px-2 py-3 text-xs">
              <span className="font-semibold text-white/65">Summary</span>
              <span className="text-white/45">
                Planned {model.plannedCount} of {model.totalCount}
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

function RowMenu({
  row,
  expanded,
  busy,
  onToggle,
  onAction,
}: {
  row: PlansMealGuidanceRow;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onAction: (action: MenuAction) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  const items: Array<{ id: MenuAction; label: string; glyph: ReactNode }> =
    row.state === 'empty'
      ? [{ id: 'plan', label: 'Plan meal', glyph: '+' }]
      : row.state === 'eaten'
        ? [
            { id: 'update', label: 'Open / Edit', glyph: '↗' },
            ...(row.journalEntryId
              ? [{ id: 'open_log' as const, label: 'Open Log entry', glyph: '↗' }]
              : []),
          ]
        : row.state === 'skipped'
          ? [{ id: 'update', label: 'Review / Edit', glyph: '↗' }]
          : [
              { id: 'update', label: 'Open / Edit', glyph: '↗' },
              { id: 'log', label: 'Quick Log', glyph: '→' },
            ];

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggle();
    };
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onToggle();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer);
      window.addEventListener('touchstart', onPointer);
    }, 0);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [expanded, onToggle]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-label={`Actions for ${row.label}`}
        disabled={busy}
        onClick={onToggle}
        className="grid h-7 w-8 place-items-center rounded-md text-lg tracking-[0.12em] text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/60"
      >
        {busy ? '…' : '•••'}
      </button>
      {expanded && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-white/15 bg-[#211a14] py-1 shadow-large"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => onAction(item.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-white/65 hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none"
            >
              <span>{item.label}</span>
              <span aria-hidden className="text-white/35">{item.glyph}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
