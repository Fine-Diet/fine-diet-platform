/**
 * Checkout create API — focused Package 2 contract coverage.
 *
 * No live Stripe. Confirms auth, offer validation, return path wiring into
 * /checkout/success, and that Stripe secrets never leak in the JSON body.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const AUTH_USER_ID = 'auth-user-1';
const PERSON_ID = 'person-1';

const mockGetUser = jest.fn();
jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromApi: (...args: unknown[]) => mockGetUser(...args),
}));

const mockCreateSession = jest.fn();
jest.mock('@/lib/stripe/stripeServer', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockCreateSession(...args),
      },
    },
  },
  absoluteUrl: (path: string) => `https://app.example.test${path}`,
}));

jest.mock('@/lib/stripe/stripeCustomerService', () => ({
  ensureStripeCustomerForPerson: jest.fn(async () => 'cus_test_1'),
}));

jest.mock('@/lib/tracking/sessionId', () => ({
  getOrCreateSessionId: jest.fn(() => 'fd_sid_test'),
}));

jest.mock('@/lib/access/priceOptionBillingService', () => ({
  resolvePriceOptionBilling: jest.fn(),
}));

const mockPersonHasKeys = jest.fn();
jest.mock('@/lib/access/effectiveAccess', () => ({
  personHasEffectiveEntitlementKeys: (...args: unknown[]) => mockPersonHasKeys(...args),
}));

jest.mock('@/lib/access/offerEntitlementMappings', () => ({
  resolveEffectiveOfferEntitlementMappings: jest.fn(
    (_offerKey: string, mappings: Array<{ entitlement_key: string }> | null) =>
      (mappings || []).map((m) => ({
        entitlement_key: m.entitlement_key,
        duration_days: null,
      })),
  ),
}));

type ChainResult = { data: unknown; error: unknown };

function makeChain(result: ChainResult, terminal: 'maybeSingle' | 'thenable' = 'maybeSingle') {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'select',
    'eq',
    'insert',
    'upsert',
    'update',
    'in',
    'order',
    'limit',
  ];
  for (const m of methods) {
    chain[m] = jest.fn(() => chain);
  }
  if (terminal === 'maybeSingle') {
    chain.maybeSingle = jest.fn(async () => result);
    chain.single = jest.fn(async () => result);
  } else {
    // insert().then(...) style
    (chain as any).then = (resolve: (v: ChainResult) => unknown) =>
      Promise.resolve(result).then(resolve);
  }
  return chain;
}

const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import handler from '@/pages/api/checkout/create';

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
    setHeader: jest.fn(),
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(body: Record<string, unknown> = {}): NextApiRequest {
  return {
    method: 'POST',
    body,
    query: {},
    headers: { referer: 'https://app.example.test/start', 'user-agent': 'jest' },
  } as NextApiRequest;
}

function assertNoSecrets(body: unknown) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/sk_live|sk_test|whsec_|SERVICE_ROLE|eyJhbGciOi/);
  expect(serialized).not.toContain('cus_secret');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: AUTH_USER_ID, email: 'a@b.com', role: 'user' });
  mockPersonHasKeys.mockResolvedValue({ covered: false, grantSource: 'none' });
  mockCreateSession.mockResolvedValue({
    id: 'cs_test_created',
    url: 'https://checkout.stripe.com/c/pay/cs_test_created',
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'people') {
      return makeChain({
        data: { id: PERSON_ID, email: 'a@b.com' },
        error: null,
      });
    }
    if (table === 'offers') {
      return makeChain({
        data: {
          offer_key: 'journal-annual',
          name: 'Journal Annual',
          is_active: true,
          billing_model: 'subscription',
          stripe_price_id: 'price_test_1',
          stripe_phase_price_ids: null,
          stripe_phase_iterations: null,
          success_path: '/app/log',
          cancel_path: '/start',
          trial_period_days: 14,
        },
        error: null,
      });
    }
    if (table === 'offer_entitlements') {
      const chain = makeChain({ data: [], error: null }, 'thenable');
      // select().eq().eq() resolves as thenable array query
      chain.eq = jest.fn(() => chain);
      (chain as any).then = (resolve: (v: ChainResult) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    }
    if (table === 'checkout_events' || table === 'stripe_offer_instances') {
      return makeChain({ data: null, error: null }, 'thenable');
    }
    throw new Error(`unexpected table ${table}`);
  });
});

describe('POST /api/checkout/create', () => {
  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue(null);
    const res = createMockRes();
    await handler(createReq({ offer_key: 'journal-annual' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('requires offer_key', async () => {
    const res = createMockRes();
    await handler(createReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'offer_key is required' });
  });

  it('returns 409 when caller is already entitled', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return makeChain({ data: { id: PERSON_ID, email: 'a@b.com' }, error: null });
      }
      if (table === 'offers') {
        return makeChain({
          data: {
            offer_key: 'journal-annual',
            name: 'Journal Annual',
            is_active: true,
            billing_model: 'subscription',
            stripe_price_id: 'price_test_1',
            stripe_phase_price_ids: null,
            stripe_phase_iterations: null,
            success_path: '/app',
            cancel_path: '/start',
            trial_period_days: 14,
          },
          error: null,
        });
      }
      if (table === 'offer_entitlements') {
        const chain = makeChain({ data: null, error: null }, 'thenable');
        chain.eq = jest.fn(() => chain);
        (chain as any).then = (resolve: (v: ChainResult) => unknown) =>
          Promise.resolve({
            data: [{ entitlement_key: 'journal', duration_days: null, is_active: true }],
            error: null,
          }).then(resolve);
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    });
    mockPersonHasKeys.mockResolvedValue({
      covered: true,
      grantSource: 'entitlement',
    });

    const res = createMockRes();
    await handler(createReq({ offer_key: 'journal-annual' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      error: 'already_entitled',
      grantSource: 'entitlement',
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
    assertNoSecrets(res.body);
  });

  it('creates a checkout session with success URL returning through /checkout/success', async () => {
    const res = createMockRes();
    await handler(createReq({ offer_key: 'journal-annual', placement: 'home' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_created',
    });
    assertNoSecrets(res.body);

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    const sessionArg = mockCreateSession.mock.calls[0][0] as {
      success_url: string;
      cancel_url: string;
      metadata: Record<string, string>;
    };
    expect(sessionArg.success_url).toContain('/checkout/success');
    expect(sessionArg.success_url).toContain('session_id={CHECKOUT_SESSION_ID}');
    expect(sessionArg.success_url).toContain('returnTo=');
    expect(decodeURIComponent(sessionArg.success_url)).toContain('returnTo=/app/log');
    expect(sessionArg.metadata.person_id).toBe(PERSON_ID);
    expect(JSON.stringify(sessionArg)).not.toMatch(/sk_live|sk_test|whsec_/);
  });
});
