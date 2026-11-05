import type { NextApiRequest, NextApiResponse } from 'next';
import { createApiRouteCookieMethods } from '../lib/authServer';

describe('createApiRouteCookieMethods', () => {
  it('reads every incoming cookie and preserves all cookies written during a refresh', () => {
    const headers = new Map<string, string | string[]>();
    headers.set('Set-Cookie', 'tracking=keep; Path=/');
    const req = {
      cookies: {
        'sb-auth-token.0': 'old-access',
        'sb-auth-token.1': 'old-refresh',
      },
    } as unknown as NextApiRequest;
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: string | string[]) => headers.set(name, value),
    } as unknown as NextApiResponse;
    const cookies = createApiRouteCookieMethods(req, res);

    expect(cookies.getAll()).toEqual([
      { name: 'sb-auth-token.0', value: 'old-access' },
      { name: 'sb-auth-token.1', value: 'old-refresh' },
    ]);

    cookies.setAll([
      {
        name: 'sb-auth-token.0',
        value: 'new-access',
        options: { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300 },
      },
      {
        name: 'sb-auth-token.1',
        value: 'new-refresh',
        options: { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 },
      },
    ]);

    expect(headers.get('Set-Cookie')).toEqual([
      'tracking=keep; Path=/',
      'sb-auth-token.0=new-access; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax',
      'sb-auth-token.1=new-refresh; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
  });

  it('replaces a refreshed cookie by name without dropping unrelated cookie chunks', () => {
    const headers = new Map<string, string | string[]>();
    const req = { cookies: {} } as unknown as NextApiRequest;
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: string | string[]) => headers.set(name, value),
    } as unknown as NextApiResponse;
    const cookies = createApiRouteCookieMethods(req, res);

    cookies.setAll([
      { name: 'sb-auth-token.0', value: 'a', options: { path: '/' } },
      { name: 'sb-auth-token.1', value: 'b', options: { path: '/' } },
    ]);
    cookies.setAll([{ name: 'sb-auth-token.0', value: 'updated', options: { path: '/' } }]);

    expect(headers.get('Set-Cookie')).toEqual([
      'sb-auth-token.0=updated; Path=/',
      'sb-auth-token.1=b; Path=/',
    ]);
  });
});
