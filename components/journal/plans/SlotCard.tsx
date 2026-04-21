'use client';

/**
 * SlotCard
 *
 * Renders a single plan_slot with its planned_meal. Shows:
 *   - slot label + target time (inline-editable in Phase 3)
 *   - meal name + calories
 *   - NDS badges: protein_score_10 (PS), is_main_meal, nds_confidence
 *   - Regenerate button (calls onRegenerate(meal))
 *   - Edit / remove buttons (calls onEdit / onRemove)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  PlanSlot,
  PlannedMeal,
  NDSConfidence,
  PlannedEatOutEvent,
} from '@/lib/plans';

interface SlotCardProps {
  slot: PlanSlot;
  meal: PlannedMeal | null;
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

export function SlotCard({
  slot,
  meal,
  eatOutEvent,
  onRegenerate,
  onEdit,
  onRemove,
  onAdd,
  onEditTime,
  busy,
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

      {!meal ? (
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
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-base font-medium text-white antialiased">
              {meal.name ?? 'Untitled meal'}
            </p>
            {(() => {
              const cal = formatCalories(meal);
              if (cal) {
                return <p className="text-xs text-white/50 antialiased mt-0.5">{cal}</p>;
              }
              if (nutritionIsMissing(meal)) {
                return (
                  <p className="text-xs text-amber-200/80 antialiased mt-0.5">
                    — cal · nutrition missing
                  </p>
                );
              }
              return null;
            })()}
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

          <div className="flex items-center gap-2 pt-1">
            {onRegenerate && (
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
                <span className="text-white/20">·</span>
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
              from filled slots too, not just empty ones. If the slot
              already has a meal, "Eat out" still opens the planner so
              the user can replace the meal with an eat-out attachment
              for the same slot/time.
            */}
            {!eatOutEvent && (
              <>
                <span className="text-white/20">·</span>
                <Link
                  href={`/journal/plans/eat-out/new?slot_id=${slot.id}`}
                  className="text-xs font-medium text-amber-200 hover:text-amber-100 antialiased transition-colors"
                >
                  Eat out
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
