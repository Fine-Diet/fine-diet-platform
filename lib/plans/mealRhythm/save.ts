/**
 * Canonical Meal Rhythm save — Profile meal_schedule only.
 * Session identity is applied by POST /api/journal/profile; this helper
 * never includes a person identifier in the body.
 * New saves write Meal Schedule v2 (neutral occasions).
 */

import { MealScheduleWriteSchema } from '@/lib/plans/validators';
import type { MealSchedule } from '@/lib/plans/types';
import { MEAL_OCCASION_KEYS } from '@/lib/plans/types';
import { buildMealScheduleSavePayload } from './assumptionPolicy';

export function enabledSlotCount(schedule: MealSchedule): number {
  return MEAL_OCCASION_KEYS.filter((key) => schedule.slots[key].enabled).length;
}

export async function saveMealRhythmSchedule(
  schedule: MealSchedule,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (enabledSlotCount(schedule) < 1) {
    return { ok: false, error: 'Turn on at least one meal occasion before saving.' };
  }

  const payload = buildMealScheduleSavePayload(schedule);
  const parsed = MealScheduleWriteSchema.safeParse(payload.meal_schedule);
  if (!parsed.success) {
    return { ok: false, error: 'That rhythm isn’t valid yet. Check times and try again.' };
  }

  const body: { meal_schedule: MealSchedule } = { meal_schedule: parsed.data };

  try {
    const res = await fetch('/api/journal/profile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: 'Could not save your rhythm. Try again.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save your rhythm. Try again.' };
  }
}
