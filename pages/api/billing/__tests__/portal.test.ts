import type { NextApiRequest, NextApiResponse } from 'next';
const mockUser = jest.fn();
const mockPerson = jest.fn();
const mockLookup = jest.fn();
const mockCreatePortal = jest.fn();
jest.mock('@/lib/authServer', () => ({ getCurrentUserWithRoleFromApi: () => mockUser() }));
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (table: string) => {
    if (table !== 'people') throw new Error(`Unexpected table ${table}`);
    return { select: () => ({ eq: () => ({ maybeSingle: () => mockPerson() }) }) };
  } },
}));
jest.mock('@/lib/stripe/stripeCustomerService', () => ({ findStripeCustomerForPerson: (...args: unknown[]) => mockLookup(...args) }));
jest.mock('@/lib/stripe/stripeServer', () => ({
  stripe: { billingPortal: { sessions: { create: (...args: unknown[]) => mockCreatePortal(...args) } } },
  absoluteUrl: (pathname: string) => `https://fixture.example.invalid${pathname}`,
}));
import handler from '../portal';
function req(method = 'POST') { return { method } as NextApiRequest; }
function response() {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(value: unknown) { res.body = value; return res; },
  };
  return res as typeof res & NextApiResponse;
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockUser.mockResolvedValue({ id: 'auth_fixture' });
  mockPerson.mockResolvedValue({ data: { id: 'person_fixture' }, error: null });
  mockLookup.mockResolvedValue('cus_Scoped');
  mockCreatePortal.mockResolvedValue({ url: 'https://billing.stripe.com/fixture' });
});
afterEach(() => jest.restoreAllMocks());
describe('Billing Portal scoped-customer contracts', () => {
  it('rejects non-POST requests', async () => {
    const res = response(); await handler(req('GET'), res);
    expect(res.statusCode).toBe(405); expect(mockLookup).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    mockUser.mockResolvedValue(null); const res = response(); await handler(req(), res);
    expect(res.statusCode).toBe(401); expect(mockLookup).not.toHaveBeenCalled();
  });
  it('requires a linked person', async () => {
    mockPerson.mockResolvedValue({ data: null, error: null });
    const res = response(); await handler(req(), res);
    expect(res.statusCode).toBe(400); expect(mockLookup).not.toHaveBeenCalled();
  });
  it('fails closed when scoped lookup fails', async () => {
    mockLookup.mockRejectedValue(new Error('fixture_lookup_failure'));
    const res = response(); await handler(req(), res);
    expect(res.statusCode).toBe(503); expect(mockCreatePortal).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('fixture_lookup_failure');
  });
  it('does not fall back to legacy customer data when the selected environment has no mapping', async () => {
    mockLookup.mockResolvedValue(null); const res = response(); await handler(req(), res);
    expect(res.statusCode).toBe(400); expect(mockCreatePortal).not.toHaveBeenCalled();
  });
  it('creates the session for the scoped customer and canonical return path', async () => {
    const res = response(); await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(mockLookup).toHaveBeenCalledWith('person_fixture');
    expect(mockCreatePortal).toHaveBeenCalledWith({ customer: 'cus_Scoped', return_url: 'https://fixture.example.invalid/account' });
    expect(res.body).toEqual({ url: 'https://billing.stripe.com/fixture' });
  });
  it('returns a generic error when Stripe cannot create a portal', async () => {
    mockCreatePortal.mockRejectedValue(new Error('fixture_stripe_failure'));
    const res = response(); await handler(req(), res);
    expect(res.statusCode).toBe(500); expect(JSON.stringify(res.body)).not.toContain('fixture_stripe_failure');
  });
});
