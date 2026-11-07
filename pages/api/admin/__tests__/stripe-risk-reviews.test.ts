import type { NextApiRequest, NextApiResponse } from 'next';
const mockRequireRole = jest.fn(), mockFrom = jest.fn();
jest.mock('@/lib/authServer', () => ({ requireRoleFromApi: (...args: unknown[]) => mockRequireRole(...args) }));
jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } }));
import handler from '@/pages/api/admin/stripe-risk-reviews';

async function invoke(method = 'GET') {
  const response = { statusCode: 200, body: undefined as any, headers: {} as Record<string, unknown>,
    status(code: number) { response.statusCode = code; return response; },
    json(body: unknown) { response.body = body; return response; },
    setHeader(key: string, value: unknown) { response.headers[key] = value; } };
  await handler({ method } as unknown as NextApiRequest, response as unknown as NextApiResponse);
  return response;
}
beforeEach(() => { jest.resetAllMocks(); mockRequireRole.mockResolvedValue({ id: 'admin_fixture', role: 'admin' }); });

describe('admin Stripe risk review queue', () => {
  it('is GET-only and requires an admin', async () => {
    expect((await invoke('POST')).statusCode).toBe(405);
    mockRequireRole.mockResolvedValue(null);
    await invoke(); expect(mockFrom).not.toHaveBeenCalled();
  });
  it('returns only a bounded, read-only open review projection without caching', async () => {
    const result = { data: [{ id: 'review_fixture', risk_kind: 'dispute', status: 'open' }], error: null };
    const query = { select: jest.fn(() => query), eq: jest.fn(() => query), order: jest.fn(() => query), limit: jest.fn(async () => result) };
    mockFrom.mockReturnValue(query);
    const response = await invoke();
    expect(response.statusCode).toBe(200); expect(response.body.reviews).toHaveLength(1);
    expect(response.headers['Cache-Control']).toContain('no-store');
    expect(mockFrom).toHaveBeenCalledWith('stripe_risk_reviews'); expect(query.limit).toHaveBeenCalledWith(100);
  });
  it('sanitizes database failures', async () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: null, error: { message: 'private provider response' } }) };
    mockFrom.mockReturnValue(query); jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await invoke();
    expect(response.statusCode).toBe(503); expect(JSON.stringify(response.body)).not.toContain('private provider response');
  });
});
