/**
 * matchScheduleSlot — map a profile meal-schedule slot to a planned meal.
 *
 * Extracted (Packet F) from pages/journal/plans/index.tsx so the same matching
 * logic can be reused when surfacing planned-meal context in the Log surface.
 * Behavior is identical to the original Plans implementation: match on meal
 * type vs slot key/label, then plan-slot target time, then plan-slot label.
 */
import type { MealSlotKey, PlannedMeal, PlanSlot, ResolvedScheduleSlot } from './types';
import { MEAL_SLOT_KEYS } from './types';

function isMealSlotKey(value: string): value is MealSlotKey {
  return (MEAL_SLOT_KEYS as readonly string[]).includes(value);
}

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

export function findMealsForScheduleSlot(
  slot: ResolvedScheduleSlot,
  dayMeals: PlannedMeal[],
  daySlots: PlanSlot[],
): PlannedMeal[] {
  const matches: PlannedMeal[] = [];
  for (const meal of dayMeals) {
    const planSlot = daySlots.find((s) => s.id === meal.plan_slot_id) ?? null;
    if (mealMatchesScheduleSlot(meal, slot, planSlot)) matches.push(meal);
  }
  return matches;
}

export function findMealForScheduleSlot(
  slot: ResolvedScheduleSlot,
  dayMeals: PlannedMeal[],
  daySlots: PlanSlot[],
): PlannedMeal | null {
  return findMealsForScheduleSlot(slot, dayMeals, daySlots)[0] ?? null;
}

export function findPlannedMealById(
  meals: PlannedMeal[],
  plannedMealId: string,
): PlannedMeal | null {
  return meals.find((m) => m.id === plannedMealId) ?? null;
}

/**
 * Resolve the canonical profile schedule slot key for a planned meal + plan slot.
 * Prefer precise snack keys (morning_snack, etc.) over generic meal_type='snack'.
 */
export function resolveScheduleSlotKeyForMeal(
  meal: PlannedMeal,
  planSlot: PlanSlot | null,
  scheduleSlots: ResolvedScheduleSlot[],
): MealSlotKey | null {
  for (const slot of scheduleSlots) {
    if (!slot.enabled) continue;
    if (mealMatchesScheduleSlot(meal, slot, planSlot)) return slot.key;
  }
  if (isMealSlotKey(meal.meal_type)) return meal.meal_type;
  return null;
}

export interface PlanDayMealsContext {
  planId: string;
  meals: PlannedMeal[];
  slots: PlanSlot[];
}

/**
 * Collect slot-matched planned meals across multiple plans for generic Log context.
 * Preserves plan order; each meal retains its own plan_id for downstream links.
 */
export function collectPlannedMealsForScheduleSlotAcrossPlans(
  slot: ResolvedScheduleSlot,
  planDays: PlanDayMealsContext[],
): PlannedMeal[] {
  const matches: PlannedMeal[] = [];
  for (const ctx of planDays) {
    matches.push(...findMealsForScheduleSlot(slot, ctx.meals, ctx.slots));
  }
  return matches;
}

/**
 * Resolve planned meal context for Log.
 * Explicit plannedMealId takes precedence over schedule-slot heuristics.
 */
export function resolvePlannedMealsForLogContext(input: {
  plannedMealId: string | null;
  slot: ResolvedScheduleSlot | null;
  dayMeals: PlannedMeal[];
  daySlots: PlanSlot[];
}): { meals: PlannedMeal[]; selected: PlannedMeal | null } {
  if (input.plannedMealId) {
    const selected = findPlannedMealById(input.dayMeals, input.plannedMealId);
    return { meals: selected ? [selected] : [], selected };
  }
  if (!input.slot) return { meals: [], selected: null };
  const meals = findMealsForScheduleSlot(input.slot, input.dayMeals, input.daySlots);
  return { meals, selected: meals[0] ?? null };
}
