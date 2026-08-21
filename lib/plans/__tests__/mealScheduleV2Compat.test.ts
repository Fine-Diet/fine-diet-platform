/**
 * Meal Rhythm v2A — neutral 8-occasion foundation compatibility tests.
 */
import { describe, expect, it } from '@jest/globals';
import {
  buildAppCopyMealSchedule,
} from '@/lib/onboarding/buildProfilePatch';
import { INITIAL_ANSWERS } from '@/lib/onboarding/defaultOnboardingFlow';
import {
  buildMealScheduleContext,
  getEntryMealScheduleContext,
  getMealSlotForEntry,
} from '@/lib/journal/mealScheduleAssignment';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import {
  cloneMealSchedule,
  defaultMealSchedule,
  defaultMealScheduleV1,
  mealScheduleV1ToV2,
  mealTypeForLegacySlotKey,
  normalizeMealSchedule,
  normalizeProgramScheduleOverride,
} from '@/lib/plans/mealScheduleCompat';
import { mealTypeForSlotKey } from '@/lib/plans/mealCreation/candidatePolicy';
import {
  buildMealScheduleSavePayload,
  proposeMealRhythm,
} from '@/lib/plans/mealRhythm/assumptionPolicy';
import { enabledSlotCount } from '@/lib/plans/mealRhythm/save';
import { MealScheduleWriteSchema, MealScheduleSchema, MealScheduleV1Schema, MealScheduleV2Schema } from '@/lib/plans/validators';
import {
  hhmmToMinutes,
  resolveMealSchedule,
} from '@/lib/plans/scheduleResolver';
import type { JournalEntry } from '@/lib/journal/types';
import {
  LEGACY_MEAL_SLOT_KEYS,
  MEAL_OCCASION_DEFAULT_ENABLED,
  MEAL_OCCASION_DEFAULT_LABELS,
  MEAL_OCCASION_KEYS,
  type MealScheduleV1,
} from '@/lib/plans/types';

