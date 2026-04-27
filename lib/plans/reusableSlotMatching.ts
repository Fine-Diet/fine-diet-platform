/**
 * Shared slot matching for reusable planning structures.
 *
 * Day templates and week patterns both snapshot source slot identity plus
 * shape. Application should resolve that reusable slot to a concrete target
 * slot through one ordered rule set so the flows cannot drift.
 */

import type { PlanDayTemplateSlot, PlanSlot } from './types';

export type ReusableSlotMatchReason = 'source_id' | 'shape' | 'ordinal' | 'none';

export interface ReusableSlotMatch {
  slot: PlanSlot | null;
  reason: ReusableSlotMatchReason;
}

export function matchReusableSlotToTarget(
  reusableSlot: Pick<
    PlanDayTemplateSlot,
    'source_plan_slot_id' | 'slot_block' | 'slot_label' | 'target_time' | 'slot_ordinal'
  >,
  targetSlots: PlanSlot[],
): ReusableSlotMatch {
  const bySourceId = targetSlots.find(
    (slot) => slot.id === reusableSlot.source_plan_slot_id,
  );
  if (bySourceId) return { slot: bySourceId, reason: 'source_id' };

  const byShape = targetSlots.find(
    (slot) =>
      slot.slot_block === reusableSlot.slot_block &&
      slot.slot_label === reusableSlot.slot_label &&
      slot.target_time === reusableSlot.target_time,
  );
  if (byShape) return { slot: byShape, reason: 'shape' };

  const byOrdinal = targetSlots.find(
    (slot) => slot.slot_ordinal === reusableSlot.slot_ordinal,
  );
  if (byOrdinal) return { slot: byOrdinal, reason: 'ordinal' };

  return { slot: null, reason: 'none' };
}
