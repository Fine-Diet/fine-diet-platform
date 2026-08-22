/**
 * Tests for validateMealRhythmScheduleForSave — shared overlay/Profile gate.
 */

import { defaultMealSchedule } from '@/lib/plans/scheduleResolver';
import { MEAL_OCCASION_KEYS } from '@/lib/plans/types';
import {
  enabledSlotCount,
  validateMealRhythmScheduleForSave,
} from '../save';

const NOW = new Date('2026-08-21T12:00:00.000Z');

describe('validateMealRhythmScheduleForSave', () => {
  it('rejects a schedule with zero enabled occasions', () => {
    const schedule = defaultMealSchedule(NOW);
    for (const key of MEAL_OCCASION_KEYS) {
      schedule.slots[key] = { ...schedule.slots[key], enabled: false };
    }
    expect(enabledSlotCount(schedule)).toBe(0);
    const result = validateMealRhythmScheduleForSave(schedule);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least one meal occasion/i);
    }
  });

  it('accepts a valid v2 schedule with at least one enabled occasion', () => {
    const schedule = defaultMealSchedule(NOW);
    const result = validateMealRhythmScheduleForSave(schedule);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedule.version).toBe(2);
      expect(enabledSlotCount(result.schedule)).toBeGreaterThanOrEqual(1);
    }
  });
});
