'use client';

/**
 * DayView
 *
 * Renders one plan_day: slots + planned meals. Handles the interactive
 * pieces (regenerate, edit, remove) via callbacks into the parent page.
 */

import { useMemo } from 'react';
import type { PlanDay, PlanSlot, PlannedMeal } from '@/lib/plans';
import { SlotCard } from './SlotCard';

interface DayViewProps {
  day: PlanDay;
  slots: PlanSlot[];
  meals: PlannedMeal[];
  editingMealId: string | null;
  onRegenerate: (meal: PlannedMeal) => void;
  onEdit: (meal: PlannedMeal) => void;
  onRemove: (meal: PlannedMeal) => void;
  busy: boolean;
}

function formatDayHeading(dateLocal: string): string {
  const [y, m, d] = dateLocal.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function DayView({
  day,
  slots,
  meals,
  editingMealId,
  onRegenerate,
  onEdit,
  onRemove,
  busy,
}: DayViewProps) {
  const orderedSlots = useMemo(
    () => [...slots].sort((a, b) => a.slot_ordinal - b.slot_ordinal),
    [slots],
  );
  const mealsBySlot = useMemo(() => {
    const map: Record<string, PlannedMeal[]> = {};
    for (const m of meals) {
      const key = m.plan_slot_id ?? '__unassigned__';
      (map[key] ||= []).push(m);
    }
    return map;
  }, [meals]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-white antialiased">
          {formatDayHeading(day.date_local)}
        </h1>
        <p className="text-sm text-white/50 antialiased mt-0.5">
          Projected NDS:{' '}
          <span className="text-white/80 font-medium">
            {day.projected_nds_100 === null
              ? '—'
              : Math.round(day.projected_nds_100)}
            /100
          </span>
          <span className="text-white/30"> · </span>
          <span className="text-white/50">
            confidence {day.projection_confidence ?? 'unknown'}
          </span>
        </p>
      </div>

      <div className="space-y-3">
        {orderedSlots.length === 0 && (
          <div className="rounded-2xl bg-white/[0.04] p-5">
            <p className="text-sm text-white/60 antialiased">
              No slots on this day yet.
            </p>
          </div>
        )}
        {orderedSlots.map((slot) => {
          const slotMeals = mealsBySlot[slot.id] ?? [];
          const meal = slotMeals[0] ?? null;
          const isEditing = meal !== null && editingMealId === meal.id;
          return (
            <div key={slot.id}>
              <SlotCard
                slot={slot}
                meal={meal}
                onRegenerate={meal && !isEditing ? onRegenerate : undefined}
                onEdit={meal && !isEditing ? onEdit : undefined}
                onRemove={meal && !isEditing ? onRemove : undefined}
                busy={busy}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
