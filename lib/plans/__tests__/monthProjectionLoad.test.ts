import {
  blankDayTemplateForDateContext,
  fetchMonthProjectionData,
} from '../monthProjectionLoad';
import type { Plan, PlanDayTemplate } from '../types';

const frozenBreakfast = {
  key: 'occasion_2' as const,
  enabled: true,
  target_time: '08:00',
  label: 'Breakfast',
  slot_block: 'morning' as const,
  source: 'profile' as const,
};

function frozenPlan(): Plan {
  return {
    id: 'plan-1',
    person_id: 'person-1',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    plan_shape: 'multi_day',
    status: 'active',
    source: 'ai_generated',
    input_snapshot_json: {
      schedule_snapshot: {
        profile_schedule: {} as never,
        resolved_slots: [frozenBreakfast],
        conflicts: [],
      },
    },
  } as Plan;
}

describe('Packet 19 Correction B month projection load', () => {
  it('seeds covered unmaterialized dates from the frozen Plan schedule', () => {
    const profileSlots: PlanDayTemplate['slots'] = [{
      source_plan_slot_id: 'profile-slot',
      slot_ordinal: 1,
      slot_block: 'evening',
      slot_label: 'Dinner',
      target_time: '19:00',
      meals: [],
    }];
    const blank = blankDayTemplateForDateContext({
      personId: 'person-1',
      dateLocal: '2026-10-05',
      profileSeedSlots: profileSlots,
      coveringPlan: frozenPlan(),
    });
    expect(blank.slots[0]?.source_plan_slot_id).toBe('pending:occasion_2');
    expect(blank.slots[0]?.slot_label).toBe('Breakfast');
  });

  it('uses Profile seed only when no covering Plan exists', () => {
    const profileSlots: PlanDayTemplate['slots'] = [{
      source_plan_slot_id: 'profile-slot',
      slot_ordinal: 1,
      slot_block: 'evening',
      slot_label: 'Dinner',
      target_time: '19:00',
      meals: [],
    }];
    const blank = blankDayTemplateForDateContext({
      personId: 'person-1',
      dateLocal: '2026-10-05',
      profileSeedSlots: profileSlots,
      coveringPlan: null,
    });
    expect(blank.slots).toEqual(profileSlots);
  });

  it('retains covering Plan context even when no PlanDay row exists yet', async () => {
    const plan = frozenPlan();
    const data = await fetchMonthProjectionData(
      {
        list: async () => [plan],
        getDetail: async () => ({
          plan,
          days: [],
          slots: [],
          meals: [],
        }),
      },
      ['2026-10-05'],
    );
    expect(data.planDays).toHaveLength(0);
    expect(data.coveringPlanByDate['2026-10-05']?.id).toBe('plan-1');
  });

  it('ignores stale projection responses when a newer request supersedes it', async () => {
    let resolveSlow: ((value: unknown) => void) | null = null;
    const slowPlan = frozenPlan();
    slowPlan.id = 'slow-plan';
    const fastPlan = frozenPlan();
    fastPlan.id = 'fast-plan';

    const services = {
      list: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSlow = resolve;
            }),
        )
        .mockResolvedValueOnce([fastPlan]),
      getDetail: jest.fn().mockImplementation(async (planId: string) => ({
        plan: planId === 'slow-plan' ? slowPlan : fastPlan,
        days: [],
        slots: [],
        meals: [],
      })),
    };

    const slowPromise = fetchMonthProjectionData(services, ['2026-10-05']);
    const fastData = await fetchMonthProjectionData(services, ['2026-10-06']);
    resolveSlow?.([slowPlan]);
    const slowData = await slowPromise;

    expect(fastData.coveringPlanByDate['2026-10-06']?.id).toBe('fast-plan');
    expect(slowData.coveringPlanByDate['2026-10-05']?.id).toBe('slow-plan');
  });
});
