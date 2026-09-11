import {
  OUT_OF_RANGE_PLAN_DATE_MESSAGE,
  presentationSlotIdForScheduleKey,
  presentationSlotsFromSchedule,
  resolveRequestedPlanDateState,
  scheduleKeyFromPresentationSlotId,
} from '@/lib/plans/resolveRequestedPlanDateState';
import type { Plan, PlanDay, ResolvedScheduleSlot } from '@/lib/plans/types';

function plan(overrides: Partial<Plan> = {}): Pick<Plan, 'start_date' | 'end_date' | 'plan_shape'> {
  return {
    start_date: '2026-09-07',
    end_date: '2026-09-13',
    plan_shape: 'week',
    ...overrides,
  };
}

function day(date_local: string): Pick<PlanDay, 'date_local'> {
  return { date_local };
}

describe('resolveRequestedPlanDateState', () => {
  it('resolves an in-range materialized date', () => {
    const state = resolveRequestedPlanDateState({
      plan: plan(),
      days: [day('2026-09-07'), day('2026-09-10')],
      requestedDate: '2026-09-10',
    });
    expect(state.kind).toBe('in_range_materialized');
    expect(state.coverage).toEqual({ start: '2026-09-07', end: '2026-09-13' });
  });

  it('resolves an in-range date with no PlanDay row as unmaterialized, not out of range', () => {
    const state = resolveRequestedPlanDateState({
      plan: plan(),
      days: [day('2026-09-07'), day('2026-09-08')],
      requestedDate: '2026-09-10',
    });
    expect(state.kind).toBe('in_range_unmaterialized');
    expect(state.kind).not.toBe('out_of_range');
  });

  it('uses declared plan coverage when plan_days are sparse and end_date is absent', () => {
    const state = resolveRequestedPlanDateState({
      plan: plan({ end_date: null, plan_shape: 'week', start_date: '2026-09-07' }),
      days: [day('2026-09-07'), day('2026-09-08')],
      requestedDate: '2026-09-10',
    });
    expect(state.kind).toBe('in_range_unmaterialized');
    expect(state.coverage.end).toBe('2026-09-13');
  });

  it('rejects a date that is truly outside plan coverage', () => {
    const state = resolveRequestedPlanDateState({
      plan: plan(),
      days: [day('2026-09-07'), day('2026-09-10')],
      requestedDate: '2026-09-20',
    });
    expect(state.kind).toBe('out_of_range');
    expect(OUT_OF_RANGE_PLAN_DATE_MESSAGE).toMatch(/outside the active plan/i);
  });
});

describe('presentationSlotsFromSchedule', () => {
  it('builds presentation-only slots keyed by exact schedule identity', () => {
    const schedule: ResolvedScheduleSlot[] = [
      {
        key: 'occasion_1',
        enabled: true,
        target_time: '06:30',
        label: 'Mini Meal',
        slot_block: 'morning',
        source: 'profile',
      },
      {
        key: 'occasion_5',
        enabled: true,
        target_time: '14:00',
        label: 'Mini Meal',
        slot_block: 'midday',
        source: 'profile',
      },
    ];

    const rows = presentationSlotsFromSchedule(schedule);
    expect(rows.map((row) => row.slotKey)).toEqual(['occasion_1', 'occasion_5']);
    expect(rows[0]?.slot.id).toBe(presentationSlotIdForScheduleKey('occasion_1'));
    expect(rows[1]?.slot.id).toBe(presentationSlotIdForScheduleKey('occasion_5'));
    expect(scheduleKeyFromPresentationSlotId(rows[0]!.slot.id)).toBe('occasion_1');
    expect(rows.every((row) => row.slot.plan_day_id === '')).toBe(true);
  });
});
