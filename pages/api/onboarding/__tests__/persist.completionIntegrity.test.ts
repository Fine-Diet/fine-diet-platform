/**
 * Package 2 review: complete mode must fail closed before any people write.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { INITIAL_ANSWERS, type OnboardingAnswers } from '@/lib/onboarding/defaultOnboardingFlow';

const COMPLETE_REQUIRED_ANSWERS: OnboardingAnswers = {
  ...INITIAL_ANSWERS,
  date_of_birth: '1990-05-12',
  height_value: '70',
  height_unit: 'in',
  weight_value: '185',
  weight_unit: 'lb',
  sex: 'male',
  rhythm_template: 'three_meals_two_minis',
};

const updateCalls: Array<{ payload: Record<string, unknown> }> = [];
const updateFilters: Array<{ column: string; value: unknown }> = [];
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
      const filters: Array<{ column: string; value: unknown; operator: 'is' | 'eq' }> = [];
      const matches = () => filters.every(({ column, value, operator }) => {
        const key = column.replace('metadata->>', '');
        const actual = currentMetadata[key] ?? null;
        return operator === 'is' ? actual === value : String(actual) === String(value);
      });
      const apply = () => {
        if (!matches()) return false;
        currentMetadata = (payload.metadata ?? {}) as Record<string, unknown>;
        return true;
      };
      const updateQuery: any = {
        is: (column: string, value: unknown) => {
          updateFilters.push({ column, value });
          filters.push({ column, value, operator: 'is' });
          return updateQuery;
        },
        not: (column: string, operator: 'is', value: unknown) => {
          updateFilters.push({ column: `${column}!${operator}`, value });
          filters.push({ column, value, operator: 'eq' });
          return updateQuery;
        },
        eq: (column: string, value: unknown) => {
          if (column.startsWith('metadata->>')) {
            updateFilters.push({ column, value });
            filters.push({ column, value, operator: 'eq' });
          }
          return updateQuery;
        },
        select: () => updateQuery,
        maybeSingle: async () => ({ data: apply() ? { id: 'person-1' } : null, error: null }),
        then: (resolve: (value: { error: null }) => unknown) =>
          Promise.resolve({ error: null }).then(() => {
            apply();
            return resolve({ error: null });
          }),
      };
      return updateQuery;
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

function makeGetReq(): NextApiRequest {
  return { method: 'GET', headers: {}, cookies: {} } as unknown as NextApiRequest;
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
    updateFilters.length = 0;
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
    expect(updateFilters).toEqual([
      { column: 'metadata->>onboarding_completed_at', value: null },
      { column: 'metadata->>onboarding_skipped_at', value: null },
    ]);
  });

  it('ignores a progress request when onboarding is already finalized', async () => {
    currentMetadata = { onboarding_skipped_at: '2026-11-04T12:00:00.000Z' };
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();

    await handler(makeReq({ mode: 'progress', answers: INITIAL_ANSWERS, lastStep: 1 }), res);

    expect(res.statusCode).toBe(200);
    expect(updateCalls).toHaveLength(0);
  });

  it('supports skip → authenticated resume → progress → profile reload', async () => {
    const { default: persistHandler } = await import('@/pages/api/onboarding/persist');
    const { default: profileHandler } = await import('@/pages/api/journal/profile');
    const skipAnswers = { ...INITIAL_ANSWERS, disliked_foods: 'mushrooms' };

    await persistHandler(makeReq({ mode: 'skip', answers: skipAnswers }), makeRes());
    expect(currentMetadata.onboarding_skipped_at).toBeTruthy();

    const resumeRes = makeRes();
    await persistHandler(makeReq({ mode: 'resume' }), resumeRes);
    const resumeToken = (resumeRes.body as { resumeToken: string }).resumeToken;
    expect(resumeRes.statusCode).toBe(200);
    expect(resumeToken).toBeTruthy();

    const resumedAnswers = { ...skipAnswers, disliked_foods: 'mushrooms and olives' };
    const progressRes = makeRes();
    await persistHandler(
      makeReq({ mode: 'progress', answers: resumedAnswers, lastStep: 1, resumeToken }),
      progressRes,
    );
    expect(progressRes.statusCode).toBe(200);
    expect((currentMetadata.onboarding as { answers: OnboardingAnswers }).answers.disliked_foods)
      .toBe('mushrooms and olives');
    expect(updateFilters).toContainEqual({
      column: 'metadata->>onboarding_resume_token',
      value: resumeToken,
    });

    const profileRes = makeRes();
    await profileHandler(makeGetReq(), profileRes);
    const profile = (profileRes.body as { profile: Record<string, any> }).profile;
    expect(profile.onboarding.answers.disliked_foods).toBe('mushrooms and olives');
    expect(profile.onboarding_resume_token).toBeUndefined();
  });

  it('rejects a stale pre-skip progress write after skip', async () => {
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const savedAnswers = { ...INITIAL_ANSWERS, disliked_foods: 'saved answer' };
    await handler(makeReq({ mode: 'skip', answers: savedAnswers }), makeRes());
    const writesAfterSkip = updateCalls.length;

    await handler(
      makeReq({
        mode: 'progress',
        answers: { ...INITIAL_ANSWERS, disliked_foods: 'stale answer' },
        lastStep: 0,
      }),
      makeRes(),
    );

    expect(updateCalls).toHaveLength(writesAfterSkip);
    expect(currentMetadata.onboarding_skipped_at).toBeTruthy();
    expect((currentMetadata.onboarding as { answers: OnboardingAnswers }).answers.disliked_foods)
      .toBe('saved answer');
  });

  it('does not let progress overwrite completed onboarding', async () => {
    currentMetadata = {
      onboarding_completed_at: '2026-11-04T12:00:00.000Z',
      onboarding: { answers: { disliked_foods: 'completed answer' } },
    };
    const { default: handler } = await import('@/pages/api/onboarding/persist');

    await handler(
      makeReq({
        mode: 'progress',
        answers: { ...INITIAL_ANSWERS, disliked_foods: 'stale answer' },
        lastStep: 0,
      }),
      makeRes(),
    );

    expect(updateCalls).toHaveLength(0);
    expect((currentMetadata.onboarding as { answers: { disliked_foods: string } }).answers.disliked_foods)
      .toBe('completed answer');
  });

  it('does not issue a resume token unless the persisted state is skipped', async () => {
    currentMetadata = { onboarding_started_at: '2026-11-04T12:00:00.000Z' };
    const { default: handler } = await import('@/pages/api/onboarding/persist');
    const res = makeRes();

    await handler(makeReq({ mode: 'resume' }), res);

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toBe('onboarding_not_resumable');
    expect(updateCalls).toHaveLength(0);
  });
});
