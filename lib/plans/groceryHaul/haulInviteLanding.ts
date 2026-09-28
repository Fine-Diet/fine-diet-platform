/**
 * Invite to Haul v1 — dedicated invitation landing transport.
 *
 * Client-safe (no server imports). Shared by the server (which builds the
 * landing URL that goes into invite emails / Supabase `redirectTo`) and by the
 * client landing page (which turns the arrival into an accepted invitation).
 *
 * Why a dedicated landing and NOT /auth/callback
 * ----------------------------------------------
 * /auth/callback is PKCE-only: it requires `?code=` and calls
 * exchangeCodeForSession. Supabase Auth `admin.inviteUserByEmail` does not
 * support PKCE; the invite link verifies on Supabase's side and redirects back
 * with the session in the URL FRAGMENT (`#access_token=…&refresh_token=…`).
 * The fragment never reaches a server route, and the @supabase/ssr browser
 * client hard-codes `flowType: 'pkce'`, which makes its automatic URL
 * detection reject fragment sessions ("Not a valid PKCE flow url"). So the
 * landing reads the fragment itself and establishes the session explicitly via
 * `setSession` on the existing cookie-based browser client.
 *
 * Security properties (each covered by tests):
 *  - The landing URL is built ONLY from a UUID invitation id. No caller-supplied
 *    `next` / redirect value is ever accepted, so there is no open redirect.
 *  - Arriving with a session (or a link) grants nothing. Membership is created
 *    only by the accept API/RPC, which requires the CONFIRMED Auth email to
 *    equal the invitation target and a linked people record.
 *
 * External configuration (NOT applied by this change; operator step):
 *  - Supabase Auth → URL Configuration → Redirect URLs must allow
 *    `<SITE_URL>/haul-invitations/**` (otherwise Supabase silently falls back to
 *    the Site URL and the invitee never reaches the landing).
 */

import { getSafeRedirectTarget } from '@/lib/redirectHelpers';

export const HAUL_INVITE_LANDING_BASE_PATH = '/haul-invitations';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidHaulInvitationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** `/haul-invitations/<uuid>` — the ONLY path the invite transport ever targets. */
export function buildHaulInviteLandingPath(invitationId: string): string {
  if (!isValidHaulInvitationId(invitationId)) {
    throw new Error('Invalid Haul invitation id.');
  }
  return `${HAUL_INVITE_LANDING_BASE_PATH}/${invitationId.toLowerCase()}`;
}

/** Absolute landing URL for emails and Supabase `redirectTo`. */
export function buildHaulInviteLandingUrl(siteUrl: string, invitationId: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${buildHaulInviteLandingPath(invitationId)}`;
}

/** `/login?redirect=<landing>` for an invitee who has no session yet. */
export function buildHaulInviteLoginPath(invitationId: string): string {
  const landing = buildHaulInviteLandingPath(invitationId);
  // Defence in depth: the shared validator must agree the target is a safe relative path.
  const safe = getSafeRedirectTarget(landing, '/');
  return `/login?redirect=${encodeURIComponent(safe)}&ctx=generic`;
}

// ---------------------------------------------------------------------------
// URL fragment parsing
// ---------------------------------------------------------------------------

export type HaulInviteHash =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string | null }
  | { kind: 'none' };

/**
 * Parse the fragment Supabase appends after verifying an invite link.
 * Only `access_token` + `refresh_token` are read; nothing in the fragment can
 * influence where the browser navigates afterwards.
 */
export function parseHaulInviteHash(hash: string | null | undefined): HaulInviteHash {
  if (!hash) return { kind: 'none' };
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };
  if (params.get('error') || params.get('error_description') || params.get('error_code')) {
    return { kind: 'error', code: params.get('error_code') };
  }
  return { kind: 'none' };
}

// ---------------------------------------------------------------------------
// Landing orchestration (pure; all I/O injected so it is unit-testable)
// ---------------------------------------------------------------------------

export interface HaulInviteLandingUser {
  id: string;
  email: string | null;
}

export interface HaulInviteAcceptResponse {
  status: number;
  body: { result?: { haul_id?: string; outcome?: string }; error?: string } | null;
}

export interface HaulInviteLandingDeps {
  invitationId: string;
  /** window.location.hash captured BEFORE any Supabase client is created. */
  hash: string;
  /** Establish the session from fragment tokens. Returns false on failure. */
  setSession(tokens: { accessToken: string; refreshToken: string }): Promise<boolean>;
  /** Server-verified current user (supabase.auth.getUser), or null. */
  getUser(): Promise<HaulInviteLandingUser | null>;
  /** POST /api/account/link-person. Returns false on non-2xx / network failure. */
  linkPerson(user: HaulInviteLandingUser): Promise<boolean>;
  /** POST /api/journal/food/haul-invitations/:id/accept. */
  accept(invitationId: string): Promise<HaulInviteAcceptResponse>;
}

export type HaulInviteLandingOutcome =
  | { kind: 'accepted'; haulId: string | null; alreadyAccepted: boolean }
  | { kind: 'needs_sign_in'; loginPath: string }
  | { kind: 'link_expired'; loginPath: string }
  | { kind: 'invalid_invitation' }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'failed'; message: string };

const GENERIC_FAILURE = 'We could not accept this invitation. Please try again.';

export async function runHaulInviteLanding(
  deps: HaulInviteLandingDeps,
): Promise<HaulInviteLandingOutcome> {
  if (!isValidHaulInvitationId(deps.invitationId)) return { kind: 'invalid_invitation' };
  const loginPath = buildHaulInviteLoginPath(deps.invitationId);

  const parsed = parseHaulInviteHash(deps.hash);
  let linkProblem = parsed.kind === 'error';

  if (parsed.kind === 'session') {
    const ok = await deps.setSession({
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    });
    if (!ok) linkProblem = true;
  }

  const user = await deps.getUser();
  if (!user) {
    return linkProblem ? { kind: 'link_expired', loginPath } : { kind: 'needs_sign_in', loginPath };
  }

  const linked = await deps.linkPerson(user);
  if (!linked) {
    return { kind: 'failed', message: 'We could not finish setting up your account. Please try again.' };
  }

  let response: HaulInviteAcceptResponse;
  try {
    response = await deps.accept(deps.invitationId);
  } catch {
    return { kind: 'failed', message: GENERIC_FAILURE };
  }

  const serverMessage =
    typeof response.body?.error === 'string' && response.body.error.length > 0
      ? response.body.error
      : null;

  if (response.status === 200) {
    const result = response.body?.result;
    return {
      kind: 'accepted',
      haulId: typeof result?.haul_id === 'string' ? result.haul_id : null,
      alreadyAccepted: result?.outcome === 'already_accepted',
    };
  }
  if (response.status === 401) return { kind: 'needs_sign_in', loginPath };
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 403) {
    return { kind: 'forbidden', message: serverMessage ?? 'You cannot accept this invitation.' };
  }
  return { kind: 'failed', message: serverMessage ?? GENERIC_FAILURE };
}
