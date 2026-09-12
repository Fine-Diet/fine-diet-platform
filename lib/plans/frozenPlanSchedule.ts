/**
 * Frozen Plan schedule truth for dated Plans surfaces.
 *
 * Profile Meal Rhythm may change after Plan creation. An already-created
 * Plan must keep using `input_snapshot_json.schedule_snapshot` for its
 * visible occasions and for exact-slot materialization.
 */

import { presentationSlotIdForScheduleKey } from '@/lib/plans/resolveRequestedPlanDateState';
import type { Plan, PlanDayTemplateSlot, ResolvedScheduleSlot } from '@/lib/plans/types';

export function resolveFrozenPlanEnabledScheduleSlots(
  plan: Pick<Plan, 'input_snapshot_json'> | null | undefined,
): ResolvedScheduleSlot[] {
  const slots = plan?.input_snapshot_json?.schedule_snapshot?.resolved_slots;
  if (!Array.isArray(slots)) return [];
  return slots.filter((slot) => slot.enabled);
}

export function resolveEnsureOccasionScheduleSlots(
  plan: Pick<Plan, 'input_snapshot_json'>,
  liveEnabledSlots: ResolvedScheduleSlot[],
): { slots: ResolvedScheduleSlot[]; source: 'frozen_plan' | 'live_profile' } {
  const frozen = resolveFrozenPlanEnabledScheduleSlots(plan);
  if (frozen.length > 0) {
    return { slots: frozen, source: 'frozen_plan' };
  }
  return { slots: liveEnabledSlots, source: 'live_profile' };
}

/** Presentation-only template slots for a frozen Plan schedule. */
export function templateSlotsFromResolvedSchedule(
  scheduleSlots: ResolvedScheduleSlot[],
): PlanDayTemplateSlot[] {
  return scheduleSlots
    .filter((slot) => slot.enabled)
    .map((slot, index) => ({
      source_plan_slot_id: presentationSlotIdForScheduleKey(slot.key),
      slot_ordinal: index + 1,
      slot_block: slot.slot_block,
      slot_label: slot.label,
      target_time: slot.target_time,
      meals: [],
    }));
}

/** Occupied structural slots count as planned regardless of Log execution. */
export function countPlannedStructuralSlots(
  meals: Array<{ plan_slot_id: string | null }>,
): number {
  return new Set(meals.map((meal) => meal.plan_slot_id).filter(Boolean)).size;
}
