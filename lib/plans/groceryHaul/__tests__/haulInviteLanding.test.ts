import {
  HAUL_INVITE_LANDING_BASE_PATH,
  buildHaulInviteLandingPath,
  buildHaulInviteLandingUrl,
  buildHaulInviteLoginPath,
  isValidHaulInvitationId,
  parseHaulInviteHash,
  runHaulInviteLanding,
  type HaulInviteAcceptResponse,
  type HaulInviteLandingDeps,
} from '../haulInviteLanding';
import { isSafeRedirectTarget } from '@/lib/redirectHelpers';

const ID = '5b0a6d0e-2f0b-4d6e-9d3e-0c1f6f1d7a11';
const USER = { id: 'auth-1', email: 'invitee@example.com' };
const FRAGMENT = '#access_token=at.jwt&refresh_token=rt&expires_in=3600&token_type=bearer&type=invite';

describe('landing URL builders (no /auth/callback, no caller-supplied redirect)', () => {
  it('builds /haul-invitations/<uuid> and an absolute URL without doubling slashes', () => {
    expect(buildHaulInviteLandingPath(ID)).toBe(`${HAUL_INVITE_LANDING_BASE_PATH}/${ID}`);
    expect(buildHaulInviteLandingUrl('https://myfinediet.com/', ID)).toBe(
      `https://myfinediet.com/haul-invitations/${ID}`,
    );
    expect(buildHaulInviteLandingUrl('https://myfinediet.com', ID)).not.toContain('/auth/callback');
    expect(buildHaulInviteLandingUrl('https://myfinediet.com', ID)).not.toContain('?');
  });

  it('normalizes the id to lower case', () => {
    expect(buildHaulInviteLandingPath(ID.toUpperCase())).toBe(`/haul-invitations/${ID}`);
  });

  it.each([
    '',
    'inv-9',
    '../../etc/passwd',
    'https://evil.example/x',
    '//evil.example',
    `${ID}?next=https://evil.example`,
    `${ID}/../..`,
    `${ID}#x`,
    `${ID}\n`,
    null,
    undefined,
    42,
  ])('rejects %p as an invitation id (open-redirect / path-injection guard)', (value) => {
    expect(isValidHaulInvitationId(value)).toBe(false);
    expect(() => buildHaulInviteLandingPath(value as string)).toThrow();
    expect(() => buildHaulInviteLandingUrl('https://myfinediet.com', value as string)).toThrow();
    expect(() => buildHaulInviteLoginPath(value as string)).toThrow();
  });

  it('login path returns to the landing via a validated relative redirect', () => {
    const login = buildHaulInviteLoginPath(ID);
    const url = new URL(login, 'https://myfinediet.com');
    expect(url.pathname).toBe('/login');
    const redirect = url.searchParams.get('redirect');
    expect(redirect).toBe(`/haul-invitations/${ID}`);
    expect(isSafeRedirectTarget(redirect)).toBe(true);
    expect(redirect).not.toContain('/auth/callback');
  });
});

describe('parseHaulInviteHash', () => {
  it('reads a Supabase invite fragment session', () => {
    expect(parseHaulInviteHash(FRAGMENT)).toEqual({
      kind: 'session',
      accessToken: 'at.jwt',
      refreshToken: 'rt',
    });
  });

  it('reports fragment errors (expired / denied links)', () => {
    expect(
      parseHaulInviteHash('#error=access_denied&error_code=otp_expired&error_description=Link+expired'),
    ).toEqual({ kind: 'error', code: 'otp_expired' });
  });

  it.each([undefined, null, '', '#', '#foo=bar', '#access_token=only-access'])(
    'treats %p as no session',
    (hash) => {
      expect(parseHaulInviteHash(hash as string)).toEqual({ kind: 'none' });
    },
  );
});

function deps(overrides: Partial<HaulInviteLandingDeps> = {}) {
  const calls: string[] = [];
  const base: HaulInviteLandingDeps = {
    invitationId: ID,
    hash: '',
    setSession: jest.fn(async () => {
      calls.push('setSession');
      return true;
    }),
    getUser: jest.fn(async () => {
      calls.push('getUser');
      return USER;
    }),
    linkPerson: jest.fn(async () => {
      calls.push('linkPerson');
      return true;
    }),
    accept: jest.fn(async (): Promise<HaulInviteAcceptResponse> => {
      calls.push('accept');
      return { status: 200, body: { result: { haul_id: 'haul-1', outcome: 'accepted' } } };
    }),
  };
  return { deps: { ...base, ...overrides }, calls };
}

