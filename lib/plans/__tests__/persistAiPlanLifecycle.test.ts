process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  activateGeneratedPlan,
  persistAiPlan,
} from '../planServerService';
import type { AiPlanGenerationResponse } from '../validators';
import type { PlanInputSnapshot } from '../types';

const mockFrom = supabaseAdmin.from as jest.Mock;
const mockRpc = supabaseAdmin.rpc as jest.Mock;

const PERSON_ID = 'person-1';
const NEW_PLAN_ID = 'plan-new';

const SNAPSHOT = {
  targets: { nds_score_100_target: null },
} as unknown as PlanInputSnapshot;

function aiPlan(overrides: Partial<AiPlanGenerationResponse> = {}): AiPlanGenerationResponse {
  return {
    title: 'Week of Jul 12, 2026',
    plan_shape: 'week',
    rationale_md: 'test',
    plan_days: [
      {
        date_local: '2026-07-12',
        projected_daily_nds: {
          projected_nds_100: 50,
          projected_wfr_10: 5,
          projected_ps_10: 5,
          projected_pnd_10: 5,
          projected_fp_10: 5,
          projected_as_10: 5,
          projected_mnc_10: 5,
          projected_ob_10: 5,
          projection_confidence: 'low',
        },
        notes: null,
        slots: [
          {
            slot_block: 'morning',
            slot_ordinal: 0,
            slot_label: 'Breakfast',
            target_time: '11:00',
            planned_meals: [
              {
                name: 'Oats',
                meal_type: 'breakfast',
                payload: { totals: { calories: 400 } },
                protein_score_10: 5,
                is_main_meal: true,
                psq_multiplier: 1,
                meal_derived_data: {},
                nds_confidence: 'low',
                source_imported_meal_id: null,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  } as AiPlanGenerationResponse;
}

function planRow(status: 'draft' | 'active' | 'archived', id = NEW_PLAN_ID) {
  return {
    id,
    person_id: PERSON_ID,
    title: 'Week of Jul 12, 2026',
    plan_shape: 'week',
    source: 'ai_generated',
    status,
    start_date: '2026-07-12',
    end_date: '2026-07-18',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: SNAPSHOT,
    nds_version: 'nds.v1',
    classifier_version: 'classifier.v1',
    created_at: '2026-07-31T12:00:00.000Z',
    updated_at: '2026-07-31T12:00:00.000Z',
  };
}

function dayRow() {
  return {
    id: 'day-1',
    plan_id: NEW_PLAN_ID,
    person_id: PERSON_ID,
    date_local: '2026-07-12',
    projected_nds_100: 50,
    projected_wfr_10: 5,
    projected_ps_10: 5,
    projected_pnd_10: 5,
    projected_fp_10: 5,
    projected_as_10: 5,
    projected_mnc_10: 5,
    projected_ob_10: 5,
    projection_confidence: 'low',
    projection_debug_json: null,
    notes: null,
    nds_version: 'nds.v1',
    classifier_version: 'classifier.v1',
    created_at: '',
    updated_at: '',
  };
}

function slotRow() {
  return {
    id: 'slot-1',
    plan_day_id: 'day-1',
    person_id: PERSON_ID,
    slot_block: 'morning',
    slot_ordinal: 0,
    slot_label: 'Breakfast',
    target_time: '11:00',
    created_at: '',
    updated_at: '',
  };
}

function mealRow() {
  return {
    id: 'meal-1',
    plan_id: NEW_PLAN_ID,
    plan_day_id: 'day-1',
    plan_slot_id: 'slot-1',
    person_id: PERSON_ID,
    name: 'Oats',
    meal_type: 'breakfast',
    payload: { totals: { calories: 400 } },
    protein_score_10: 5,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {},
    nds_confidence: 'low',
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    nds_version: 'nds.v1',
    classifier_version: 'classifier.v1',
    execution_state: 'pending',
    journal_entry_id: null,
    created_at: '',
    updated_at: '',
  };
}

type FailMode = null | 'day' | 'slot' | 'meal' | 'activate';

function installPersistMocks(opts: { fail?: FailMode } = {}) {
  const fail = opts.fail ?? null;
  const deletedPlanIds: string[] = [];
  let draftInserted = false;

  mockRpc.mockImplementation(async (name: string) => {
    if (name !== 'activate_generated_plan') {
      throw new Error(`Unexpected rpc ${name}`);
    }
    if (fail === 'activate') {
      return { data: null, error: { message: 'activation boom' } };
    }
    return {
      data: { plan_id: NEW_PLAN_ID, archived_count: 1 },
      error: null,
    };
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'plans') {
      return {
        insert: jest.fn((row: Record<string, unknown>) => {
          draftInserted = true;
          expect(row.status).toBe('draft');
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: planRow('draft'),
                error: null,
              }),
            }),
          };
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: planRow('active'),
                error: null,
              }),
            }),
          }),
        }),
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation((col: string, value: string) => {
            if (col === 'id') deletedPlanIds.push(value);
            return {
              eq: jest.fn().mockResolvedValue({ error: null }),
            };
          }),
        }),
      };
    }

    if (table === 'plan_days') {
      return {
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(
              fail === 'day'
                ? { data: null, error: { message: 'day boom' } }
                : { data: dayRow(), error: null },
            ),
          }),
        }),
      };
    }

    if (table === 'plan_slots') {
      return {
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(
              fail === 'slot'
                ? { data: null, error: { message: 'slot boom' } }
                : { data: slotRow(), error: null },
            ),
          }),
        }),
      };
    }

    if (table === 'planned_meals') {
      return {
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(
              fail === 'meal'
                ? { data: null, error: { message: 'meal boom' } }
                : { data: mealRow(), error: null },
            ),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    deletedPlanIds,
    wasDraftInserted: () => draftInserted,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('activateGeneratedPlan', () => {
  test('calls activate_generated_plan RPC and returns the active plan', async () => {
    mockRpc.mockResolvedValue({
      data: { plan_id: NEW_PLAN_ID, archived_count: 1 },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'plans') throw new Error(`Unexpected table ${table}`);
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: planRow('active'),
                error: null,
              }),
            }),
          }),
        }),
      };
    });

    const plan = await activateGeneratedPlan(PERSON_ID, NEW_PLAN_ID);
    expect(mockRpc).toHaveBeenCalledWith('activate_generated_plan', {
      p_person_id: PERSON_ID,
      p_plan_id: NEW_PLAN_ID,
    });
    expect(plan.status).toBe('active');
    expect(plan.id).toBe(NEW_PLAN_ID);
  });

  test('surfaces activation failure without leaving the caller assuming success', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'activation boom' },
    });
    await expect(activateGeneratedPlan(PERSON_ID, NEW_PLAN_ID)).rejects.toThrow(
      /Failed to activate generated plan/,
    );
  });

  test('falls back to compensating activation when the RPC is not installed', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.activate_generated_plan',
      },
    });

    const archivedIds: string[] = [];
    const activatedIds: string[] = [];

    const thenable = (result: { data: unknown; error: null }) => {
      const chain: Record<string, jest.Mock | ((...args: unknown[]) => unknown)> = {};
      const pass = jest.fn(() => chain);
      for (const method of [
        'select',
        'insert',
        'update',
        'delete',
        'eq',
        'in',
        'order',
        'neq',
      ]) {
        chain[method] = pass;
      }
      chain.single = jest.fn(async () => result);
      chain.maybeSingle = jest.fn(async () => result);
      chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected);
      return chain;
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'plans') {
        return {
          select: jest.fn(() => {
            const listed = thenable({
              data: [planRow('active', 'plan-prior'), planRow('draft', NEW_PLAN_ID)],
              error: null,
            });
            // Prefer getPlan/list branching via maybeSingle vs order resolution.
            listed.maybeSingle = jest.fn(async () => ({
              data: planRow('draft', NEW_PLAN_ID),
              error: null,
            }));
            return listed;
          }),
          update: jest.fn((patch: { status?: string }) => ({
            eq: jest.fn().mockImplementation((col: string, value: string) => {
              const planId = col === 'id' ? value : null;
              return {
                eq: jest.fn().mockReturnValue({
                  select: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn(async () => {
                      const id = planId ?? value;
                      if (patch.status === 'archived') {
                        archivedIds.push(id);
                        return { data: planRow('archived', id), error: null };
                      }
                      activatedIds.push(id);
                      return { data: planRow('active', id), error: null };
                    }),
                  }),
                }),
              };
            }),
          })),
        };
      }
      if (table === 'plan_days') {
        return thenable({ data: [dayRow()], error: null });
      }
      if (table === 'planned_meals') {
        return thenable({ data: [], error: null });
      }
      if (table === 'plan_slots') {
        return thenable({ data: [], error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const plan = await activateGeneratedPlan(PERSON_ID, NEW_PLAN_ID);
    expect(plan.status).toBe('active');
    expect(archivedIds).toContain('plan-prior');
    expect(activatedIds).toContain(NEW_PLAN_ID);
  });
});

