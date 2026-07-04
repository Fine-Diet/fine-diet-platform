/**
 * Tests that the submit endpoint refuses to persist preview-flagged
 * submissions. The runner already skips the submit call in preview mode, but
 * the server guard ensures a stale/hand-crafted preview payload can never
 * create a real submission, session-completion, or webhook.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const fromCalls: Array<{ table: string; method: string }> = [];

jest.mock('@/lib/supabaseServerClient', () => {
  const query: any = Promise.resolve({ data: null, error: null });
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    upsert: () => chain,
    update: () => chain,
    maybeSingle: () => chain,
    single: () => chain,
  };
  // Make the chain thenable so any `.then` usage resolves.
  (chain as any).then = (resolve: any) => resolve({ data: null, error: null });
  (chain as any).catch = () => chain;
  const supabaseAdmin = {
    from(table: string) {
      // Record the table access; the guard should make this never happen.
      fromCalls.push({ table, method: 'from' });
      return chain;
    },
  };
  return { supabaseAdmin };
});

jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromApi: jest.fn().mockResolvedValue({ id: 'user-1', role: 'user' }),
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

describe('POST /api/assessments/submit preview guard', () => {
  beforeEach(() => {
    fromCalls.length = 0;
    jest.resetModules();
  });

  it('returns success and performs no DB writes when isPreview is true', async () => {
    const { default: handler } = await import('@/pages/api/assessments/submit');
    const req = makeReq({
      submissionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      assessmentType: 'gut-check',
      assessmentVersion: 3,
      sessionId: 'fd-preview-session-xyz',
      answers: [{ questionId: 'q1', optionId: 'o1' }],
      primaryAvatar: 'balanced',
      isPreview: true,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    expect((res.body as any).submissionId).toBe(
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    );
    // No supabase table should have been touched.
    expect(fromCalls.length).toBe(0);
  });
});
