process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { ensurePlanHorizonThroughDate } from '../planServerService';
import {
  PlanIntegrityError,
  PlanNotFoundError,
  PlanRequestValidationError,
} from '../planRequestErrors';
import type { PlanScheduleSnapshot } from '../types';

const mockFrom = supabaseAdmin.from as jest.Mock;
const mockRpc = supabaseAdmin.rpc as jest.Mock;

const PERSON_ID = 'person-1';
const PLAN_ID = 'plan-1';

const PROGRAM_REQUIRED_SNAPSHOT: PlanScheduleSnapshot = {
  profile_schedule: {
    version: 2,
    updated_at: '2026-07-01T00:00:00.000Z',
    slots: {
      occasion_1: { enabled: false, target_time: '06:30', label: null },
      occasion_2: { enabled: true, target_time: '08:00', label: null },
      occasion_3: { enabled: false, target_time: '10:30', label: null },
      occasion_4: { enabled: true, target_time: '12:30', label: null },
      occasion_5: { enabled: false, target_time: '15:30', label: null },
      occasion_6: { enabled: false, target_time: '17:00', label: null },
      occasion_7: { enabled: true, target_time: '19:00', label: null },
      occasion_8: { enabled: false, target_time: '21:00', label: null },
    },
  },
  resolved_slots: [
    {
      key: 'occasion_2',
      slot_block: 'morning',
      label: 'Program breakfast',
      target_time: '06:30',
      enabled: true,
      source: 'program_required',
    },
  ],
  conflicts: [],
};

function mockPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    person_id: PERSON_ID,
    title: 'Test plan',
    plan_shape: 'multi_day',
    source: 'user_manual',
    status: 'active',
    start_date: '2026-07-18',
    end_date: '2026-07-19',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: { schedule_snapshot: null },
    nds_version: 'nds.v1',
    classifier_version: 'classifier.v1',
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function mockTablesForPlan(planRow: ReturnType<typeof mockPlanRow>) {
  const peopleChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { metadata: {} },
          error: null,
        }),
      }),
    }),
  };
  const plansChain = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: planRow, error: null }),
        }),
      }),
    }),
  };
  mockFrom.mockImplementation((table: string) => {
    if (table === 'people') return peopleChain;
    if (table === 'plans') return plansChain;
    throw new Error(`Unexpected table ${table}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensurePlanHorizonThroughDate', () => {
  test('passes the plan-frozen schedule_snapshot (program-required structure) to the RPC, not the live profile schedule', async () => {
    mockTablesForPlan(
      mockPlanRow({ input_snapshot_json: { schedule_snapshot: PROGRAM_REQUIRED_SNAPSHOT } }),
    );
    mockRpc.mockResolvedValue({ data: { days_added: 3, end_date: '2026-07-22' }, error: null });

    const result = await ensurePlanHorizonThroughDate({
      personId: PERSON_ID,
      planId: PLAN_ID,
      requiredEndDateLocal: '2026-07-22',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'extend_plan_horizon_through_date',
      expect.objectContaining({
        p_person_id: PERSON_ID,
        p_plan_id: PLAN_ID,
        p_required_end_date: '2026-07-22',
        p_schedule_slots: [
          expect.objectContaining({ slot_block: 'morning', slot_label: 'Program breakfast' }),
        ],
      }),
    );
    expect(result).toEqual({
      daysAdded: 3,
      endDate: '2026-07-22',
      usedLegacyScheduleFallback: false,
    });
  });

  test('falls back to the legacy profile schedule and reports the fallback when the plan has no schedule_snapshot', async () => {
    mockTablesForPlan(mockPlanRow({ input_snapshot_json: { schedule_snapshot: null } }));
    mockRpc.mockResolvedValue({ data: { days_added: 1, end_date: '2026-07-20' }, error: null });

    const result = await ensurePlanHorizonThroughDate({
      personId: PERSON_ID,
      planId: PLAN_ID,
      requiredEndDateLocal: '2026-07-20',
    });

    expect(result.usedLegacyScheduleFallback).toBe(true);
    const rpcArgs = mockRpc.mock.calls[0]?.[1];
    expect(Array.isArray(rpcArgs.p_schedule_slots)).toBe(true);
    expect(rpcArgs.p_schedule_slots.length).toBeGreaterThan(0);
  });

  test('is a no-op (0 days added) and still succeeds when the plan already reaches the required end date', async () => {
    mockTablesForPlan(mockPlanRow());
    mockRpc.mockResolvedValue({ data: { days_added: 0, end_date: '2026-07-19' }, error: null });

    const result = await ensurePlanHorizonThroughDate({
      personId: PERSON_ID,
      planId: PLAN_ID,
      requiredEndDateLocal: '2026-07-19',
    });
    expect(result.daysAdded).toBe(0);
  });

  test('maps PLAN_NOT_FOUND from the RPC to a typed 404 error', async () => {
    mockTablesForPlan(mockPlanRow());
    mockRpc.mockResolvedValue({ data: null, error: { message: 'PLAN_NOT_FOUND' } });

    await expect(
      ensurePlanHorizonThroughDate({
        personId: PERSON_ID,
        planId: PLAN_ID,
        requiredEndDateLocal: '2026-07-25',
      }),
    ).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  test('maps PLAN_HAS_NO_DAYS from the RPC to a typed 400 error', async () => {
    mockTablesForPlan(mockPlanRow());
    mockRpc.mockResolvedValue({ data: null, error: { message: 'PLAN_HAS_NO_DAYS' } });

    await expect(
      ensurePlanHorizonThroughDate({
        personId: PERSON_ID,
        planId: PLAN_ID,
        requiredEndDateLocal: '2026-07-25',
      }),
    ).rejects.toBeInstanceOf(PlanRequestValidationError);
  });

  test('maps PLAN_DAYS_NOT_CONTIGUOUS from the RPC to a typed integrity error, never silently applying a truncated extension', async () => {
    mockTablesForPlan(mockPlanRow());
    mockRpc.mockResolvedValue({ data: null, error: { message: 'PLAN_DAYS_NOT_CONTIGUOUS' } });

    await expect(
      ensurePlanHorizonThroughDate({
        personId: PERSON_ID,
        planId: PLAN_ID,
        requiredEndDateLocal: '2026-07-25',
      }),
    ).rejects.toBeInstanceOf(PlanIntegrityError);
  });

  test('throws PlanNotFoundError up front when the plan does not exist, without calling the RPC', async () => {
    const plansChain = {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'plans') return plansChain;
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(
      ensurePlanHorizonThroughDate({
        personId: PERSON_ID,
        planId: PLAN_ID,
        requiredEndDateLocal: '2026-07-25',
      }),
    ).rejects.toBeInstanceOf(PlanNotFoundError);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
