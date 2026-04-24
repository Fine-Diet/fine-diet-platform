'use client';

/**
 * SlotCard
 *
 * Renders a single plan_slot with its planned meals.
 *
 * Packet 36: accepts `meals: PlannedMeal[]` (was `meal: PlannedMeal | null`)
 * so every meal attached to a slot is visible and independently manageable.
 *
 * Rendering rules:
 *   - 0 meals: "No meal planned" + Add/Eat-out buttons (unchanged)
 *   - 1 meal:  existing single-meal layout (unchanged visually)
 *   - 2+ meals: stacked meal rows separated by a divider; each row has its
 *               own Edit/Remove actions and an import-provenance link when
 *               source_imported_meal_id is set. Regenerate is suppressed for
 *               import-derived meals (AI replacement doesn't apply to them).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  PlanSlot,
  PlannedMeal,
  NDSConfidence,
  PlannedEatOutEvent,
  MealReadinessResult,
  PlannedMealExecutionState,
} from '@/lib/plans';

interface SlotCardProps {
  slot: PlanSlot;
  /** All meals attached to this slot. Empty array = no meal planned. */
  meals: PlannedMeal[];
  /**
   * Packet 5: eat-out event bound to this slot. When present, we show
   * an "Eat-out · <venue>" origin badge and a link into the event
   * detail. Recommendation context (rationale/watchouts/modifications)
   * stays on the event and is never surfaced on the slot meal card.
   */
  eatOutEvent?: PlannedEatOutEvent | null;
  onRegenerate?: (meal: PlannedMeal) => void;
  onEdit?: (meal: PlannedMeal) => void;
  onRemove?: (meal: PlannedMeal) => void;
  /**
   * Called when the user wants to add a meal into an empty slot. When
   * the slot has been emptied (meal removed), the slot row persists so
   * the user can re-fill that exact slot position without regenerating
   * the whole day.
   */
  onAdd?: (slot: PlanSlot) => void;
  /**
   * Called when the user commits an inline time edit. Server-side
   * mutation is the parent's responsibility; SlotCard only manages
   * the local input + commit UX.
   */
  onEditTime?: (slot: PlanSlot, target_time: string | null) => void;
  busy?: boolean;
  /**
   * Packet 38: per-meal readiness derived from grocery check/off state.
   * When present, a compact badge is shown on each MealRow so the user
   * can tell at a glance whether a meal's items are covered. Absent when
   * no grocery list has been generated (no badge shown — no false signal).
   */
  readinessMap?: Record<string, MealReadinessResult>;
  /** href to the grocery/shopping list page for this day (for badge link). */
  groceryHref?: string;
  /**
   * Packet 39: execute a planned meal (eat / skip / undo). Called per-meal;
   * SlotCard is not aware of the async mechanics — the parent handles that.
   */
  onExecute?: (meal: PlannedMeal, action: 'eat' | 'skip' | 'undo') => void;
  /** Date string (YYYY-MM-DD) for the journal day link in execution state chips. */
  dayDate?: string;
}

function confidenceBadgeClass(conf: NDSConfidence): string {
  if (conf === 'high') return 'bg-denim-500/20 text-denim-200';
  if (conf === 'medium') return 'bg-amber-500/20 text-amber-200';
  return 'bg-white/[0.06] text-white/60';
}

/**
 * True when the persisted meal has zero calories AND no per-item
 * numeric data (calories or macros). That combination means nutrition
 * is missing entirely — not that the meal is actually 0 cal. We use
 * this to switch the calorie line from a misleading "0 cal" to an
 * honest "— cal · nutrition missing" badge. This covers the Packet 4
 * carryover path where a recipe was promoted to a template without
 * per-item calories and whose provenance row also lacked calories.
 */
function nutritionIsMissing(meal: PlannedMeal): boolean {
  const payload = meal.payload as {
    totals?: { calories?: number; protein_g?: number };
    items?: Array<{
      calories?: number | null;
      macros?:
        | { protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }
        | null;
    }>;
  };
  const totals = payload.totals ?? {};
  const totalsZero =
    (typeof totals.calories !== 'number' || totals.calories <= 0) &&
    (typeof totals.protein_g !== 'number' || totals.protein_g <= 0);
  if (!totalsZero) return false;
  const items = payload.items ?? [];
  if (items.length === 0) return true;
  const anyItemHasNumbers = items.some((it) => {
    if (typeof it.calories === 'number' && it.calories > 0) return true;
    const m = it.macros ?? null;
    if (
      m &&
      ((typeof m.protein_g === 'number' && m.protein_g > 0) ||
        (typeof m.carbs_g === 'number' && m.carbs_g > 0) ||
        (typeof m.fat_g === 'number' && m.fat_g > 0))
    ) {
      return true;
    }
    return false;
  });
  return !anyItemHasNumbers;
}