describe('persistAiPlan lifecycle handoff', () => {
  test('first successful generation inserts draft, persists children, then activates', async () => {
    const harness = installPersistMocks();
    const detail = await persistAiPlan({
      personId: PERSON_ID,
      ai: aiPlan(),
      input_snapshot: SNAPSHOT,
      start_date: '2026-07-12',
      end_date: '2026-07-18',
    });

    expect(harness.wasDraftInserted()).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('activate_generated_plan', {
      p_person_id: PERSON_ID,
      p_plan_id: NEW_PLAN_ID,
    });
    expect(detail.plan.status).toBe('active');
    expect(detail.days).toHaveLength(1);
    expect(detail.slots).toHaveLength(1);
    expect(detail.meals).toHaveLength(1);
    expect(harness.deletedPlanIds).toEqual([]);
  });

  test('second successful generation still activates via RPC (archives prior actives atomically)', async () => {
    installPersistMocks();
    await persistAiPlan({
      personId: PERSON_ID,
      ai: aiPlan(),
      input_snapshot: SNAPSHOT,
      start_date: '2026-07-12',
      end_date: '2026-07-18',
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'activate_generated_plan',
      expect.objectContaining({ p_plan_id: NEW_PLAN_ID }),
    );
  });

  test('child-persistence failure discards the incomplete draft and does not activate', async () => {
    const harness = installPersistMocks({ fail: 'slot' });
    await expect(
      persistAiPlan({
        personId: PERSON_ID,
        ai: aiPlan(),
        input_snapshot: SNAPSHOT,
        start_date: '2026-07-12',
        end_date: '2026-07-18',
      }),
    ).rejects.toThrow(/Failed to insert plan_slot/);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(harness.deletedPlanIds).toEqual([NEW_PLAN_ID]);
  });

  test('activation failure discards the incomplete output and does not leave a current partial plan', async () => {
    const harness = installPersistMocks({ fail: 'activate' });
    await expect(
      persistAiPlan({
        personId: PERSON_ID,
        ai: aiPlan(),
        input_snapshot: SNAPSHOT,
        start_date: '2026-07-12',
        end_date: '2026-07-18',
      }),
    ).rejects.toThrow(/Failed to activate generated plan/);

    expect(harness.deletedPlanIds).toEqual([NEW_PLAN_ID]);
  });
});
