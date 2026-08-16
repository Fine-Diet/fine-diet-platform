import { defaultMealSchedule, normalizeMealSchedule } from '@/lib/plans/scheduleResolver';
import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import {
  enabledSavedSlotCount,
  hasSavedMealSchedule,
  isUsableSavedMealSchedule,
} from '../usableMealRhythm';

describe('usableMealRhythm', () => {
  it('does not treat a missing schedule as usable even when normalize fabricates defaults', () => {
    expect(hasSavedMealSchedule(null)).toBe(false);
    expect(isUsableSavedMealSchedule(null)).toBe(false);
    expect(isUsableSavedMealSchedule(undefined)).toBe(false);
    expect(getEnabledMealSlots(null).length).toBeGreaterThan(0);
    expect(normalizeMealSchedule(null).slots.breakfast.enabled).toBe(true);
  });

  it('requires a saved slots object with at least one enabled occasion', () => {
    const saved = defaultMealSchedule(new Date('2026-08-16T12:00:00.000Z'));
    expect(hasSavedMealSchedule(saved)).toBe(true);
    expect(isUsableSavedMealSchedule(saved)).toBe(true);
    expect(enabledSavedSlotCount(saved)).toBe(3);

    saved.slots.breakfast.enabled = false;
    saved.slots.lunch.enabled = false;
    saved.slots.dinner.enabled = false;
    expect(hasSavedMealSchedule(saved)).toBe(true);
    expect(isUsableSavedMealSchedule(saved)).toBe(false);
  });

  it('ignores objects without slots', () => {
    expect(hasSavedMealSchedule({ version: 1, updated_at: '2026-08-16T12:00:00.000Z' })).toBe(
      false,
    );
  });
});