function formatCalories(meal: PlannedMeal): string | null {
  const totals = (meal.payload as { totals?: { calories?: number } }).totals;
  if (typeof totals?.calories === 'number' && totals.calories > 0) {
    return `${Math.round(totals.calories)} cal`;
  }
  const derived = meal.meal_derived_data as { meal_calories?: number };
  if (typeof derived?.meal_calories === 'number' && derived.meal_calories > 0) {
    return `${Math.round(derived.meal_calories)} cal`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Packet 38 — Readiness badge
//
// Compact pill shown on each MealRow when readiness data is available.
// Links to the grocery page so the user can inspect contributing items.
// States: ready (green), partial (amber), missing (muted red).
// no_list = no badge shown (honest; no grocery list generated yet).
// ---------------------------------------------------------------------------

function ReadinessBadge({
  result,
  href,
}: {
  result: MealReadinessResult;
  href: string;
}) {
  if (result.state === 'no_list') return null;

  let label: string;
  let cls: string;
  let dotCls: string;

  if (result.state === 'ready') {
    label = 'Ready';
    cls = 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25';
    dotCls = 'bg-emerald-400';
  } else if (result.state === 'partial') {
    const suffix = result.total > 0 ? ` ${result.covered}/${result.total}` : '';
    label = result.has_unresolved ? `Partial · unresolved${suffix}` : `Partial${suffix}`;
    cls = 'bg-amber-500/15 text-amber-200 border-amber-500/25';
    dotCls = 'bg-amber-400';
  } else {
    // missing
    const suffix = result.total > 0 ? ` · ${result.total} needed` : '';
    label = `Items needed${suffix}`;
    cls = 'bg-red-500/10 text-red-200/80 border-red-500/20';
    dotCls = 'bg-red-400/70';
  }

  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] antialiased transition-opacity hover:opacity-80 ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Packet 39 — Execution state chip
//
// Shown in place of (or alongside) the Log / Skip action buttons once a
// planned meal has been acted on. Compact inline chip with undo affordance.
// ---------------------------------------------------------------------------

function executionStateLabel(state: PlannedMealExecutionState): {
  label: string;
  cls: string;
  dotCls: string;
} {
  if (state === 'eaten') {
    return {
      label: 'Logged ✓',
      cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25',
      dotCls: 'bg-emerald-400',
    };
  }
  if (state === 'skipped') {
    return {
      label: 'Skipped',
      cls: 'bg-white/[0.06] text-white/40 border-white/10',
      dotCls: 'bg-white/20',
    };
  }
  // pending — no chip
  return { label: '', cls: '', dotCls: '' };
}

// ---------------------------------------------------------------------------
// Single meal row — used for both the 1-meal and multi-meal layouts.
// ---------------------------------------------------------------------------

interface MealRowProps {
  meal: PlannedMeal;
  eatOutEvent?: PlannedEatOutEvent | null;
  onRegenerate?: (meal: PlannedMeal) => void;
  onEdit?: (meal: PlannedMeal) => void;
  onRemove?: (meal: PlannedMeal) => void;
  showEatOut?: boolean;
  busy?: boolean;
  readiness?: MealReadinessResult;
  groceryHref?: string;
  onExecute?: (meal: PlannedMeal, action: 'eat' | 'skip' | 'undo') => void;
  dayDate?: string;
}

function MealRow({
  meal,
  eatOutEvent,
  onRegenerate,
  onEdit,
  onRemove,
  showEatOut = true,
  busy,
  readiness,
  groceryHref,
  onExecute,
  dayDate,
}: MealRowProps) {
  const executionState = meal.execution_state ?? 'pending';
  const isHandled = executionState !== 'pending';
  const cal = formatCalories(meal);
  const isImportDerived = meal.source_imported_meal_id !== null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-base font-medium text-white antialiased">
          {meal.name ?? 'Untitled meal'}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {cal ? (
            <p className="text-xs text-white/50 antialiased">{cal}</p>
          ) : nutritionIsMissing(meal) ? (
            <p className="text-xs text-amber-200/80 antialiased">
              — cal · nutrition missing
            </p>
          ) : null}
          {isImportDerived && (
            <Link
              href={`/journal/plans/imports/${meal.source_imported_meal_id}`}
              className="inline-flex items-center text-[11px] text-denim-300 hover:text-denim-200 antialiased transition-colors"
            >
              From import ↗
            </Link>
          )}
          {readiness && groceryHref && (
            <ReadinessBadge result={readiness} href={groceryHref} />
          )}
        </div>
        {eatOutEvent && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider antialiased border border-amber-500/30 bg-amber-500/10 text-amber-200">
              Eat-out · {eatOutEvent.venue_name}
            </span>
            <Link
              href={`/journal/plans/eat-out/${eatOutEvent.id}`}
              className="text-[11px] text-white/50 hover:text-white/80 antialiased underline-offset-2 hover:underline"
            >
              open
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {typeof meal.protein_score_10 === 'number' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] text-white/80 antialiased">
            PS {meal.protein_score_10.toFixed(1)}/10
          </span>
        )}
        {meal.is_main_meal && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-denim-500/15 text-[11px] text-denim-200 antialiased">
            Main meal
          </span>
        )}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] antialiased ${confidenceBadgeClass(meal.nds_confidence)}`}
        >
          {meal.nds_confidence} confidence
        </span>
      </div>

      {/* Packet 39 — execution state chip (eaten / skipped) */}
      {isHandled && (() => {
        const { label, cls, dotCls } = executionStateLabel(executionState);
        return (
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {executionState === 'eaten' && dayDate ? (
              <Link
                href={`/journal/day?date=${dayDate}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] antialiased hover:opacity-80 transition-opacity ${cls}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
                {label}
              </Link>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] antialiased ${cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
                {label}
              </span>
            )}
            {onExecute && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onExecute(meal, 'undo')}
                className="text-[10px] text-white/35 hover:text-white/65 disabled:text-white/20 antialiased transition-colors"
              >
                Undo
              </button>
            )}
          </div>
        );
      })()}

      {/* Standard action bar — suppressed when the meal is already handled */}
      {!isHandled && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {/* Packet 39 — Log / Skip actions */}
          {onExecute && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onExecute(meal, 'eat')}
                className="text-xs font-medium text-emerald-300 hover:text-emerald-200 disabled:text-white/30 transition-colors antialiased"
              >
                Log meal
              </button>
              <span className="text-white/20">·</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onExecute(meal, 'skip')}
                className="text-xs font-medium text-white/40 hover:text-white/65 disabled:text-white/20 transition-colors antialiased"
              >
                Skip
              </button>
              {(onRegenerate || onEdit || onRemove || (showEatOut && !eatOutEvent)) && (
                <span className="text-white/20">·</span>
              )}
            </>
          )}
          {onRegenerate && !isImportDerived && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRegenerate(meal)}
              className="text-xs font-medium text-denim-300 hover:text-denim-200 disabled:text-white/30 transition-colors antialiased"
            >
              Regenerate
            </button>
          )}
          {onEdit && (
            <>
              {(onRegenerate && !isImportDerived) && <span className="text-white/20">·</span>}
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit(meal)}
                className="text-xs font-medium text-white/70 hover:text-white/90 disabled:text-white/30 transition-colors antialiased"
              >
                Edit
              </button>
            </>
          )}
          {onRemove && (
            <>
              <span className="text-white/20">·</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(meal)}
                className="text-xs font-medium text-white/50 hover:text-white/80 disabled:text-white/30 transition-colors antialiased"
              >
                Remove
              </button>
            </>
          )}
          {/*
            Packet 5 reachability: Eat out action must be reachable
            from filled slots too, not just empty ones.
          */}
          {showEatOut && !eatOutEvent && (
            <>
              <span className="text-white/20">·</span>
              <Link
                href={`/journal/plans/eat-out/new?slot_id=${meal.plan_slot_id}`}
                className="text-xs font-medium text-amber-200 hover:text-amber-100 antialiased transition-colors"
              >
                Eat out
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SlotCard({
  slot,
  meals,
  eatOutEvent,
  onRegenerate,
  onEdit,
  onRemove,
  onAdd,
  onEditTime,
  busy,
  readinessMap,
  groceryHref,
  onExecute,
  dayDate,
}: SlotCardProps) {
  const slotTitle =
    slot.slot_label ??
    (slot.slot_block
      ? slot.slot_block.charAt(0).toUpperCase() + slot.slot_block.slice(1)
      : `Slot ${slot.slot_ordinal + 1}`);

  const [timeEditing, setTimeEditing] = useState(false);
  const [timeDraft, setTimeDraft] = useState<string>(slot.target_time ?? '');

  useEffect(() => {
    setTimeDraft(slot.target_time ?? '');
  }, [slot.target_time]);

  function commitTime() {
    if (!onEditTime) return;
    const next = timeDraft.trim() === '' ? null : timeDraft;
    setTimeEditing(false);
    if (next !== slot.target_time) onEditTime(slot, next);
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
      {/* Slot header — label + editable time */}
      <div className="flex items-baseline justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 antialiased">
            {slotTitle}
          </p>
          {onEditTime ? (
            timeEditing ? (
              <input
                type="time"
                autoFocus
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                onBlur={commitTime}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTime();
                  if (e.key === 'Escape') {
                    setTimeDraft(slot.target_time ?? '');
                    setTimeEditing(false);
                  }
                }}
                disabled={busy}
                className="mt-0.5 bg-transparent text-[11px] text-white/70 border border-white/10 rounded px-1.5 py-0.5 focus:outline-none focus:border-denim-400"
              />
            ) : (
              <button
                type="button"
                onClick={() => setTimeEditing(true)}
                disabled={busy}
                className="text-[11px] text-white/30 hover:text-white/60 antialiased underline decoration-dotted underline-offset-2 transition-colors"
              >
                {slot.target_time ?? 'Set time'}
              </button>
            )
          ) : (
            slot.target_time && (
              <p className="text-[11px] text-white/30 antialiased">{slot.target_time}</p>
            )
          )}
        </div>
      </div>

      {/* Empty slot */}
      {meals.length === 0 ? (
        <div className="rounded-xl bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/50 antialiased">No meal planned.</p>
            <div className="flex items-center gap-2">
              {onAdd && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAdd(slot)}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-xs font-medium text-denim-200 antialiased transition-colors"
                >
                  Add meal
                </button>
              )}
              <Link
                href={`/journal/plans/eat-out/new?slot_id=${slot.id}`}
                className="shrink-0 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white/70 hover:text-white/90 antialiased transition-colors"
              >
                Eat out
              </Link>
            </div>
          </div>
          {eatOutEvent && (
            <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-2.5 py-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] text-amber-100/90 antialiased truncate">
                Eat-out planned · {eatOutEvent.venue_name}
              </p>
              <Link
                href={`/journal/plans/eat-out/${eatOutEvent.id}`}
                className="shrink-0 text-[11px] text-amber-200 hover:text-amber-100 antialiased underline-offset-2 hover:underline"
              >
                Review
              </Link>
            </div>
          )}
        </div>
      ) : meals.length === 1 ? (
        /* Single meal — existing layout unchanged */
        <MealRow
          meal={meals[0]!}
          eatOutEvent={eatOutEvent}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onRemove={onRemove}
          showEatOut
          busy={busy}
          readiness={readinessMap?.[meals[0]!.id]}
          groceryHref={groceryHref}
          onExecute={onExecute}
          dayDate={dayDate}
        />
      ) : (
        /* Multi-meal slot — stacked rows with dividers */
        <div className="space-y-0">
          {meals.map((meal, idx) => (
            <div key={meal.id}>
              {idx > 0 && <div className="border-t border-white/[0.06] my-3" />}
              <MealRow
                meal={meal}
                eatOutEvent={idx === 0 ? eatOutEvent : null}
                onRegenerate={onRegenerate}
                onEdit={onEdit}
                onRemove={onRemove}
                showEatOut={idx === 0}
                busy={busy}
                readiness={readinessMap?.[meal.id]}
                groceryHref={groceryHref}
                onExecute={onExecute}
                dayDate={dayDate}
              />
            </div>
          ))}
          {/* Slot-level eat-out indicator when no specific meal owns the event */}
          {eatOutEvent && (
            <div className="mt-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-2.5 py-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] text-amber-100/90 antialiased truncate">
                Eat-out planned · {eatOutEvent.venue_name}
              </p>
              <Link
                href={`/journal/plans/eat-out/${eatOutEvent.id}`}
                className="shrink-0 text-[11px] text-amber-200 hover:text-amber-100 antialiased underline-offset-2 hover:underline"
              >
                Review
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
