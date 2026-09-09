import { findExistingPlansHomeSlotMeal } from '../plansHomeCreateGuard';
import type { PlannedMeal } from '@/lib/plans/types';

function meal(overrides: Partial<PlannedMeal> = {}): PlannedMeal {
  return {
    id: 'meal-1',
    person_id: 'person-1',
    plan_id: 'plan-1',
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    name: 'Bean bowl',
    meal_type: 'lunch',
    payload: {},
    execution_state: 'pending',
    journal_entry_id: null,
    created_at: '2026-09-08T12:00:00.000Z',
    updated_at: '2026-09-08T12:00:00.000Z',
    ...overrides,
  } as PlannedMeal;
}

describe('Plans Home create guard', () => {
  it('reuses the existing container for the exact plan/day/slot', () => {
    const existing = meal();
    expect(
      findExistingPlansHomeSlotMeal({
        meals: [existing],
        planId: 'plan-1',
        planDayId: 'day-1',
        planSlotId: 'slot-1',
      }),
    ).toBe(existing);
  });

  it('does not collide with another day or occasion', () => {
    expect(
      findExistingPlansHomeSlotMeal({
        meals: [
          meal({ id: 'other-slot', plan_slot_id: 'slot-2' }),
          meal({ id: 'other-day', plan_day_id: 'day-2' }),
        ],
        planId: 'plan-1',
        planDayId: 'day-1',
        planSlotId: 'slot-1',
      }),
    ).toBeNull();
  });
});
