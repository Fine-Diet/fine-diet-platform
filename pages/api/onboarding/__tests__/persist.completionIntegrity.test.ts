/**
 * Package 2 review: complete mode must fail closed before any people write.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { INITIAL_ANSWERS, type OnboardingAnswers } from '@/lib/onboarding/defaultOnboardingFlow';

const COMPLETE_REQUIRED_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  date_of_birth: '1990-05-12',
  height_value: '180',
  height_unit: 'cm',
  weight_value: '82',
  weight_unit: 'kg',
  sex: 'male',
  primary_goal: 'protein_intake',
  rhythm_template: 'three_meals_two_minis',
  first_meal_window: '7_9',
  second_meal_window: '1_3',
  last_meal_window: '7_9',
  last_bite_window: 'before_9',
  dining_out_frequency: 'rarely',
  food_restrictions: ['none'],
  grocery_cadence: 'weekly',
  household_size: '2',
};

const updateCalls: Array<{ payload: Record<string, unknown> }> = [];
let currentMetadata: Record<string, unknown> = {
  meal_schedule: { slots: { breakfast: { enabled: true } }, updated_at: '2020-01-01T00:00:00.000Z' },
  onboarding: { answers: { sex: 'female' } },
  primary_goal: 'existing_goal',
};

jest.mock('@/lib/supabaseServerClient', () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: { metadata: currentMetadata }, error: null }),
    update: (payload: Record<string, unknown>) => {
      updateCalls.push({ payload });
      return {
        eq: async () => ({ error: null }),
      };
    },
  };
  return {
    supabaseAdmin: {
      from: () => chain,
    },
  };
});

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: jest.fn(async () => ({
    user: { id: 'user-1' },
    personId: 'person-1',
    callerPersonId: 'person-1',
  })),
  requireCallerJournalAccess: jest.fn(async () => true),
}));

function makeReq(body: unknown): NextApiRequest {
  return {
    method: 'POST',
    body,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
}

function makeRes(): NextApiResponse & { statusCode: number; body: unknown } {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader: () => res,
    end: () => res,
  };
  return res;
}

describe('POST /api/onboarding/persist completion integrity', () => {
  beforeEach(() => {
    updateCalls.length = 0;
    currentMetadata = {
      meal_schedule: { slots: { breakfast: { enabled: true } }, updated_at: '2020-01-01T00:00:00.000Z' },
      onboarding: { answers: { sex: 'female' } },
      primary_goal: 'existing_goal',
    };
    jest.resetModules();
  });

  it('rejects complete with absent answers and performs no update', async () => {
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();
    await handler(makeReq({ mode: 'complete' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBe('invalid_onboarding_answers');
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects complete with partial answers and performs no update', async () => {
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();
    await handler(
      makeReq({
        mode: 'complete',
        answers: { ...INITIAL_ANSWERS, sex: 'male', primary_goal: 'lose_weight' },
      }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toBe('incomplete_required_onboarding_answers');
    expect((res.body as any).missingRequiredKeys.length).toBeGreaterThan(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('accepts complete with all required answers', async () => {
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();
    await handler(
      makeReq({ mode: 'complete', answers: COMPLETE_REQUIRED_ANSWERS }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const meta = updateCalls[0].payload.metadata as Record<string, unknown>;
    expect(meta.onboarding_completed_at).toBeTruthy();
  });

  it('skip never writes completion', async () => {
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();
    await handler(makeReq({ mode: 'skip', answers: INITIAL_ANSWERS }), res);
    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const meta = updateCalls[0].payload.metadata as Record<string, unknown>;
    expect(meta.onboarding_skipped_at).toBeTruthy();
    expect(meta.onboarding_completed_at).toBeUndefined();
  });

  it('progress does not overwrite meal_schedule or canonical profile fields', async () => {
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();
    await handler(
      makeReq({ mode: 'progress', answers: INITIAL_ANSWERS, lastStep: 1 }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const meta = updateCalls[0].payload.metadata as Record<string, unknown>;
    // Existing durable fields must be preserved (merge), not replaced by INITIAL_ANSWERS.
    expect(meta.meal_schedule).toEqual(currentMetadata.meal_schedule);
    expect(meta.primary_goal).toBe('existing_goal');
    expect(meta.onboarding_completed_at).toBeUndefined();
    expect(meta.onboarding_last_step).toBe(1);
    expect(meta.onboarding).toBeTruthy();
  });
});