describe('runHaulInviteLanding', () => {
  it('new-user Supabase invite: fragment session -> setSession -> link person -> accept', async () => {
    const { deps: d, calls } = deps({ hash: FRAGMENT });
    await expect(runHaulInviteLanding(d)).resolves.toEqual({
      kind: 'accepted',
      haulId: 'haul-1',
      alreadyAccepted: false,
    });
    expect(calls).toEqual(['setSession', 'getUser', 'linkPerson', 'accept']);
    expect(d.setSession).toHaveBeenCalledWith({ accessToken: 'at.jwt', refreshToken: 'rt' });
  });

  it('accept is called with ONLY the invitation id (identity comes from the session, never the client)', async () => {
    const { deps: d } = deps({ hash: FRAGMENT });
    await runHaulInviteLanding(d);
    expect(d.accept).toHaveBeenCalledTimes(1);
    expect((d.accept as jest.Mock).mock.calls[0]).toEqual([ID]);
  });

  it('existing-account email link: no fragment, existing session -> link person -> accept', async () => {
    const { deps: d, calls } = deps();
    const result = await runHaulInviteLanding(d);
    expect(result.kind).toBe('accepted');
    expect(calls).toEqual(['getUser', 'linkPerson', 'accept']);
    expect(d.setSession).not.toHaveBeenCalled();
  });

  it('reports an idempotent re-accept', async () => {
    const { deps: d } = deps({
      accept: jest.fn(async () => ({
        status: 200,
        body: { result: { haul_id: 'haul-1', outcome: 'already_accepted' } },
      })),
    });
    await expect(runHaulInviteLanding(d)).resolves.toMatchObject({
      kind: 'accepted',
      alreadyAccepted: true,
    });
  });

  it('no session and no fragment: sends the invitee to login and back to the landing, accepting nothing', async () => {
    const { deps: d } = deps({ getUser: jest.fn(async () => null) });
    const result = await runHaulInviteLanding(d);
    expect(result).toEqual({ kind: 'needs_sign_in', loginPath: buildHaulInviteLoginPath(ID) });
    expect(d.linkPerson).not.toHaveBeenCalled();
    expect(d.accept).not.toHaveBeenCalled();
  });

  it('expired invite link (fragment error) with no session: link_expired, accepting nothing', async () => {
    const { deps: d } = deps({
      hash: '#error=access_denied&error_code=otp_expired&error_description=expired',
      getUser: jest.fn(async () => null),
    });
    const result = await runHaulInviteLanding(d);
    expect(result).toEqual({ kind: 'link_expired', loginPath: buildHaulInviteLoginPath(ID) });
    expect(d.accept).not.toHaveBeenCalled();
  });

  it('setSession failure with no resulting user: link_expired, accepting nothing', async () => {
    const { deps: d } = deps({
      hash: FRAGMENT,
      setSession: jest.fn(async () => false),
      getUser: jest.fn(async () => null),
    });
    expect((await runHaulInviteLanding(d)).kind).toBe('link_expired');
    expect(d.accept).not.toHaveBeenCalled();
  });

  it('does not accept when linking the people record fails', async () => {
    const { deps: d } = deps({ linkPerson: jest.fn(async () => false) });
    expect((await runHaulInviteLanding(d)).kind).toBe('failed');
    expect(d.accept).not.toHaveBeenCalled();
  });

  it('surfaces the server identity decision: a mismatched email is forbidden, never accepted', async () => {
    const { deps: d } = deps({
      accept: jest.fn(async () => ({
        status: 403,
        body: { error: 'This invitation was sent to a different email address.' },
      })),
    });
    await expect(runHaulInviteLanding(d)).resolves.toEqual({
      kind: 'forbidden',
      message: 'This invitation was sent to a different email address.',
    });
  });

  it.each([
    [404, 'not_found'],
    [409, 'failed'],
    [500, 'failed'],
  ] as const)('maps accept status %s to %s', async (status, kind) => {
    const { deps: d } = deps({
      accept: jest.fn(async () => ({ status, body: { error: 'x' } })),
    });
    expect((await runHaulInviteLanding(d)).kind).toBe(kind);
  });

  it('401 from accept sends the invitee to login', async () => {
    const { deps: d } = deps({ accept: jest.fn(async () => ({ status: 401, body: null })) });
    expect((await runHaulInviteLanding(d)).kind).toBe('needs_sign_in');
  });

  it('a thrown accept request is a failure, not a crash', async () => {
    const { deps: d } = deps({
      accept: jest.fn(async () => {
        throw new Error('network');
      }),
    });
    expect((await runHaulInviteLanding(d)).kind).toBe('failed');
  });

  it('invalid invitation id short-circuits before any I/O', async () => {
    const { deps: d } = deps({ invitationId: '../../evil', hash: FRAGMENT });
    await expect(runHaulInviteLanding(d)).resolves.toEqual({ kind: 'invalid_invitation' });
    expect(d.setSession).not.toHaveBeenCalled();
    expect(d.getUser).not.toHaveBeenCalled();
    expect(d.accept).not.toHaveBeenCalled();
  });

  it('cannot be steered to an external destination by fragment or query-like input', async () => {
    const { deps: d } = deps({
      hash: '#next=https://evil.example&redirect=//evil.example&redirect_to=https://evil.example',
      getUser: jest.fn(async () => null),
    });
    const result = await runHaulInviteLanding(d);
    expect(result).toEqual({ kind: 'needs_sign_in', loginPath: buildHaulInviteLoginPath(ID) });
    expect(JSON.stringify(result)).not.toContain('evil');
  });
});
