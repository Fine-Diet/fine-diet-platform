import type { PlannedMeal } from './types';

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pick the one visible PlannedMeal container for a structural PlanSlot.
 *
 * Historical write paths could attach sibling planned_meals to one slot. The
 * newest persisted sibling is the deterministic representative, while rows
 * without structural slot ownership remain distinct for legacy compatibility.
 * This is a read/projection policy only; it never mutates historical rows.
 */
export function canonicalMealForStructuralSlot(
  meals: readonly PlannedMeal[],
): PlannedMeal | null {
  return [...meals].sort((a, b) => {
    const updated = timestamp(b.updated_at) - timestamp(a.updated_at);
    if (updated !== 0) return updated;
    const created = timestamp(b.created_at) - timestamp(a.created_at);
    if (created !== 0) return created;
    return b.id.localeCompare(a.id);
  })[0] ?? null;
}

/**
 * Collapse legacy sibling rows only when they share an exact structural slot.
 * The output keeps the first slot occurrence position but substitutes its
 * deterministic representative.
 */
export function canonicalMealsByStructuralSlot(
  meals: readonly PlannedMeal[],
): PlannedMeal[] {
  const slotGroups = new Map<string, PlannedMeal[]>();
  for (const meal of meals) {
    if (!meal.plan_slot_id) continue;
    const key = `${meal.plan_id}:${meal.plan_day_id}:${meal.plan_slot_id}`;
    const group = slotGroups.get(key);
    if (group) group.push(meal);
    else slotGroups.set(key, [meal]);
  }

  const emitted = new Set<string>();
  const result: PlannedMeal[] = [];
  for (const meal of meals) {
    if (!meal.plan_slot_id) {
      result.push(meal);
      continue;
    }
    const key = `${meal.plan_id}:${meal.plan_day_id}:${meal.plan_slot_id}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    const representative = canonicalMealForStructuralSlot(slotGroups.get(key) ?? []);
    if (representative) result.push(representative);
  }
  return result;
}
