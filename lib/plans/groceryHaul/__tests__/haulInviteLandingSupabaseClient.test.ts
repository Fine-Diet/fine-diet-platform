/**
 * @jest-environment jsdom
 *
 * Evidence for the landing design against the REAL installed Supabase client
 * libraries (@supabase/ssr createBrowserClient + auth-js), with only the network
 * faked:
 *
 *  1. createBrowserClient is PKCE-only, so a Supabase INVITE link that returns
 *     the session in the URL fragment is NOT consumed by its automatic URL
 *     detection. (This is why redirecting invites to a PKCE callback, or
 *     relying on auto-detection, is not a valid acceptance contract.)
 *  2. Establishing the session explicitly with setSession from the fragment
 *     tokens (what the landing page does) works on that same client.
 *
 * This proves library behavior offline; it does not replace a runtime check
 * against a real Supabase project (documented as an operator step).
 */

import { createBrowserClient } from '@supabase/ssr';
import { parseHaulInviteHash } from '../haulInviteLanding';

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeJwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: 'auth-invitee',
    aud: 'authenticated',
    role: 'authenticated',
    exp,
    email: 'invitee@example.com',
  })}.sig`;
}

const USER = {
  id: 'auth-invitee',
  aud: 'authenticated',
  email: 'invitee@example.com',
  email_confirmed_at: '2026-09-28T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-28T00:00:00Z',
};

const ACCESS = fakeJwt();
const FRAGMENT = `#access_token=${ACCESS}&refresh_token=rt-1&expires_in=3600&token_type=bearer&type=invite`;

const originalFetch = global.fetch;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  window.localStorage.clear();
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // jsdom has no Response; auth-js only needs ok/status/headers/json().
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
    });
    if (url.includes('/auth/v1/user')) return reply(200, USER);
    return reply(404, {});
  }) as unknown as typeof fetch;
  window.history.replaceState(null, '', `/haul-invitations/5b0a6d0e-2f0b-4d6e-9d3e-0c1f6f1d7a11${FRAGMENT}`);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function newClient() {
  return createBrowserClient('https://example.supabase.co', 'anon-key', { isSingleton: false });
}

describe('Supabase invite fragment vs the PKCE-only browser client', () => {
  it('the fragment is captured by the landing parser before the client exists', () => {
    expect(parseHaulInviteHash(window.location.hash)).toEqual({
      kind: 'session',
      accessToken: ACCESS,
      refreshToken: 'rt-1',
    });
  });

  it('automatic URL detection does NOT establish a session from an invite fragment (PKCE-only client)', async () => {
    const supabase = newClient();
    await (supabase.auth as unknown as { initialize(): Promise<unknown> }).initialize();
    const { data } = await supabase.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('explicit setSession from the parsed fragment tokens establishes the session on the same client', async () => {
    const parsed = parseHaulInviteHash(window.location.hash);
    if (parsed.kind !== 'session') throw new Error('expected a fragment session');
    const supabase = newClient();
    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    expect(error).toBeNull();
    expect(data.session?.user.email).toBe('invitee@example.com');

    const { data: current } = await supabase.auth.getSession();
    expect(current.session?.access_token).toBe(ACCESS);
    // Cookie-backed storage (readable by API routes / middleware), not only memory.
    expect(document.cookie).toContain('sb-');
  });
});
