import type { NextApiRequest, NextApiResponse } from 'next';
const mockRpc = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
import handler from '@/pages/api/cron/reconcile-entitlements';

async function invoke(method = 'GET', authorization?: string) {
  const response = { statusCode: 200, body: undefined as any,
    status(code: number) { response.statusCode = code; return response; },
    json(body: unknown) { response.body = body; return response; }, setHeader: jest.fn() };
  await handler({ method, headers: { authorization } } as unknown as NextApiRequest, response as unknown as NextApiResponse);
  return response;
}

describe('bounded paid-through expiry cron', () => {
  const priorSecret = process.env.CRON_SECRET;
  beforeEach(() => { jest.resetAllMocks(); process.env.CRON_SECRET = 'fixture_cron_secret'; });
  afterAll(() => { if (priorSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = priorSecret; });

  it.each([undefined, 'Bearer wrong'])('rejects missing and incorrect authorization before database calls', async authorization => {
    const response = await invoke('GET', authorization);
    expect(response.statusCode).toBe(401); expect(mockRpc).not.toHaveBeenCalled();
  });
  it('rejects an unconfigured secret even in development', async () => {
    delete process.env.CRON_SECRET;
    expect((await invoke('GET', 'Bearer fixture_cron_secret')).statusCode).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('runs exactly one bounded service RPC and returns sanitized counts', async () => {
    mockRpc.mockResolvedValue({ data: { expired_purchases: 2, revoked_grants: 3, suspended_assignments: 1, bounded: true }, error: null });
    const response = await invoke('GET', 'Bearer fixture_cron_secret');
    expect(response.statusCode).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('fd_expire_stripe_fulfillment', { p_limit: 100 });
    expect(JSON.stringify(response.body)).not.toMatch(/fixture_cron_secret|Bearer/);
  });
  it('fails closed on RPC error or malformed bounded result', async () => {
    mockRpc.mockResolvedValue({ data: { expired_purchases: 0 }, error: { message: 'private db details' } });
    const response = await invoke('GET', 'Bearer fixture_cron_secret');
    expect(response.statusCode).toBe(503); expect(JSON.stringify(response.body)).not.toContain('private db details');
  });
});
