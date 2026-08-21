import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import {
  PLAN_DAY_STRUCTURE_INSERT,
  PLAN_STRUCTURE_POLICY_ID,
  PLAN_STRUCTURE_POLICY_VERSION,
  canonicalEnsureSlotOrdinal,
  nextPlanSlotOrdinal,
  occasionNeedsStructureEnsure,
  parseEnsurePlanOccasionStructureCommand,
  preferredSlotOrdinalForOccasion,
} from '../policy';
import { MEAL_SLOT_DEFAULT_TIMES, type MealSchedule } from '@/lib/plans/types';

describe('parseEnsurePlanOccasionStructureCommand', () => {
  it('accepts a typed plan/date/slot command and rejects invalid dates or keys', () => {
    expect(
      parseEnsurePlanOccasionStructureCommand({
        planId: 'plan-1',
        dateLocal: '2026-08-16',
        slotKey: 'occasion_4',
      }),
    ).toEqual({
      planId: 'plan-1',
      dateLocal: '2026-08-16',
      slotKey: 'occasion_4',
    });
    expect(
      parseEnsurePlanOccasionStructureCommand({
        planId: 'plan-1',
        dateLocal: '2026-08-16',
        slotKey: 'lunch',
      }),
    ).toEqual({
      planId: 'plan-1',
      dateLocal: '2026-08-16',
      slotKey: 'occasion_4',
    });
    expect(
      parseEnsurePlanOccasionStructureCommand({
        planId: 'plan-1',
        dateLocal: '2026-02-30',
        slotKey: 'occasion_4',
      }),
    ).toBeNull();
    expect(
      parseEnsurePlanOccasionStructureCommand({
        planId: 'plan-1',
        dateLocal: '2026-08-16',
        slotKey: 'brunch',
      }),
    ).toBeNull();
  });
});

describe('preferredSlotOrdinalForOccasion / nextPlanSlotOrdinal', () => {
  const enabled = [
    { key: 'occasion_2' as const, enabled: true },
    { key: 'occasion_4' as const, enabled: true },
    { key: 'occasion_7' as const, enabled: true },
  ];

  it('uses 1-based enabled-slot ordinals and skips disabled occasions', () => {
    expect(preferredSlotOrdinalForOccasion(enabled, 'occasion_2')).toBe(1);
    expect(preferredSlotOrdinalForOccasion(enabled, 'occasion_4')).toBe(2);
    expect(
      preferredSlotOrdinalForOccasion(
        [
          { key: 'occasion_2', enabled: true },
          { key: 'occasion_3', enabled: false },
          { key: 'occasion_4', enabled: true },
        ],
        'occasion_4',
      ),
    ).toBe(2);
    expect(preferredSlotOrdinalForOccasion(enabled, 'occasion_3')).toBeNull();
  });

  it('reuses a free preferred ordinal and otherwise appends after occupied ordinals', () => {
    expect(nextPlanSlotOrdinal({ preferredOrdinal: 2, occupiedOrdinals: [1] })).toBe(2);
    expect(nextPlanSlotOrdinal({ preferredOrdinal: 1, occupiedOrdinals: [1] })).toBe(2);
    expect(nextPlanSlotOrdinal({ preferredOrdinal: 2, occupiedOrdinals: [] })).toBe(2);
  });

  it('keeps rhythm order when lunch is ensured before breakfast on an empty day', () => {
    const occupied: number[] = [];
    const lunch = canonicalEnsureSlotOrdinal({
      enabledSlots: enabled,
      slotKey: 'occasion_4',
      occupiedOrdinals: occupied,
    });
    expect(lunch).toBe(2);
    occupied.push(lunch!);
    const breakfast = canonicalEnsureSlotOrdinal({
      enabledSlots: enabled,
      slotKey: 'occasion_2',
      occupiedOrdinals: occupied,
    });
    expect(breakfast).toBe(1);
    occupied.push(breakfast!);
    const dinner = canonicalEnsureSlotOrdinal({
      enabledSlots: enabled,
      slotKey: 'occasion_7',
      occupiedOrdinals: occupied,
    });
    expect(dinner).toBe(3);
    expect([lunch, breakfast, dinner].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3]);
  });

  it('assigns distinct rhythm ordinals for concurrent ensures of different slots on an empty day', () => {
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'occasion_2',
        occupiedOrdinals: [],
      }),
    ).toBe(1);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'occasion_4',
        occupiedOrdinals: [],
      }),
    ).toBe(2);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'occasion_7',
        occupiedOrdinals: [],
      }),
    ).toBe(3);
  });

  it('derives ordinals from saved Meal Rhythm order, not from ensure call order', () => {
    const rhythm: MealSchedule = {
      version: 2,
      updated_at: '2026-08-16T00:00:00.000Z',
      slots: {
        occasion_1: { enabled: false, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_1, label: null },
        occasion_2: { enabled: true, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_2, label: null },
        occasion_3: { enabled: false, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_3, label: null },
        occasion_4: { enabled: true, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_4, label: null },
        occasion_5: { enabled: false, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_5, label: null },
        occasion_6: { enabled: false, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_6, label: null },
        occasion_7: { enabled: true, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_7, label: null },
        occasion_8: { enabled: false, target_time: MEAL_SLOT_DEFAULT_TIMES.occasion_8, label: null },
      },
    };
    const enabledSlots = getEnabledMealSlots(rhythm);
    expect(enabledSlots.map((slot) => slot.key)).toEqual(['occasion_2', 'occasion_4', 'occasion_7']);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots,
        slotKey: 'occasion_4',
        occupiedOrdinals: [],
      }),
    ).toBe(2);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots,
        slotKey: 'occasion_2',
        occupiedOrdinals: [2],
      }),
    ).toBe(1);
  });

  it('does not steal an existing slot ordinal or invent a disabled occasion', () => {
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'occasion_4',
        occupiedOrdinals: [1, 2],
      }),
    ).toBe(3);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'morning_snack',
        occupiedOrdinals: [],
      }),
    ).toBeNull();
  });
});

describe('occasionNeedsStructureEnsure', () => {
  it('ensures only when the user is filling on-plan and day or slot is missing', () => {
    expect(
      occasionNeedsStructureEnsure({
        canFillOnPlan: true,
        hasPlanDay: false,
        hasMatchingSlot: false,
      }),
    ).toBe(true);
    expect(
      occasionNeedsStructureEnsure({
        canFillOnPlan: true,
        hasPlanDay: true,
        hasMatchingSlot: false,
      }),
    ).toBe(true);
    expect(
      occasionNeedsStructureEnsure({
        canFillOnPlan: true,
        hasPlanDay: true,
        hasMatchingSlot: true,
      }),
    ).toBe(false);
    expect(
      occasionNeedsStructureEnsure({
        canFillOnPlan: false,
        hasPlanDay: false,
        hasMatchingSlot: false,
      }),
    ).toBe(false);
  });
});

describe('plan-structure.ensure policy stamp', () => {
  it('keeps the unique day index contract without schema/DDL', () => {
    expect(PLAN_STRUCTURE_POLICY_ID).toBe('plan-structure.ensure');
    expect(PLAN_STRUCTURE_POLICY_VERSION).toBe('v1');
    expect(PLAN_DAY_STRUCTURE_INSERT).toEqual({
      onConflict: 'plan_id,date_local',
      ignoreDuplicates: true,
    });
  });
});
