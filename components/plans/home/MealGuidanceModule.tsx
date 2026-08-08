'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { MealStateMarker } from '@/components/plans/home/MealStateMarker';
import { PlansHomeColumn } from '@/components/plans/home/PlansHomeColumn';
import {
  contextualActionForRow,
  type PlansLogMealHandler,
  type PlansMealGuidanceRow,
  type PlansMealGuidanceViewModel,
} from '@/lib/plans/home/types';
import { cn } from '@/lib/utils';

type MenuAction = 'log' | 'plan' | 'update';

export function MealGuidanceModule({
  model,
  onSelectDate,
  onLog,
  onPlan,
  onUpdate,
}: {
  model: PlansMealGuidanceViewModel;
  onSelectDate: (date: string) => void;
  onLog: PlansLogMealHandler;
  onPlan: (row: PlansMealGuidanceRow) => void;
  onUpdate: (row: PlansMealGuidanceRow) => void;
}) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenRowKey(null);
    setRowError(model.errorMessage ?? null);
  }, [model.selectedDate, model.errorMessage]);

  async function handleLog(row: PlansMealGuidanceRow) {
    setBusyRowKey(row.slotKey);
    setRowError(null);
    const result = await onLog(row);
    setBusyRowKey(null);
    setOpenRowKey(null);
    if (!result.ok) {
      setRowError(result.errorMessage ?? 'Could not update this meal. Try again.');
    }
  }

  return (
    <section
      className={cn(
        'relative w-full px-12 sm:px-12',
        openRowKey ? 'z-20' : 'z-0',
      )}
      aria-labelledby="plans-meal-guidance-heading"
    >
      <PlansHomeColumn>
        <p className="text-[1.5rem] font-semibold text-white antialiased">Plans</p>
        <h1
          id="plans-meal-guidance-heading"
          className="mt-1 text-[2.75rem] font-regular leading-[1] tracking-tight text-white antialiased md:text-[2.75rem]"
        >
          Plan for consistency
        </h1>
        <p className="mt-1 text-base font-light leading-relaxed text-white/55 antialiased">
          See what’s planned, what needs attention, and shape the days ahead.
        </p>

        {model.status === 'loading' && (
          <p className="mt-10 text-sm text-white/50 antialiased">Loading meal guidance…</p>
        )}

        {model.status === 'no_active_plan' && (
          <p className="mt-10 text-sm text-white/55 antialiased">
            No active plan yet. Create a daily or weekly plan to guide meals here.
          </p>
        )}

        {model.status === 'no_schedule' && (
          <p className="mt-10 text-sm text-white/55 antialiased">
            No meal schedule enabled. Set meal windows in your profile to see guidance markers.
          </p>
        )}

        {model.status === 'out_of_range' && (
          <div className="mt-10 space-y-4">
            <p className="text-sm text-white/55 antialiased">
              {model.errorMessage ??
                'This active plan’s dates are outside today. Create a new plan or open the weekly planner.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/app/plans/week?action=generate"
                className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-white/90"
              >
                Create Weekly Plan
              </a>
              <a
                href="/app/plans/today"
                className="inline-flex items-center rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
              >
                Create Daily Plan
              </a>
            </div>
          </div>
        )}

        {model.status === 'error' && (
          <p className="mt-10 text-sm text-semantic-error antialiased" role="alert">
            {model.errorMessage ?? 'Could not load meal guidance.'}
          </p>
        )}

        {model.status === 'ready' && (
          <>
            <div className="mt-6 -mx-1 overflow-x-auto border-b border-white/15 px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div
                className="flex w-full gap-2 sm:gap-[.5px]"
                role="tablist"
                aria-label="Plan week"
              >
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
                        'flex min-w-[110px] flex-1 flex-col items-center rounded-t-xl px-2 pt-[6px] pb-[3px] text-regular font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/50',
                        selected
                          ? 'border border-white/15 bg-white/5 border-b-0 bg-none text-white'
                          : 'text-white hover:bg-white/5',
                      )}
                    >
                      <span className="text-regular font-semibold antialiased my-0">
                        {day.weekdayShort} {day.dayOfMonth}
                      </span>
                      <span className="mt-[-11px] flex items-center gap-1">
                        {day.markers.map((marker) => (
                          <span
                            key={marker.slotKey}
                            className={selected ? 'text-white' : 'text-white/50'}
                          >
                            <MealStateMarker state={marker.state} />
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <ul className="-mx-1 my-2" role="list">
              {model.rows.map((mealRow) => {
                const action = contextualActionForRow(mealRow.state);
                const active =
                  openRowKey === mealRow.slotKey ||
                  hoveredKey === mealRow.slotKey ||
                  focusedKey === mealRow.slotKey;
                const busy = busyRowKey === mealRow.slotKey;

                return (
                  <li
                    key={mealRow.slotKey}
                    className={cn('relative', openRowKey === mealRow.slotKey && 'z-20')}
                  >
                    <div
                      className={cn(
                        'flex w-full items-center gap-3 py-3 px-4 transition-colors sm:gap-4',
                        active && 'bg-brand-900 border border-white/5 rounded-lg sm:rounded-full',
                        mealRow.state === 'skipped' && 'opacity-60',
                      )}
                      onMouseEnter={() => setHoveredKey(mealRow.slotKey)}
                      onMouseLeave={() => setHoveredKey(null)}
                    >
                      <div className="flex w-14 shrink-0 items-start gap-0.5 text-white/70 antialiased sm:w-16">
                        <span className="text-regular">{mealRow.targetTimeLabel}</span>
                        <span className="text-[6px] pt-1 pl-.5 leading-none">
                          {periodLabelFromTimeValue(mealRow.targetTimeValue)}
                        </span>
                      </div>
                      <RowActionControl
                        row={mealRow}
                        label={busy ? 'Saving…' : action.label}
                        marker={action.marker}
                        expanded={openRowKey === mealRow.slotKey}
                        revealed={active}
                        disabled={busy || mealRow.state === 'unknown'}
                        onToggle={() =>
                          setOpenRowKey((prev) =>
                            prev === mealRow.slotKey ? null : mealRow.slotKey,
                          )
                        }
                        onMenuAction={(menuAction) => {
                          if (menuAction === 'log') void handleLog(mealRow);
                          if (menuAction === 'plan') {
                            setOpenRowKey(null);
                            onPlan(mealRow);
                          }
                          if (menuAction === 'update') {
                            setOpenRowKey(null);
                            onUpdate(mealRow);
                          }
                        }}
                        onFocus={() => setFocusedKey(mealRow.slotKey)}
                        onBlur={() => setFocusedKey(null)}
                      />
                      <div
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-6 sm:gap-10',
                          active && 'ml-3 sm:ml-6',
                        )}
                      >
                        <span className="w-24 sm:w-36 shrink-0 text-left text-regular leading-tight font-regular text-white/50 antialiased">
                          {mealRow.label}
                        </span>
                        <span className="min-w-0 flex-1 text-left text-regular leading-tight text-white/50 antialiased">
                          {mealRow.mealName ?? 'No meal planned'}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {rowError && (
              <p className="mt-4 text-sm text-semantic-error antialiased" role="alert">
                {rowError}
              </p>
            )}
          </>
        )}
        <div className="border-b border-white/15"></div>
      
      </PlansHomeColumn>
    </section>
  );
}

function periodLabelFromTimeValue(hhmm: string): 'AM' | 'PM' {
  const hour = Number(hhmm.split(':')[0]);
  return Number.isFinite(hour) && hour >= 12 ? 'PM' : 'AM';
}

function RowActionControl({
  row,
  label,
  marker,
  expanded,
  revealed,
  disabled,
  onToggle,
  onMenuAction,
  onFocus,
  onBlur,
}: {
  row: PlansMealGuidanceRow;
  label: string;
  marker: ReturnType<typeof contextualActionForRow>['marker'];
  expanded: boolean;
  revealed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onMenuAction: (action: MenuAction) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const showFull = revealed || expanded;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const hasMeal = Boolean(row.mealId);

  const items: { id: MenuAction; label: string; glyph: ReactNode; disabled?: boolean }[] = [
    { id: 'log', label: 'Log', glyph: <MealStateMarker state="eaten" size="md" /> },
    { id: 'plan', label: 'Plan', glyph: <MealStateMarker state="empty" size="md" /> },
    {
      id: 'update',
      label: 'Update',
      glyph: <MealStateMarker state="pending" size="md" />,
      disabled: !hasMeal,
    },
  ];

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onToggle();
    };
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      onToggle();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', onPointer);
      window.addEventListener('touchstart', onPointer);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [expanded, onToggle]);

  const showPill = showFull || expanded;
  const pillButtonClass = cn(
    'inline-flex shrink-0 items-center text-sm font-medium text-white antialiased transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/50',
    showPill
      ? 'gap-2 border border-white/25 px-3'
      : 'rounded-full border border-transparent p-0.5',
    expanded
      ? 'rounded-t-xl rounded-b-none border-b-0 bg-brand-900'
      : showPill
        ? 'rounded-full hover:bg-white/10'
        : '',
    disabled && 'cursor-not-allowed opacity-40',
  );

  return (
    <div ref={menuRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-label={showPill ? undefined : label}
        disabled={disabled}
        onClick={onToggle}
        onFocus={onFocus}
        onBlur={onBlur}
        className={pillButtonClass}
      >
        {showPill ? (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-2',
                expanded && 'invisible',
              )}
            >
              <MarkerGlyphSlot>
                <ActionGlyph marker={marker} />
              </MarkerGlyphSlot>
              <span className="translate-y-[1px] leading-none text-white/60">{label}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                'text-[8px] text-white/60 pl-2 pt-1.5 pb-1',
                !expanded && 'border-l border-white/30',
              )}
            >
              ▼
            </span>
          </>
        ) : (
          <MarkerGlyphSlot>
            <ActionGlyph marker={marker} />
          </MarkerGlyphSlot>
        )}
      </button>

      {expanded ? (
        <div
          className="absolute left-0 top-full z-30 w-full rounded-b-xl border border-t-0 border-white/25 bg-brand-900 shadow-large"
        >
          <div role="menu" aria-labelledby={titleId} className="divide-y divide-white/15">
            <p id={titleId} className="sr-only">
              Actions for {row.label}
            </p>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => onMenuAction(item.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-white antialiased',
                  'transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none',
                  'last:rounded-b-xl',
                  item.disabled && 'cursor-not-allowed opacity-35',
                )}
              >
                <MarkerGlyphSlot>{item.glyph}</MarkerGlyphSlot>
                <span className="leading-none text-white/60">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarkerGlyphSlot({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center leading-none">
      {children}
    </span>
  );
}

function ActionGlyph({
  marker,
}: {
  marker: ReturnType<typeof contextualActionForRow>['marker'];
}) {
  if (marker === 'check') return <MealStateMarker state="eaten" size="md" />;
  if (marker === 'hollow') return <MealStateMarker state="empty" size="md" />;
  if (marker === 'filled') return <MealStateMarker state="pending" size="md" />;
  if (marker === 'skipped') return <MealStateMarker state="skipped" size="md" />;
  return <MealStateMarker state="unknown" size="md" />;
}
