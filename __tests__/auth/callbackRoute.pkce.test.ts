/** OAuth and email-confirmation callbacks link only the verified PKCE identity. */

const mockExchange = jest.fn<(...args: [string]) => Promise<any>>();
const mockCookieStore = { getAll: jest.fn(() => []), set: jest.fn() };
const mockLinkPerson = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('next/headers', () => ({ cookies: () => mockCookieStore }));
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: mockExchange } }),
}));
jest.mock('@/lib/account/linkPersonForVerifiedUser', () => ({
  linkPersonForVerifiedUser: mockLinkPerson,
  PersonIdentityConflictError: class PersonIdentityConflictError extends Error {},
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { NextRequest } from 'next/server';
import { GET } from '@/app/auth/callback/route';

const ORIGIN = 'https://myfinediet.com';
function req(path: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockLinkPerson.mockResolvedValue({ linked: true });
  mockExchange.mockResolvedValue({
    data: { session: { access_token: 'a' }, user: { id: 'auth-1', email: 'u@example.com' } },
    error: null,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('/auth/callback (PKCE) is unchanged', () => {
  it('exchanges ?code= for a session, links the person, and redirects to a safe next', async () => {
    const res = await GET(req('/auth/callback?code=abc&next=/app/plans'));
    expect(mockExchange).toHaveBeenCalledWith('abc');
    expect(mockLinkPerson).toHaveBeenCalledWith({ id: 'auth-1', email: 'u@example.com' });
    expect(res.headers.get('location')).toBe(`${ORIGIN}/app/plans`);
  });

  it('does not redirect into the requested route when verified identity linking fails', async () => {
    mockLinkPerson.mockRejectedValueOnce(new Error('identity conflict'));
    const res = await GET(req('/auth/callback?code=abc&next=/app'));
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?auth_error=link_failed`);
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

  it('links the verified user on a QA origin and does not call the public link route', async () => {
    const qaOrigin =
      'https://fine-diet-payments-qa-target-git-codex-payments-reconstruct-fine-diet.vercel.app';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    const res = await GET(new NextRequest(`${qaOrigin}/auth/callback?code=abc&next=/app`));
    expect(mockLinkPerson).toHaveBeenCalledWith({ id: 'auth-1', email: 'u@example.com' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe(`${qaOrigin}/app`);
  });

  it('fails closed on a QA origin when verified linking fails', async () => {
    const qaOrigin =
      'https://fine-diet-payments-qa-target-git-codex-payments-reconstruct-fine-diet.vercel.app';
    mockLinkPerson.mockRejectedValueOnce(new Error('identity conflict'));
    const res = await GET(new NextRequest(`${qaOrigin}/auth/callback?code=abc&next=/app`));
    expect(res.headers.get('location')).toBe(`${qaOrigin}/?auth_error=link_failed`);
  });
});
