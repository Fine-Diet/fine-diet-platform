'use client';

/**
 * SlotCard
 *
 * Renders a single plan_slot with its planned_meal. Shows:
 *   - slot label + target time
 *   - meal name + calories
 *   - NDS badges: protein_score_10 (PS), is_main_meal, nds_confidence
 *   - Regenerate button (calls onRegenerate(meal))
 *   - Edit / remove buttons (calls onEdit / onRemove)
 */

import type { PlanSlot, PlannedMeal, NDSConfidence } from '@/lib/plans';

interface SlotCardProps {
  slot: PlanSlot;
  meal: PlannedMeal | null;
  onRegenerate?: (meal: PlannedMeal) => void;
  onEdit?: (meal: PlannedMeal) => void;
  onRemove?: (meal: PlannedMeal) => void;
  busy?: boolean;
}

function confidenceBadgeClass(conf: NDSConfidence): string {
  if (conf === 'high') return 'bg-denim-500/20 text-denim-200';
  if (conf === 'medium') return 'bg-amber-500/20 text-amber-200';
  return 'bg-white/[0.06] text-white/60';
}

function formatCalories(meal: PlannedMeal): string | null {
  const totals = (meal.payload as { totals?: { calories?: number } }).totals;
  if (typeof totals?.calories === 'number') return `${Math.round(totals.calories)} cal`;
  const derived = meal.meal_derived_data as { meal_calories?: number };
  if (typeof derived?.meal_calories === 'number') return `${Math.round(derived.meal_calories)} cal`;
  return null;
}

export function SlotCard({ slot, meal, onRegenerate, onEdit, onRemove, busy }: SlotCardProps) {
  const slotTitle =
    slot.slot_label ??
    (slot.slot_block
      ? slot.slot_block.charAt(0).toUpperCase() + slot.slot_block.slice(1)
      : `Slot ${slot.slot_ordinal + 1}`);

  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 antialiased">
            {slotTitle}
          </p>
          {slot.target_time && (
            <p className="text-[11px] text-white/30 antialiased">{slot.target_time}</p>
          )}
        </div>
      </div>

      {!meal ? (
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-sm text-white/50 antialiased">No meal planned.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-base font-medium text-white antialiased">
              {meal.name ?? 'Untitled meal'}
            </p>
            {formatCalories(meal) && (
              <p className="text-xs text-white/50 antialiased mt-0.5">{formatCalories(meal)}</p>
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
          </div>
        </div>
      )}
    </div>
  );
}
