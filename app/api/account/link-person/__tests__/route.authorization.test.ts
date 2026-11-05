const mockGetUser = jest.fn<(...args: any[]) => Promise<any>>();
const mockCookieStore = { getAll: jest.fn(() => []), set: jest.fn() };

jest.mock('next/headers', () => ({ cookies: () => mockCookieStore }));
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({ auth: { getUser: mockGetUser } })),
}));
jest.mock('@/lib/account/linkPersonForVerifiedUser', () => ({
  linkPersonForVerifiedUser: jest.fn(),
  PersonIdentityConflictError: class PersonIdentityConflictError extends Error {
    constructor() {
      super('identity conflict');
      Object.setPrototypeOf(this, PersonIdentityConflictError.prototype);
    }
  },
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createServerClient } from '@supabase/ssr';
import { linkPersonForVerifiedUser, PersonIdentityConflictError } from '@/lib/account/linkPersonForVerifiedUser';
import { POST } from '@/app/api/account/link-person/route';

const AUTH_USER = { id: '80ec2f53-4bbb-4ac0-b4a4-111a71112345', email: 'member@example.com' };
const mockLinker = linkPersonForVerifiedUser as jest.Mock<(...args: any[]) => Promise<any>>;

describe('POST /api/account/link-person authorization', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
    (createServerClient as jest.Mock).mockClear();
    mockGetUser.mockReset();
    mockLinker.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects unauthenticated requests without touching People', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
    const response = await POST(new Request('https://app.example/api/account/link-person', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(linkPersonForVerifiedUser).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ ok: false, linked: false });
  });

  it('uses the authenticated session identity and ignores a forged body identity', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
    mockLinker.mockResolvedValue({ linked: true });
    const forgedBody = { authUserId: '39e600c4-571b-475e-9f65-2b4b211a6479', email: 'other@example.com' };
    const response = await POST(new Request('https://app.example/api/account/link-person', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forgedBody),
    }));

    expect(response.status).toBe(200);
    expect(linkPersonForVerifiedUser).toHaveBeenCalledWith(AUTH_USER);
    expect(await response.json()).toEqual({ ok: true, linked: true });
  });

  it('reports a conflicting linkage as unsuccessful without exposing People data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: AUTH_USER }, error: null });
    mockLinker.mockRejectedValue(new PersonIdentityConflictError());
    const response = await POST(new Request('https://app.example/api/account/link-person', { method: 'POST' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, linked: false });
  });
});
