/**
 * Regression guard: the OAuth / email-confirmation /auth/callback route stays
 * PKCE-only and unchanged by the Haul invite transport correction.
 * Haul invitations deliberately do NOT use this route (see haulInviteLanding.ts).
 */

const mockExchange = jest.fn();
const mockCookieStore = { getAll: jest.fn(() => []), set: jest.fn() };

jest.mock('next/headers', () => ({ cookies: () => mockCookieStore }));
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: mockExchange } }),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/auth/callback/route';

const ORIGIN = 'https://myfinediet.com';
const originalFetch = global.fetch;

function req(path: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  mockExchange.mockResolvedValue({
    data: { session: { access_token: 'a' }, user: { id: 'auth-1', email: 'u@example.com' } },
    error: null,
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('/auth/callback (PKCE) is unchanged', () => {
  it('exchanges ?code= for a session, links the person, and redirects to a safe next', async () => {
    const res = await GET(req('/auth/callback?code=abc&next=/app/plans'));
    expect(mockExchange).toHaveBeenCalledWith('abc');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/account/link-person'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(res.headers.get('location')).toBe(`${ORIGIN}/app/plans`);
  });

  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)'])(
    'still rejects unsafe next=%s',
    async (next) => {
      const res = await GET(req(`/auth/callback?code=abc&next=${encodeURIComponent(next)}`));
      expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
    },
  );

  it('still requires a PKCE code: a fragment-style invite arrival (no ?code=) is NOT accepted here', async () => {
    const res = await GET(req('/auth/callback?next=%2Fhaul-invitations%2Fx'));
    expect(mockExchange).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?auth_error=missing_code`);
  });

  it('still surfaces upstream provider errors before the missing-code check', async () => {
    const res = await GET(req('/auth/callback?error=access_denied&error_code=x'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?auth_error=exchange_failed`);
  });

  it('still fails closed when the code exchange fails', async () => {
    mockExchange.mockResolvedValue({ data: { session: null, user: null }, error: { message: 'bad' } });
    const res = await GET(req('/auth/callback?code=abc'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?auth_error=exchange_failed`);
  });
});
