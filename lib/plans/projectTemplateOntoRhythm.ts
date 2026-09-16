/**
 * Display projection of a reusable Day Plan onto the user's current meal rhythm.
 *
 * The saved template remains the persistence source. Current-rhythm empty
 * occasions appear for capture without being written into template.slots until
 * the user actually adds a meal.
 */

import {
  matchReusableSlotToTarget,
  normalizeSlotLabel,
  normalizeSlotTime,
  slotLabelRole,
} from './reusableSlotMatching';
import type { PlanDayTemplateSlot, PlanSlot } from './types';

export type ProjectedDayPlanSlot = PlanDayTemplateSlot & {
  origin: 'rhythm' | 'unmatched_saved';
  persisted_source_plan_slot_id: string | null;
  scaffold_only: boolean;
};

function asMatchTarget(slot: PlanDayTemplateSlot): PlanSlot {
  return {
    id: slot.source_plan_slot_id,
    plan_day_id: '',
    person_id: '',
    slot_block: slot.slot_block,
    slot_ordinal: slot.slot_ordinal,
    slot_label: slot.slot_label,
    target_time: slot.target_time,
    created_at: '',
    updated_at: '',
  };
}

function cloneSlotMeals(slot: PlanDayTemplateSlot): PlanDayTemplateSlot['meals'] {
  return [...(slot.meals ?? [])];
}

function mustIsolateByExactTime(
  saved: PlanDayTemplateSlot,
  rhythmSlots: PlanDayTemplateSlot[],
): boolean {
  const label = normalizeSlotLabel(saved.slot_label);
  if (!label) return Boolean(normalizeSlotTime(saved.target_time));
  if (!slotLabelRole(saved.slot_label)) return true;
  return (
    rhythmSlots.filter((slot) => normalizeSlotLabel(slot.slot_label) === label).length > 1
  );
}

function timesConflict(
  saved: PlanDayTemplateSlot,
  target: PlanSlot,
): boolean {
  const sourceTime = normalizeSlotTime(saved.target_time);
  const targetTime = normalizeSlotTime(target.target_time);
  return Boolean(sourceTime && targetTime && sourceTime !== targetTime);
}

export function projectTemplateOntoRhythm(
  templateSlots: PlanDayTemplateSlot[],
  rhythmSlots: PlanDayTemplateSlot[] | null | undefined,
): ProjectedDayPlanSlot[] {
  if (!rhythmSlots || rhythmSlots.length === 0) {
    return [...templateSlots]
      .sort((a, b) => {
        if (a.slot_ordinal !== b.slot_ordinal) return a.slot_ordinal - b.slot_ordinal;
        const aTime = normalizeSlotTime(a.target_time) ?? '';
        const bTime = normalizeSlotTime(b.target_time) ?? '';
        return aTime.localeCompare(bTime);
      })
      .map((slot) => ({
        ...slot,
        meals: cloneSlotMeals(slot),
        origin: 'unmatched_saved' as const,
        persisted_source_plan_slot_id: slot.source_plan_slot_id,
        scaffold_only: false,
      }));
  }

  const rhythmTargets = rhythmSlots.map(asMatchTarget);
  const claimed = new Set<string>();
  const assigned = new Map<string, PlanDayTemplateSlot>();
  const unmatchedPopulated: PlanDayTemplateSlot[] = [];

  const savedOrdered = [...templateSlots].sort((a, b) => {
    const aPop = (a.meals ?? []).length > 0 ? 0 : 1;
    const bPop = (b.meals ?? []).length > 0 ? 0 : 1;
    if (aPop !== bPop) return aPop - bPop;
    return a.slot_ordinal - b.slot_ordinal;
  });

  for (const saved of savedOrdered) {
    const match = matchReusableSlotToTarget(saved, rhythmTargets, {
      claimedTargetSlotIds: claimed,
    });
    if (
      match.slot &&
      !(mustIsolateByExactTime(saved, rhythmSlots) && timesConflict(saved, match.slot))
    ) {
      assigned.set(match.slot.id, saved);
      claimed.add(match.slot.id);
      continue;
    }
    if ((saved.meals ?? []).length > 0) {
      unmatchedPopulated.push(saved);
    }
  }

  const projected: ProjectedDayPlanSlot[] = rhythmSlots.map((rhythm) => {
    const saved = assigned.get(rhythm.source_plan_slot_id) ?? null;
    return {
      source_plan_slot_id: rhythm.source_plan_slot_id,
      slot_ordinal: rhythm.slot_ordinal,
      slot_block: rhythm.slot_block,
      slot_label: rhythm.slot_label,
      target_time: rhythm.target_time,
      meals: saved ? cloneSlotMeals(saved) : [],
      origin: 'rhythm',
      persisted_source_plan_slot_id: saved?.source_plan_slot_id ?? null,
      scaffold_only: !saved,
    };
  });

  for (const saved of unmatchedPopulated) {
    projected.push({
      ...saved,
      meals: cloneSlotMeals(saved),
      origin: 'unmatched_saved',
      persisted_source_plan_slot_id: saved.source_plan_slot_id,
      scaffold_only: false,
    });
  }

  return projected;
}

export function materializeRhythmSlot(
  templateSlots: PlanDayTemplateSlot[],
  projected: ProjectedDayPlanSlot,
): PlanDayTemplateSlot[] {
  if (projected.persisted_source_plan_slot_id) {
    return templateSlots;
  }
  const already = templateSlots.some(
    (slot) => slot.source_plan_slot_id === projected.source_plan_slot_id,
  );
  if (already) return templateSlots;
  return [
    ...templateSlots,
    {
      source_plan_slot_id: projected.source_plan_slot_id,
      slot_ordinal: projected.slot_ordinal,
      slot_block: projected.slot_block,
      slot_label: projected.slot_label,
      target_time: projected.target_time,
      meals: [],
    },
  ];
}
