import type { PlanDay, PlanSlot, PlannedMeal } from '@/lib/plans';
import {
  getVisibleCalendarDates,
  projectMonthPlanningState,
  resolveCalendarMonthKey,
  shiftCalendarMonthKey,
} from '@/lib/plans/monthProjection';

describe('Packet 19 Month calendar projection', () => {
  it('builds complete Sunday-through-Saturday rows across month boundaries', () => {
    const dates = getVisibleCalendarDates('2026-10');
    expect(dates).toHaveLength(35);
    expect(dates.slice(0, 7)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(dates.at(-1)).toBe('2026-10-31');
  });

  it('keeps navigation on stable calendar months and rejects invalid month input', () => {
    expect(shiftCalendarMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftCalendarMonthKey('2027-01', -1)).toBe('2026-12');
    expect(resolveCalendarMonthKey('2026-13', new Date(2026, 8, 12))).toBe('2026-09');
  });

  it('projects dated truth and counts an occupied PlanSlot only once', () => {
    const day = {
      id: 'day-1',
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: '2026-10-05',
    } as PlanDay;
    const emptyDay = {
      id: 'day-2',
      plan_id: 'plan-1',
      person_id: 'person-1',
      date_local: '2026-10-06',
    } as PlanDay;
    const slot = {
      id: 'slot-1',
      plan_day_id: day.id,
      person_id: day.person_id,
      slot_ordinal: 1,
    } as PlanSlot;
    const meals = [
      {
        id: 'meal-1',
        plan_id: day.plan_id,
        plan_day_id: day.id,
        plan_slot_id: slot.id,
        person_id: day.person_id,
        name: 'Saved meal',
        payload: {
          items: [
            { name: 'Greek yogurt' },
            { name: 'Blueberries' },
          ],
        },
      },
      {
        id: 'meal-2',
        plan_id: day.plan_id,
        plan_day_id: day.id,
        plan_slot_id: slot.id,
        person_id: day.person_id,
        name: 'Single item',
        payload: { items: [{ name: 'Walnuts' }] },
      },
    ] as PlannedMeal[];

    const result = projectMonthPlanningState(
      ['2026-10-05', '2026-10-06', '2026-10-07'],
      [day, emptyDay],
      [slot],
      meals,
    );

    expect(result).toEqual([
      {
        dateLocal: '2026-10-05',
        hasDatedDay: true,
        planned: true,
        occupiedOccasionCount: 1,
      },
      {
        dateLocal: '2026-10-06',
        hasDatedDay: true,
        planned: false,
        occupiedOccasionCount: 0,
      },
      {
        dateLocal: '2026-10-07',
        hasDatedDay: false,
        planned: false,
        occupiedOccasionCount: 0,
      },
    ]);
  });
});
