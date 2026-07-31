process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/meals/mealDocumentServerService', () => ({
  getMealDocumentForPerson: jest.fn(),
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  activatePlanForPerson,
  archivePlanForPerson,
} from '../planServerService';

const mockFrom = supabaseAdmin.from as jest.Mock;
const mockRpc = supabaseAdmin.rpc as jest.Mock;

const PERSON_ID = 'person-1';
const PLAN_ID = 'plan-1';

function planRow(status: 'draft' | 'active' | 'archived', id = PLAN_ID) {
  return {
    id,
    person_id: PERSON_ID,
    title: 'Week plan',
    plan_shape: 'week',
    source: 'ai_generated',
    status,
    start_date: '2026-07-12',
    end_date: '2026-07-18',
    program_slug: null,
    program_run_id: null,
    input_snapshot_json: {},
    nds_version: 'nds.v1',
    classifier_version: 'classifier.v1',
    created_at: '2026-07-31T12:00:00.000Z',
    updated_at: '2026-07-31T12:00:00.000Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('archivePlanForPerson', () => {
  it('archives the current plan intentionally and reports was_current', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'plans') throw new Error(`Unexpected table ${table}`);
      return {
        select: jest.fn(() => {
          const chain: Record<string, unknown> = {};
          const pass = jest.fn(() => chain);
          for (const method of ['eq', 'order', 'neq']) chain[method] = pass;
          chain.maybeSingle = jest.fn(async () => ({
            data: planRow('active'),
            error: null,
          }));
          chain.then = (
            onFulfilled: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: [planRow('active')],
              error: null,
            }).then(onFulfilled, onRejected);
          return chain;
        }),
        update: jest.fn(() => ({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                maybeSingle: jest.fn(async () => ({
                  data: planRow('archived'),
                  error: null,
                })),
              }),
            }),
          }),
        })),
      };
    });

    const result = await archivePlanForPerson(PERSON_ID, PLAN_ID);
    expect(result.was_current).toBe(true);
    expect(result.plan.status).toBe('archived');
  });
});

describe('activatePlanForPerson', () => {
  it('routes through activate_generated_plan RPC rather than bare status update', async () => {
    mockRpc.mockResolvedValue({
      data: { plan_id: PLAN_ID, archived_count: 0 },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'plans') throw new Error(`Unexpected table ${table}`);
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn(async () => ({
                data: planRow('active'),
                error: null,
              })),
            }),
          }),
        }),
      };
    });

    const plan = await activatePlanForPerson(PERSON_ID, PLAN_ID);
    expect(mockRpc).toHaveBeenCalledWith('activate_generated_plan', {
      p_person_id: PERSON_ID,
      p_plan_id: PLAN_ID,
    });
    expect(plan.status).toBe('active');
  });
});