describe('Meal Rhythm v2A compatibility', () => {
  it('maps a complete v1 schedule to v2 preserving enabled/time/label/updated_at', () => {
    const updated_at = '2026-08-01T12:00:00.000Z';
    const v1: MealScheduleV1 = {
      version: 1,
      updated_at,
      slots: {
        breakfast: { enabled: true, target_time: '07:15', label: 'Rise & grind' },
        morning_snack: { enabled: true, target_time: '10:00', label: null },
        lunch: { enabled: true, target_time: '13:00', label: null },
        afternoon_snack: { enabled: false, target_time: '15:45', label: 'Tea' },
        dinner: { enabled: true, target_time: '18:30', label: null },
        evening_snack: { enabled: false, target_time: '21:30', label: null },
      },
    };
    const v2 = mealScheduleV1ToV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.updated_at).toBe(updated_at);
    expect(v2.slots.occasion_2).toEqual(v1.slots.breakfast);
    expect(v2.slots.occasion_3).toEqual(v1.slots.morning_snack);
    expect(v2.slots.occasion_4).toEqual(v1.slots.lunch);
    expect(v2.slots.occasion_5).toEqual(v1.slots.afternoon_snack);
    expect(v2.slots.occasion_7).toEqual(v1.slots.dinner);
    expect(v2.slots.occasion_8).toEqual(v1.slots.evening_snack);
    // New capacity keeps defaults and is not written by conversion side-effects.
    expect(v2.slots.occasion_1.enabled).toBe(false);
    expect(v2.slots.occasion_6.enabled).toBe(false);
  });

  it('v2 default contains exactly eight neutral occasions with three core enabled', () => {
    const schedule = defaultMealSchedule(new Date('2026-08-21T00:00:00.000Z'));
    expect(Object.keys(schedule.slots).sort()).toEqual([...MEAL_OCCASION_KEYS].sort());
    expect(MEAL_OCCASION_KEYS).toHaveLength(8);
    expect(schedule.version).toBe(2);
    for (const key of MEAL_OCCASION_KEYS) {
      expect(schedule.slots[key].enabled).toBe(MEAL_OCCASION_DEFAULT_ENABLED[key]);
    }
    expect(schedule.slots.occasion_1.enabled).toBe(false);
    expect(MEAL_OCCASION_DEFAULT_LABELS.occasion_1).toBe('Mini Meal');
    expect(schedule.slots.occasion_2.enabled).toBe(true);
    expect(schedule.slots.occasion_4.enabled).toBe(true);
    expect(schedule.slots.occasion_7.enabled).toBe(true);
  });

  it('orders enabled occasions by target_time, not key ordinal', () => {
    const schedule = defaultMealSchedule();
    schedule.slots.occasion_7.target_time = '07:00';
    schedule.slots.occasion_2.target_time = '12:00';
    schedule.slots.occasion_4.target_time = '19:00';
    const enabled = resolveMealSchedule({
      profile_schedule: schedule,
      program_overrides: [],
    }).resolved_slots.filter((s) => s.enabled);
    expect(enabled.map((s) => s.key)).toEqual([
      'occasion_7',
      'occasion_2',
      'occasion_4',
    ]);
    expect(hhmmToMinutes(enabled[0].target_time)).toBeLessThan(
      hhmmToMinutes(enabled[1].target_time),
    );
  });

  it('nickname changes do not alter occasion identity; v2 keys do not force PlannedMealType', () => {
    const schedule = defaultMealSchedule();
    schedule.slots.occasion_3.label = 'Second Breakfast';
    schedule.slots.occasion_3.enabled = true;
    expect(mealTypeForSlotKey('occasion_3')).toBe('other');
    expect(mealTypeForSlotKey('occasion_2')).toBe('other');
    expect(mealTypeForLegacySlotKey('breakfast')).toBe('breakfast');
    expect(mealTypeForSlotKey('breakfast')).toBe('breakfast');
    const resolved = resolveMealSchedule({
      profile_schedule: schedule,
      program_overrides: [],
    }).resolved_slots.find((s) => s.key === 'occasion_3');
    expect(resolved?.key).toBe('occasion_3');
    expect(resolved?.label).toBe('Second Breakfast');
    expect(mealTypeForSlotKey(resolved!.key)).toBe('other');
  });

  it('maps legacy Program require/disallow keys and resolves v2 overrides', () => {
    const legacy = normalizeProgramScheduleOverride({
      require_slots: ['breakfast'],
      disallow_slots: ['evening_snack'],
    });
    expect(legacy?.require_slots).toEqual(['occasion_2']);
    expect(legacy?.disallow_slots).toEqual(['occasion_8']);

    const schedule = defaultMealSchedule();
    schedule.slots.occasion_2.enabled = false;
    schedule.slots.occasion_8.enabled = true;
    const { resolved_slots, conflicts } = resolveMealSchedule({
      profile_schedule: schedule,
      program_overrides: [legacy!],
    });
    expect(resolved_slots.find((s) => s.key === 'occasion_2')?.enabled).toBe(true);
    expect(resolved_slots.find((s) => s.key === 'occasion_8')?.enabled).toBe(false);
    expect(conflicts.some((c) => c.slot_key === 'occasion_8')).toBe(true);
  });

  it('historical journal context with a legacy key resolves to the matching v2 occasion', () => {
    const schedule = defaultMealSchedule();
    const enabled = resolveMealSchedule({
      profile_schedule: schedule,
      program_overrides: [],
    }).resolved_slots.filter((s) => s.enabled);
    const entry = {
      id: 'e1',
      timestamp: new Date('2026-08-21T08:05:00'),
      payload: {
        meal_schedule_context: {
          slot_key: 'breakfast',
          slot_label: 'Breakfast',
          slot_target_time: '08:00',
          assignment_source: 'manual',
          meal_schedule_updated_at: schedule.updated_at,
        },
      },
    } as unknown as JournalEntry;
    const ctx = getEntryMealScheduleContext(entry);
    expect(ctx?.slot_key).toBe('breakfast');
    const matched = getMealSlotForEntry(entry, enabled);
    expect(matched?.key).toBe('occasion_2');
  });

  it('v2 journal context round-trips', () => {
    const schedule = defaultMealSchedule();
    const slot = resolveMealSchedule({
      profile_schedule: schedule,
      program_overrides: [],
    }).resolved_slots.find((s) => s.key === 'occasion_4')!;
    const built = buildMealScheduleContext(slot, 'auto', schedule);
    expect(built.slot_key).toBe('occasion_4');
    const entry = {
      id: 'e2',
      timestamp: new Date('2026-08-21T12:30:00'),
      payload: { meal_schedule_context: built },
    } as unknown as JournalEntry;
    expect(getEntryMealScheduleContext(entry)?.slot_key).toBe('occasion_4');
    expect(getMealSlotForEntry(entry, [slot])?.key).toBe('occasion_4');
  });

  it('Initial Setup presets retain effective enabled counts via legacy→v2 mapping', () => {
    const three = buildAppCopyMealSchedule({
      ...INITIAL_ANSWERS,
      rhythm_template: 'three_meals_daily',
    });
    expect(enabledSlotCount(three)).toBe(3);
    expect(three.version).toBe(2);

    const oneMini = buildAppCopyMealSchedule({
      ...INITIAL_ANSWERS,
      rhythm_template: 'three_meals_one_mini',
    });
    expect(enabledSlotCount(oneMini)).toBe(4);

    const twoMinis = buildAppCopyMealSchedule({
      ...INITIAL_ANSWERS,
      rhythm_template: 'three_meals_two_minis',
    });
    expect(enabledSlotCount(twoMinis)).toBe(5);

    const twoMeals = buildAppCopyMealSchedule({
      ...INITIAL_ANSWERS,
      rhythm_template: 'two_meals_one_mini',
    });
    expect(enabledSlotCount(twoMeals)).toBe(3);

    const custom = buildAppCopyMealSchedule({
      ...INITIAL_ANSWERS,
      rhythm_template: 'custom_rhythm',
    });
    expect(enabledSlotCount(custom)).toBe(0);
    expect(isUsableSavedMealSchedule(custom)).toBe(false);
  });

  it('Meal Rhythm save payload writes v2 and dual-read schema accepts both versions', () => {
    const schedule = defaultMealSchedule();
    const payload = buildMealScheduleSavePayload(schedule, new Date('2026-08-21T15:00:00.000Z'));
    expect(payload.meal_schedule.version).toBe(2);
    expect(MealScheduleWriteSchema.safeParse(payload.meal_schedule).success).toBe(true);
    expect(MealScheduleSchema.safeParse(payload.meal_schedule).success).toBe(true);
    expect(MealScheduleSchema.safeParse(defaultMealScheduleV1()).success).toBe(true);
    expect(enabledSlotCount(payload.meal_schedule)).toBeGreaterThanOrEqual(1);
  });

  it('strict schedule schemas reject arbitrary and mixed slot keys', () => {
    const v2 = defaultMealSchedule();
    expect(MealScheduleV2Schema.safeParse(v2).success).toBe(true);
    expect(MealScheduleV1Schema.safeParse(defaultMealScheduleV1()).success).toBe(true);

    const withOccasion9 = {
      ...v2,
      slots: { ...v2.slots, occasion_9: v2.slots.occasion_1 },
    };
    expect(MealScheduleWriteSchema.safeParse(withOccasion9).success).toBe(false);
    expect(MealScheduleSchema.safeParse(withOccasion9).success).toBe(false);

    const withArbitrary = {
      ...v2,
      slots: { ...v2.slots, brunch: v2.slots.occasion_2 },
    };
    expect(MealScheduleSchema.safeParse(withArbitrary).success).toBe(false);

    const mixedLegacyOnV2 = {
      ...v2,
      slots: { ...v2.slots, breakfast: v2.slots.occasion_2 },
    };
    expect(MealScheduleSchema.safeParse(mixedLegacyOnV2).success).toBe(false);

    const v1Extra = {
      ...defaultMealScheduleV1(),
      slots: {
        ...defaultMealScheduleV1().slots,
        occasion_1: defaultMealSchedule().slots.occasion_1,
      },
    };
    expect(MealScheduleSchema.safeParse(v1Extra).success).toBe(false);

    const unexpectedRoot = { ...v2, extra_root: true };
    expect(MealScheduleWriteSchema.safeParse(unexpectedRoot).success).toBe(false);
  });

  it('normalizeMealSchedule dual-reads v1 without inventing writes', () => {
    const v1 = defaultMealScheduleV1();
    v1.slots.breakfast.target_time = '07:00';
    const normalized = normalizeMealSchedule(v1);
    expect(normalized.version).toBe(2);
    expect(normalized.slots.occasion_2.target_time).toBe('07:00');
    expect(normalized.updated_at).toBe(v1.updated_at);
  });

  it('Profile-style v2 clone round-trips', () => {
    const original = defaultMealSchedule();
    original.slots.occasion_1.enabled = true;
    original.slots.occasion_1.label = 'Dawn bite';
    const cloned = cloneMealSchedule(original);
    expect(cloned).toEqual({ ...original, slots: expect.any(Object) });
    expect(cloned.slots.occasion_1).toEqual(original.slots.occasion_1);
    expect(cloned.slots).not.toBe(original.slots);
  });

  it('proposeMealRhythm keeps saved v1 truth and normalizes to v2 for edit', () => {
    const saved = defaultMealScheduleV1();
    saved.slots.lunch.enabled = false;
    const proposal = proposeMealRhythm({ savedSchedule: saved });
    expect(proposal.source).toBe('saved_schedule');
    expect(proposal.schedule.version).toBe(2);
    expect(proposal.schedule.slots.occasion_4.enabled).toBe(false);
    expect(proposal.schedule.slots.occasion_2.enabled).toBe(true);
  });

  it('covers all six legacy keys in the deterministic mapping table', () => {
    expect(LEGACY_MEAL_SLOT_KEYS).toHaveLength(6);
    const converted = mealScheduleV1ToV2(defaultMealScheduleV1());
    for (const key of MEAL_OCCASION_KEYS) {
      expect(converted.slots[key]).toBeDefined();
    }
  });
});
