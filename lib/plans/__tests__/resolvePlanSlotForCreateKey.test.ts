import { resolvePlanSlotForCreateKey } from '../../../pages/journal/plans/day/[date]';
import type { PlanSlot } from '../types';

function planSlot(
  id: string,
  label: string,
  block: PlanSlot['slot_block'] = 'morning',
): PlanSlot {
  return {
    id,
    plan_day_id: 'day-1',
    person_id: 'person-1',
    slot_block: block,
    slot_ordinal: 0,
    slot_label: label,
    target_time: null,
    created_at: '',
    updated_at: '',
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
});
