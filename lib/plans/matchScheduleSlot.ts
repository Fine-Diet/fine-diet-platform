/**
 * matchScheduleSlot — map a profile meal-schedule slot to a planned meal.
 *
 * Extracted (Packet F) from pages/journal/plans/index.tsx so the same matching
 * logic can be reused when surfacing planned-meal context in the Log surface.
 * Behavior is identical to the original Plans implementation: match on meal
 * type vs slot key/label, then plan-slot target time, then plan-slot label.
 */
import type { PlannedMeal, PlanSlot, ResolvedScheduleSlot } from './types';

export function normalizeScheduleLabel(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
}

export function mealMatchesScheduleSlot(
  meal: PlannedMeal,
  slot: ResolvedScheduleSlot,
  planSlot: PlanSlot | null,
): boolean {
  const slotLabel = normalizeScheduleLabel(slot.label);
  const mealType = normalizeScheduleLabel(meal.meal_type);
  const planSlotLabel = normalizeScheduleLabel(planSlot?.slot_label);
  if (mealType && (mealType === slot.key || mealType === slotLabel)) return true;
  if (planSlot?.target_time && planSlot.target_time === slot.target_time) return true;
  return Boolean(planSlotLabel && slotLabel && planSlotLabel === slotLabel);
}

export function findMealForScheduleSlot(
  slot: ResolvedScheduleSlot,
  dayMeals: PlannedMeal[],
  daySlots: PlanSlot[],
): PlannedMeal | null {
  for (const meal of dayMeals) {
    const planSlot = daySlots.find((s) => s.id === meal.plan_slot_id) ?? null;
    if (mealMatchesScheduleSlot(meal, slot, planSlot)) return meal;
  }
  return null;
}
