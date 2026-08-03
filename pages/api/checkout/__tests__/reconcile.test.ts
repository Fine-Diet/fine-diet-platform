/**
 * Checkout reconcile API — Package 2 bounded entitlement reconciliation.
 *
 * No live Stripe / Supabase. Verifies auth, session_id validation, pending/ready/
 * failed/error contracts, returnTo preservation, and that secrets never appear
 * in responses.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const AUTH_USER_ID = 'auth-user-1';
const PERSON_ID = 'person-1';

const mockGetUser = jest.fn();
jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromApi: (...args: unknown[]) => mockGetUser(...args),
}));

const mockRetrieve = jest.fn();
jest.mock('@/lib/stripe/stripeServer', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: (...args: unknown[]) => mockRetrieve(...args),
      },
    },
  },
  absoluteUrl: (path: string) => `https://app.example.test${path}`,
}));

const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockResolveJournalGrant = jest.fn();
jest.mock('@/lib/access/effectiveAccess', () => ({
  resolveJournalGrant: (...args: unknown[]) => mockResolveJournalGrant(...args),
}));

import handler from '@/pages/api/checkout/reconcile';

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
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(query: Record<string, string | string[] | undefined> = {}): NextApiRequest {
  return {
    method: 'GET',
    query,
    headers: {},
  } as NextApiRequest;
}

function peopleChain(person: { id: string; metadata: Record<string, unknown> } | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: person, error: null }),
  };
}

function assertNoSecrets(body: unknown) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/sk_live|sk_test|whsec_|SERVICE_ROLE|eyJhbGciOi/);
  expect(serialized).not.toContain(process.env.STRIPE_SECRET_KEY || 'STRIPE_SECRET_NEVER');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: AUTH_USER_ID, email: 'a@b.com', role: 'user' });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'people') {
      return peopleChain({ id: PERSON_ID, metadata: {} });
    }
    throw new Error(`unexpected table ${table}`);
  });
  mockResolveJournalGrant.mockResolvedValue({
    allowed: false,
    grantSource: 'none',
    reason: 'no_active_grant',
  });
  mockRetrieve.mockResolvedValue({
    id: 'cs_test_abc',
    status: 'complete',
    payment_status: 'paid',
    metadata: { person_id: PERSON_ID },
  });
});

describe('GET /api/checkout/reconcile', () => {
  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue(null);
    const res = createMockRes();
    await handler(createReq({ session_id: 'cs_test_abc' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid session_id', async () => {
    for (const session_id of [undefined, '', 'sess_not_checkout', 'CS_uppercase']) {
      const res = createMockRes();
      await handler(createReq({ session_id }), res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ error: 'invalid_session', status: 'error' });
    }
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('reports pending when entitlement is not yet visible', async () => {
    mockResolveJournalGrant.mockResolvedValue({
      allowed: false,
      grantSource: 'none',
      reason: 'no_active_grant',
    });
    const res = createMockRes();
    await handler(
      createReq({ session_id: 'cs_test_abc', returnTo: '/app/log' }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'pending',
      reason: 'entitlement_not_visible',
      returnTo: '/app/log',
      maxAttemptsHint: 8,
    });
    assertNoSecrets(res.body);
  });

  it('returns ready with nextPath once journal grant is visible', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return peopleChain({
          id: PERSON_ID,
          metadata: { onboarding_completed_at: '2026-07-01T00:00:00Z' },
        });
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockResolveJournalGrant.mockResolvedValue({
      allowed: true,
      grantSource: 'entitlement',
      reason: 'entitlement_active',
      entitlementKey: 'journal',
    });

    const res = createMockRes();
    await handler(
      createReq({ session_id: 'cs_test_abc', returnTo: '/app/plans' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ready',
      grantSource: 'entitlement',
      nextPath: '/app/plans',
      returnTo: '/app/plans',
    });
    assertNoSecrets(res.body);
  });

  it('routes incomplete onboarding through onboarding while preserving returnTo', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return peopleChain({ id: PERSON_ID, metadata: {} });
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockResolveJournalGrant.mockResolvedValue({
      allowed: true,
      grantSource: 'entitlement',
      reason: 'entitlement_active',
      entitlementKey: 'journal',
    });

    const res = createMockRes();
    await handler(
      createReq({ session_id: 'cs_test_abc', returnTo: '/app/log' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ready',
      returnTo: '/app/log',
    });
    expect((res.body as { nextPath: string }).nextPath).toContain('/app/onboarding');
    expect((res.body as { nextPath: string }).nextPath).toContain(
      encodeURIComponent('/app/log'),
    );
  });

  it('rejects unsafe returnTo and falls back to app home', async () => {
    mockResolveJournalGrant.mockResolvedValue({
      allowed: true,
      grantSource: 'legacy_subscription_compat',
      reason: 'legacy_subscription_compat',
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return peopleChain({
          id: PERSON_ID,
          metadata: { onboarding_skipped_at: '2026-07-01T00:00:00Z' },
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = createMockRes();
    await handler(
      createReq({
        session_id: 'cs_test_abc',
        returnTo: 'https://evil.example/phish',
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ready',
      returnTo: '/app',
      nextPath: '/app',
    });
  });

  it('reports failed for expired checkout sessions', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'cs_test_abc',
      status: 'expired',
      payment_status: 'unpaid',
      metadata: { person_id: PERSON_ID },
    });
    const res = createMockRes();
    await handler(createReq({ session_id: 'cs_test_abc' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'failed',
      reason: 'session_expired',
    });
  });

  it('returns error contract when Stripe retrieve fails (no secrets leaked)', async () => {
    mockRetrieve.mockRejectedValue(new Error('stripe_down'));
    const res = createMockRes();
    await handler(
      createReq({ session_id: 'cs_test_abc', returnTo: '/app' }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'reconcile_failed',
      returnTo: '/app',
    });
    assertNoSecrets(res.body);
  });

  it('returns 403 when session person_id does not match caller', async () => {
    mockRetrieve.mockResolvedValue({
      id: 'cs_test_abc',
      status: 'complete',
      payment_status: 'paid',
      metadata: { person_id: 'someone-else' },
    });
    const res = createMockRes();
    await handler(createReq({ session_id: 'cs_test_abc', returnTo: '/app' }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      status: 'error',
      reason: 'session_person_mismatch',
      returnTo: '/app',
    });
  });
});
