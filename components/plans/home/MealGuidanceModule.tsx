'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

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
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
        'relative z-0 bg-gradient-to-b from-[#17130f] via-brand-900 to-[#463c2f]',
        'pb-10 pt-10 sm:pb-12 sm:pt-12',
      )}
      aria-labelledby="plans-meal-guidance-heading"
    >
      <PlansHomeColumn>
        <p className="text-sm font-medium text-white/75 antialiased">Plans</p>
        <h1
          id="plans-meal-guidance-heading"
          className="mt-3 text-4xl font-semibold leading-tight text-white antialiased sm:text-5xl"
        >
          Plan for consistency
        </h1>
        <p className="mt-3 max-w-[40ch] text-base font-light leading-relaxed text-white/55 antialiased">
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
            <div className="mt-10 -mx-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-2 sm:gap-3" role="tablist" aria-label="Plan week">
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
                        'flex min-w-[4.25rem] flex-col items-center rounded-2xl px-3 py-3 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/50',
                        selected
                          ? 'bg-white text-neutral-900'
                          : 'text-white hover:bg-white/10',
                      )}
                    >
                      <span className="text-xs font-medium antialiased">
                        {day.weekdayShort} {day.dayOfMonth}
                      </span>
                      <span className="mt-2 flex items-center gap-1">
                        {day.markers.map((marker) => (
                          <span
                            key={marker.slotKey}
                            className={selected ? 'text-neutral-900' : 'text-white'}
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

            <ul className="mt-6 border-t border-white/15" role="list">
              {model.rows.map((mealRow) => {
                const action = contextualActionForRow(mealRow.state);
                const active =
                  openRowKey === mealRow.slotKey ||
                  hoveredKey === mealRow.slotKey ||
                  focusedKey === mealRow.slotKey;
                const busy = busyRowKey === mealRow.slotKey;

                return (
                  <li key={mealRow.slotKey} className="relative border-b border-white/15">
                    <div
                      className={cn(
                        'flex w-full items-center gap-3 px-2 py-4 transition-colors sm:gap-4 sm:px-3',
                        active && 'bg-black/30',
                        mealRow.state === 'skipped' && 'opacity-60',
                      )}
                      onMouseEnter={() => setHoveredKey(mealRow.slotKey)}
                      onMouseLeave={() => setHoveredKey(null)}
                    >
                      <div className="w-14 shrink-0 text-sm text-white/70 antialiased sm:w-16">
                        {mealRow.targetTimeLabel}
                      </div>
                      <MealStateMarker state={mealRow.state} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-base font-semibold text-white antialiased">
                            {mealRow.label}
                          </span>
                          <span className="text-sm text-white/50 antialiased">
                            {mealRow.mealName ?? 'No meal planned'}
                          </span>
                        </div>
                      </div>
                      <RowActionControl
                        label={busy ? 'Saving…' : action.label}
                        marker={action.marker}
                        expanded={openRowKey === mealRow.slotKey}
                        disabled={busy || mealRow.state === 'unknown'}
                        buttonRef={(node) => {
                          triggerRefs.current[mealRow.slotKey] = node;
                        }}
                        onToggle={() =>
                          setOpenRowKey((prev) =>
                            prev === mealRow.slotKey ? null : mealRow.slotKey,
                          )
                        }
                        onFocus={() => setFocusedKey(mealRow.slotKey)}
                        onBlur={() => setFocusedKey(null)}
                      />
                    </div>

                    {openRowKey === mealRow.slotKey && (
                      <RowActionMenu
                        row={mealRow}
                        anchorRef={{ current: triggerRefs.current[mealRow.slotKey] }}
                        onClose={() => setOpenRowKey(null)}
                        onAction={(menuAction) => {
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
                      />
                    )}
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
      </PlansHomeColumn>
    </section>
  );
}

function RowActionControl({
  label,
  marker,
  expanded,
  disabled,
  buttonRef,
  onToggle,
  onFocus,
  onBlur,
}: {
  label: string;
  marker: ReturnType<typeof contextualActionForRow>['marker'];
  expanded: boolean;
  disabled?: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onToggle}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border border-white/25 px-3 py-1.5',
        'text-sm font-medium text-white antialiased transition-colors',
        'hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-denim-500/50',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <ActionGlyph marker={marker} />
      <span>{label}</span>
      <span aria-hidden className="text-[10px] text-white/60">
        {expanded ? '▲' : '▼'}
      </span>
    </button>
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

function RowActionMenu({
  row,
  anchorRef,
  onClose,
  onAction,
}: {
  row: PlansMealGuidanceRow;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onAction: (action: MenuAction) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const hasMeal = Boolean(row.mealId);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(220, Math.max(180, window.innerWidth - 32));
    const left = Math.min(Math.max(16, rect.right - width), window.innerWidth - width - 16);
    const estimatedHeight = 160;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top =
      spaceBelow < estimatedHeight && rect.top > spaceBelow
        ? Math.max(12, rect.top - estimatedHeight - 8)
        : rect.bottom + 8;
    setCoords({ top, left, width });
  }, [anchorRef]);

  useEffect(() => {
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
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
  }, [anchorRef, onClose]);

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

  if (!mounted) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-labelledby={titleId}
      style={
        coords
          ? { top: coords.top, left: coords.left, width: coords.width }
          : { visibility: 'hidden', top: 0, left: 0, width: 200 }
      }
      className="fixed z-[80] rounded-[20px] border border-white/30 bg-brand-900 p-2 shadow-large"
    >
      <p id={titleId} className="sr-only">
        Actions for {row.label}
      </p>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => onAction(item.id)}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base text-white antialiased',
            'transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none',
            item.disabled && 'cursor-not-allowed opacity-35',
          )}
        >
          {item.glyph}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
