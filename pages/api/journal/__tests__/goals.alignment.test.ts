/**
 * PATCH /api/journal/goals — merged calorie↔macro alignment.
 * Auth is mocked; updateUserGoals is the real persistence function against
 * an in-memory fake so the handler cannot bypass integrity.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createFakeSupabase, type Row } from '@/lib/plans/__tests__/testSupabaseFake';

const CALLER_PERSON = 'person-caller';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  resolveJournalTargetPerson: jest.fn(),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import handler from '@/pages/api/journal/goals';

interface MockResponse {
  statusCode: number;
  body: unknown;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      return res as NextApiResponse;
    },
    setHeader() {
      return res as NextApiResponse;
    },
    end() {
      return res as NextApiResponse;
    },
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(method: string, body?: unknown): NextApiRequest {
  return { method, query: {}, body, headers: {} } as NextApiRequest;
}

function installFake(initial: Record<string, Row[]> = {}) {
  const fake = createFakeSupabase(initial);
  (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue({
    user: { id: 'user-1', email: 'a@b.com', role: 'user' },
    personId: CALLER_PERSON,
  });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
});

describe('PATCH /api/journal/goals alignment', () => {
  it('rejects a calorie-only patch that would mismatch stored macros', async () => {
    installFake({
      people: [
        {
          id: CALLER_PERSON,
          metadata: {
            dailyCalorieGoal: 2500,
            macroGoals: { protein_g: 205, carbs_g: 263, fat_g: 70 },
          },
        },
      ],
    });

    const res = createMockRes();
    await handler(createReq('PATCH', { dailyCalorieGoal: 2200 }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({ error: 'calorie_macro_mismatch' }),
    );
  });

  it('accepts an aligned calorie + macro write', async () => {
    installFake({
      people: [
        {
          id: CALLER_PERSON,
          metadata: { dailyCalorieGoal: 2200 },
        },
      ],
    });

    const res = createMockRes();
    await handler(
      createReq('PATCH', {
        dailyCalorieGoal: 2500,
        macroGoals: { protein_g: 205, carbs_g: 263, fat_g: 70 },
      }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { goals: { dailyCalorieGoal: number } }).goals.dailyCalorieGoal).toBe(2500);
  });

  it('accepts an explicit macro clear without rebalancing', async () => {
    installFake({
      people: [
        {
          id: CALLER_PERSON,
          metadata: {
            dailyCalorieGoal: 2500,
            macroGoals: { protein_g: 150, carbs_g: 250, fat_g: 80 },
          },
        },
      ],
    });

    const res = createMockRes();
    await handler(createReq('PATCH', { macroGoals: null }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { goals: { macroGoalsSet: boolean } }).goals.macroGoalsSet).toBe(false);
  });
});
