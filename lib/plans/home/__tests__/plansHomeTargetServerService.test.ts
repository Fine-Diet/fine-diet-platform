import { getEnabledMealSlots } from '@/lib/journal/mealScheduleAssignment';
import { isUsableSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';
import { readPersonMetadata } from '@/lib/plans/personMetadataStore';
import { ensurePlanOccasionStructureForPerson } from '@/lib/plans/planStructureServerService';
import {
  createManualPlanForPerson,
  listPlansForPerson,
} from '@/lib/plans/planServerService';
import { resolvePlansHomeTargetForPerson } from '@/lib/plans/plansHomeTargetServerService';
import type { Plan } from '@/lib/plans/types';

jest.mock('@/lib/journal/mealScheduleAssignment', () => ({
  getEnabledMealSlots: jest.fn(),
}));
jest.mock('@/lib/plans/decisioning/usableMealRhythm', () => ({
  isUsableSavedMealSchedule: jest.fn(),
}));
jest.mock('@/lib/plans/personMetadataStore', () => ({
  readPersonMetadata: jest.fn(),
}));
jest.mock('@/lib/plans/planStructureServerService', () => ({
  ensurePlanOccasionStructureForPerson: jest.fn(),
}));
jest.mock('@/lib/plans/planServerService', () => ({
  createManualPlanForPerson: jest.fn(),
  listPlansForPerson: jest.fn(),
}));

const mocks = {
  getEnabledMealSlots: getEnabledMealSlots as jest.MockedFunction<typeof getEnabledMealSlots>,
  isUsableSavedMealSchedule:
    isUsableSavedMealSchedule as jest.MockedFunction<typeof isUsableSavedMealSchedule>,
  readPersonMetadata: readPersonMetadata as jest.MockedFunction<typeof readPersonMetadata>,
  ensure: ensurePlanOccasionStructureForPerson as jest.MockedFunction<typeof ensurePlanOccasionStructureForPerson>,
  create: createManualPlanForPerson as jest.MockedFunction<typeof createManualPlanForPerson>,
  list: listPlansForPerson as jest.MockedFunction<typeof listPlansForPerson>,
};

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'active',
    person_id: 'person-1',
    title: null,
    plan_shape: 'week',
    source: 'ai_generated',
    status: 'active',
    start_date: '2026-09-06',
    end_date: '2026-09-12',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {} as Plan['input_snapshot_json'],
    nds_version: '1',
    classifier_version: '1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mocks.readPersonMetadata.mockResolvedValue({ meal_schedule: {} } as never);
  mocks.isUsableSavedMealSchedule.mockReturnValue(true);
  mocks.getEnabledMealSlots.mockReturnValue([
    {
      key: 'occasion_4',
      label: 'Lunch',
      target_time: '14:00',
      slot_block: 'midday',
      enabled: true,
      source: 'profile',
    },
  ]);
  mocks.ensure.mockResolvedValue({
    planId: 'active',
    planDayId: 'day-1',
    planSlotId: 'slot-1',
    dateLocal: '2026-09-08',
    slotKey: 'occasion_4',
    createdDay: false,
    createdSlot: false,
    reused: true,
  });
});

it('reuses active in-range structure without creating a plan', async () => {
  mocks.list.mockResolvedValue([plan()]);
  const result = await resolvePlansHomeTargetForPerson({
    personId: 'person-1',
    dateLocal: '2026-09-08',
    slotKey: 'occasion_4',
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({
    personId: 'person-1',
    allowWritableDatedDayPlan: true,
  }));
  expect(result.targetKind).toBe('active_coverage');
});

it('creates one exact-date manual day then resolves it through the same selector', async () => {
  const manual = plan({
    id: 'manual',
    plan_shape: 'day',
    source: 'user_manual',
    status: 'draft',
    start_date: '2026-10-08',
    end_date: '2026-10-08',
  });
  mocks.list.mockResolvedValueOnce([plan()]).mockResolvedValueOnce([plan(), manual]);
  mocks.create.mockResolvedValue(manual);
  mocks.ensure.mockResolvedValue({
    planId: 'manual',
    planDayId: 'day-2',
    planSlotId: 'slot-2',
    dateLocal: '2026-10-08',
    slotKey: 'occasion_4',
    createdDay: true,
    createdSlot: true,
    reused: false,
  });

  const result = await resolvePlansHomeTargetForPerson({
    personId: 'person-1',
    dateLocal: '2026-10-08',
    slotKey: 'occasion_4',
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    personId: 'person-1',
    planShape: 'day',
    startDate: '2026-10-08',
    endDate: '2026-10-08',
  }));
  expect(result).toEqual(expect.objectContaining({
    planId: 'manual',
    targetKind: 'created_manual_dated_day',
    createdPlan: true,
  }));
});

it('reuses an existing exact-date manual day on repeated saves', async () => {
  const manual = plan({
    id: 'manual',
    plan_shape: 'day',
    source: 'user_manual',
    status: 'draft',
    start_date: '2026-10-08',
    end_date: '2026-10-08',
  });
  mocks.list.mockResolvedValue([plan(), manual]);
  mocks.ensure.mockResolvedValue({
    planId: 'manual',
    planDayId: 'day-2',
    planSlotId: 'slot-2',
    dateLocal: '2026-10-08',
    slotKey: 'occasion_4',
    createdDay: false,
    createdSlot: false,
    reused: true,
  });

  const result = await resolvePlansHomeTargetForPerson({
    personId: 'person-1',
    dateLocal: '2026-10-08',
    slotKey: 'occasion_4',
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(result.targetKind).toBe('manual_dated_day');
  expect(result.createdPlan).toBe(false);
});
