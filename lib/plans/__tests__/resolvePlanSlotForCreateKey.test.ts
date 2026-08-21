import {
  resolvePlanSlotForCreateKey,
  shouldConsumeCreateSlotDeepLink,
} from '../../../pages/journal/plans/day/[date]';
import type { PlanSlot, ResolvedScheduleSlot } from '../types';

function planSlot(
  id: string,
  label: string,
  block: PlanSlot['slot_block'] = 'morning',
  extras: Partial<Pick<PlanSlot, 'slot_ordinal' | 'target_time'>> = {},
): PlanSlot {
  return {
    id,
    plan_day_id: 'day-1',
    person_id: 'person-1',
    slot_block: block,
    slot_ordinal: extras.slot_ordinal ?? 0,
    slot_label: label,
    target_time: extras.target_time ?? null,
    created_at: '',
    updated_at: '',
  };
}

function enabled(
  key: ResolvedScheduleSlot['key'],
  label: string,
  time: string,
): ResolvedScheduleSlot {
  return {
    key,
    label,
    target_time: time,
    slot_block: 'morning',
    enabled: true,
    source: 'profile',
  };
}

describe('resolvePlanSlotForCreateKey', () => {
  const slots = [
    planSlot('b', 'Breakfast', 'morning'),
    planSlot('ms', 'Morning Snack', 'morning'),
    planSlot('l', 'Lunch', 'midday'),
    planSlot('as', 'Afternoon Mini-Meal', 'afternoon'),
    planSlot('d', 'Dinner', 'evening'),
    planSlot('es', 'Evening Snack', 'evening'),
  ];

  it('maps meal keys to labeled slots', () => {
    expect(resolvePlanSlotForCreateKey('breakfast', slots)?.id).toBe('b');
    expect(resolvePlanSlotForCreateKey('lunch', slots)?.id).toBe('l');
    expect(resolvePlanSlotForCreateKey('dinner', slots)?.id).toBe('d');
  });

  it('resolves snack keys to the correct labeled slot when several exist', () => {
    expect(resolvePlanSlotForCreateKey('morning_snack', slots)?.id).toBe('ms');
    expect(resolvePlanSlotForCreateKey('afternoon_snack', slots)?.id).toBe('as');
    expect(resolvePlanSlotForCreateKey('evening_snack', slots)?.id).toBe('es');
  });

  it('matches Mini-Meal labels for afternoon_snack', () => {
    const miniOnly = [
      planSlot('ms', 'Morning Snack', 'morning'),
      planSlot('mm', 'Mini-Meal', 'afternoon'),
      planSlot('es', 'Evening Snack', 'evening'),
    ];
    expect(resolvePlanSlotForCreateKey('afternoon_snack', miniOnly)?.id).toBe('mm');
  });

  it('fails closed for unknown keys instead of picking an empty slot', () => {
    expect(resolvePlanSlotForCreateKey('brunch', slots)).toBeNull();
    expect(resolvePlanSlotForCreateKey('not_a_slot', slots)).toBeNull();
    expect(resolvePlanSlotForCreateKey('', slots)).toBeNull();
  });

  it('resolves distinct Mini Meal occasions via ordinal/time, not shared label', () => {
    const daySlots = [
      planSlot('mm1', 'Mini Meal', 'morning', { slot_ordinal: 1, target_time: '06:30' }),
      planSlot('b', 'Breakfast', 'morning', { slot_ordinal: 2, target_time: '08:00' }),
      planSlot('mm2', 'Mini Meal', 'afternoon', { slot_ordinal: 3, target_time: '15:30' }),
      planSlot('mm3', 'Mini Meal', 'evening', { slot_ordinal: 4, target_time: '21:00' }),
    ];
    const schedule = {
      enabledSlots: [
        enabled('occasion_1', 'Mini Meal', '06:30'),
        enabled('occasion_2', 'Breakfast', '08:00'),
        enabled('occasion_5', 'Mini Meal', '15:30'),
        enabled('occasion_6', 'Mini Meal', '21:00'),
      ],
    };
    expect(resolvePlanSlotForCreateKey('occasion_1', daySlots, schedule)?.id).toBe('mm1');
    expect(resolvePlanSlotForCreateKey('occasion_5', daySlots, schedule)?.id).toBe('mm2');
    expect(resolvePlanSlotForCreateKey('occasion_6', daySlots, schedule)?.id).toBe('mm3');
    expect(resolvePlanSlotForCreateKey('occasion_2', daySlots, schedule)?.id).toBe('b');
  });

  it('keeps occasions distinct when every enabled nickname is identical', () => {
    const daySlots = [
      planSlot('a', 'Fuel', 'morning', { slot_ordinal: 1, target_time: '07:00' }),
      planSlot('b', 'Fuel', 'midday', { slot_ordinal: 2, target_time: '12:00' }),
      planSlot('c', 'Fuel', 'evening', { slot_ordinal: 3, target_time: '18:00' }),
    ];
    const schedule = {
      enabledSlots: [
        enabled('occasion_2', 'Fuel', '07:00'),
        enabled('occasion_4', 'Fuel', '12:00'),
        enabled('occasion_7', 'Fuel', '18:00'),
      ],
    };
    expect(resolvePlanSlotForCreateKey('occasion_2', daySlots, schedule)?.id).toBe('a');
    expect(resolvePlanSlotForCreateKey('occasion_4', daySlots, schedule)?.id).toBe('b');
    expect(resolvePlanSlotForCreateKey('occasion_7', daySlots, schedule)?.id).toBe('c');
  });

  it('fails closed when identical Mini Meal labels collide without schedule context', () => {
    const miniCollisions = [
      planSlot('mm1', 'Mini Meal', 'morning', { slot_ordinal: 1, target_time: '06:30' }),
      planSlot('mm2', 'Mini Meal', 'afternoon', { slot_ordinal: 2, target_time: '15:30' }),
    ];
    expect(resolvePlanSlotForCreateKey('occasion_1', miniCollisions)).toBeNull();
    expect(resolvePlanSlotForCreateKey('occasion_5', miniCollisions)).toBeNull();
  });
});

describe('shouldConsumeCreateSlotDeepLink', () => {
  const ready = {
    createSlot: 'breakfast',
    loading: false,
    slotsReady: true,
    routerReady: true,
    alreadyConsumedKey: null as string | null,
  };

  it('consumes once when deep link is fresh and page is ready', () => {
    expect(shouldConsumeCreateSlotDeepLink(ready)).toBe(true);
  });

  it('does not reopen the same createSlot key after it was consumed', () => {
    expect(
      shouldConsumeCreateSlotDeepLink({
        ...ready,
        alreadyConsumedKey: 'breakfast',
      }),
    ).toBe(false);
  });

  it('waits while loading or slots/router are not ready', () => {
    expect(shouldConsumeCreateSlotDeepLink({ ...ready, loading: true })).toBe(
      false,
    );
    expect(
      shouldConsumeCreateSlotDeepLink({ ...ready, slotsReady: false }),
    ).toBe(false);
    expect(
      shouldConsumeCreateSlotDeepLink({ ...ready, routerReady: false }),
    ).toBe(false);
    expect(
      shouldConsumeCreateSlotDeepLink({ ...ready, createSlot: undefined }),
    ).toBe(false);
  });
});
