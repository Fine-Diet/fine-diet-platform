'use client';

/**
 * DayView
 *
 * Renders one plan_day: slots + planned meals. Handles the interactive
 * pieces (regenerate, edit, remove) via callbacks into the parent page.
 */

import { useMemo } from 'react';
import type {
  PlanDay,
  PlanSlot,
  PlannedMeal,
  PlannedEatOutEvent,
} from '@/lib/plans';
import { SlotCard } from './SlotCard';

interface DayViewProps {
  day: PlanDay;
  slots: PlanSlot[];
  meals: PlannedMeal[];
  /** Packet 5: eat-out events bound to slots on this day. Optional for
   * back-compat with callers that don't load events. */
  eatOutEvents?: PlannedEatOutEvent[];
  editingMealId: string | null;
  creatingSlotId: string | null;
  onRegenerate: (meal: PlannedMeal) => void;
  onEdit: (meal: PlannedMeal) => void;
  onRemove: (meal: PlannedMeal) => void;
  onAdd: (slot: PlanSlot) => void;
  onEditTime: (slot: PlanSlot, target_time: string | null) => void;
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
  eatOutEvents,
  editingMealId,
  creatingSlotId,
  onRegenerate,
  onEdit,
  onRemove,
  onAdd,
  onEditTime,
  busy,
}: DayViewProps) {
  // Sort chronologically by target_time (HH:mm) when present, falling
  // back to slot_ordinal for slots without a time. This is what the user
  // expects after the Phase 3 inline time-edit work: editing a slot's
  // clock time must move its position in the day view. slot_ordinal is
  // set at generation time and is not re-normalized when the user edits
  // a target_time, so using ordinal alone produced out-of-sequence days.
  const orderedSlots = useMemo(() => {
    const toMinutes = (t: string | null): number => {
      if (!t) return Number.POSITIVE_INFINITY;
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) return Number.POSITIVE_INFINITY;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    return [...slots].sort((a, b) => {
      const ta = toMinutes(a.target_time);
      const tb = toMinutes(b.target_time);
      if (ta !== tb) return ta - tb;
      return a.slot_ordinal - b.slot_ordinal;
    });
  }, [slots]);
  const mealsBySlot = useMemo(() => {
    const map: Record<string, PlannedMeal[]> = {};
    for (const m of meals) {
      const key = m.plan_slot_id ?? '__unassigned__';
      (map[key] ||= []).push(m);
    }
    return map;
  }, [meals]);
  const eatOutBySlot = useMemo(() => {
    const map: Record<string, PlannedEatOutEvent> = {};
    if (!eatOutEvents) return map;
    // Most recent event wins for a given slot — events are preserved
    // after select so we expect at most one live event per slot in V1.
    const sorted = [...eatOutEvents].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
    for (const e of sorted) {
      if (e.plan_slot_id && !map[e.plan_slot_id]) map[e.plan_slot_id] = e;
    }
    return map;
  }, [eatOutEvents]);

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
          const isCreatingHere = creatingSlotId === slot.id;
          return (
            <div key={slot.id}>
              <SlotCard
                slot={slot}
                meal={meal}
                eatOutEvent={eatOutBySlot[slot.id] ?? null}
                onRegenerate={meal && !isEditing ? onRegenerate : undefined}
                onEdit={meal && !isEditing ? onEdit : undefined}
                onRemove={meal && !isEditing ? onRemove : undefined}
                onAdd={!meal && !isCreatingHere ? onAdd : undefined}
                onEditTime={onEditTime}
                busy={busy}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
