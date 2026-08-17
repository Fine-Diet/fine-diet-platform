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
        slotKey: 'lunch',
      }),
    ).toEqual({
      planId: 'plan-1',
      dateLocal: '2026-08-16',
      slotKey: 'lunch',
    });
    expect(
      parseEnsurePlanOccasionStructureCommand({
        planId: 'plan-1',
        dateLocal: '2026-02-30',
        slotKey: 'lunch',
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
    { key: 'breakfast' as const, enabled: true },
    { key: 'lunch' as const, enabled: true },
    { key: 'dinner' as const, enabled: true },
  ];

  it('uses 1-based enabled-slot ordinals and skips disabled occasions', () => {
    expect(preferredSlotOrdinalForOccasion(enabled, 'breakfast')).toBe(1);
    expect(preferredSlotOrdinalForOccasion(enabled, 'lunch')).toBe(2);
    expect(
      preferredSlotOrdinalForOccasion(
        [
          { key: 'breakfast', enabled: true },
          { key: 'morning_snack', enabled: false },
          { key: 'lunch', enabled: true },
        ],
        'lunch',
      ),
    ).toBe(2);
    expect(preferredSlotOrdinalForOccasion(enabled, 'morning_snack')).toBeNull();
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
      slotKey: 'lunch',
      occupiedOrdinals: occupied,
    });
    expect(lunch).toBe(2);
    occupied.push(lunch!);
    const breakfast = canonicalEnsureSlotOrdinal({
      enabledSlots: enabled,
      slotKey: 'breakfast',
      occupiedOrdinals: occupied,
    });
    expect(breakfast).toBe(1);
    occupied.push(breakfast!);
    const dinner = canonicalEnsureSlotOrdinal({
      enabledSlots: enabled,
      slotKey: 'dinner',
      occupiedOrdinals: occupied,
    });
    expect(dinner).toBe(3);
    expect([lunch, breakfast, dinner].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3]);
  });

  it('assigns distinct rhythm ordinals for concurrent ensures of different slots on an empty day', () => {
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'breakfast',
        occupiedOrdinals: [],
      }),
    ).toBe(1);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'lunch',
        occupiedOrdinals: [],
      }),
    ).toBe(2);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'dinner',
        occupiedOrdinals: [],
      }),
    ).toBe(3);
  });

  it('derives ordinals from saved Meal Rhythm order, not from ensure call order', () => {
    const rhythm: MealSchedule = {
      version: 1,
      updated_at: '2026-08-16T00:00:00.000Z',
      slots: {
        breakfast: { enabled: true, target_time: MEAL_SLOT_DEFAULT_TIMES.breakfast, label: null },
        morning_snack: {
          enabled: false,
          target_time: MEAL_SLOT_DEFAULT_TIMES.morning_snack,
          label: null,
        },
        lunch: { enabled: true, target_time: MEAL_SLOT_DEFAULT_TIMES.lunch, label: null },
        afternoon_snack: {
          enabled: false,
          target_time: MEAL_SLOT_DEFAULT_TIMES.afternoon_snack,
          label: null,
        },
        dinner: { enabled: true, target_time: MEAL_SLOT_DEFAULT_TIMES.dinner, label: null },
        evening_snack: {
          enabled: false,
          target_time: MEAL_SLOT_DEFAULT_TIMES.evening_snack,
          label: null,
        },
      },
    };
    const enabledSlots = getEnabledMealSlots(rhythm);
    expect(enabledSlots.map((slot) => slot.key)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots,
        slotKey: 'lunch',
        occupiedOrdinals: [],
      }),
    ).toBe(2);
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots,
        slotKey: 'breakfast',
        occupiedOrdinals: [2],
      }),
    ).toBe(1);
  });

  it('does not steal an existing slot ordinal or invent a disabled occasion', () => {
    expect(
      canonicalEnsureSlotOrdinal({
        enabledSlots: enabled,
        slotKey: 'lunch',
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
