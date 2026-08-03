/**
 * Middleware access-gate integration — shared effective-access path.
 *
 * Hosted NextRequest/NextResponse are simulated; auth and access resolvers are
 * mocked. Confirms public/checkout routes are not incorrectly journal-gated and
 * that fail-closed / return-to behavior holds for app routes.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
jest.mock('@/lib/authServer', () => ({
  getCurrentUserWithRoleFromMiddleware: (...args: unknown[]) => mockGetUser(...args),
}));

const mockResolveAccess = jest.fn();
jest.mock('@/lib/access/effectiveAccess', () => ({
  resolveEffectiveAccessForAuthUser: (...args: unknown[]) => mockResolveAccess(...args),
}));

import { middleware } from '@/middleware';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';

function requestFor(path: string, host = 'app.myfinediet.com'): NextRequest {
  return new NextRequest(new URL(`https://${host}${path}`), {
    headers: { host },
  });
}

function authorized(overrides: Record<string, unknown> = {}) {
  const onboarding = deriveOnboardingState(
    (overrides.metadata as Record<string, unknown> | undefined) ?? {
      onboarding_completed_at: '2026-07-01T00:00:00Z',
    },
  );
  return {
    status: 'authorized',
    allowed: true,
    grantSource: 'entitlement',
    personId: 'p1',
    authUserId: 'auth-1',
    onboarding,
    reason: 'entitlement_active',
    entitlementKey: 'journal',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ id: 'auth-1', email: 'a@b.com', role: 'user' });
  mockResolveAccess.mockResolvedValue(authorized());
});

describe('middleware access gate', () => {
  it('does not journal-gate public marketing or checkout success routes', async () => {
    for (const path of ['/programs/nutrition', '/checkout/success?session_id=cs_x', '/start']) {
      mockGetUser.mockClear();
      mockResolveAccess.mockClear();
      const res = await middleware(requestFor(path));
      expect(res.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockResolveAccess).not.toHaveBeenCalled();
    }
  });

  it('sends unauthenticated app users to login with redirect return-to', async () => {
    mockGetUser.mockResolvedValue(null);
    const res = await middleware(requestFor('/app/log'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/login');
    expect(location).toContain('redirect=');
    expect(decodeURIComponent(location)).toContain('/app/log');
  });

  it('sends authenticated but not entitled users to waitlist with redirect', async () => {
    mockResolveAccess.mockResolvedValue({
      status: 'unauthorized',
      allowed: false,
      grantSource: 'none',
      personId: 'p1',
      authUserId: 'auth-1',
      onboarding: deriveOnboardingState({}),
      reason: 'no_active_grant',
    });
    const res = await middleware(requestFor('/app/plans'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/journal-waitlist');
    expect(decodeURIComponent(location)).toContain('/app/plans');
  });

  it('redirects entitled incomplete onboarding users into onboarding with returnTo', async () => {
    mockResolveAccess.mockResolvedValue(
      authorized({ metadata: {}, onboarding: deriveOnboardingState({}) }),
    );
    // Rebuild via metadata path correctly:
    mockResolveAccess.mockResolvedValue({
      status: 'authorized',
      allowed: true,
      grantSource: 'entitlement',
      personId: 'p1',
      authUserId: 'auth-1',
      onboarding: deriveOnboardingState({}),
      reason: 'entitlement_active',
      entitlementKey: 'journal',
    });

    const res = await middleware(requestFor('/app/log'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/app/onboarding');
    expect(location).toContain('returnTo=');
    expect(decodeURIComponent(location)).toContain('/app/log');
  });

  it('allows entitled skipped-onboarding users through app routes', async () => {
    mockResolveAccess.mockResolvedValue({
      status: 'authorized',
      allowed: true,
      grantSource: 'entitlement',
      personId: 'p1',
      authUserId: 'auth-1',
      onboarding: deriveOnboardingState({ onboarding_skipped_at: '2026-07-01T00:00:00Z' }),
      reason: 'entitlement_active',
      entitlementKey: 'journal',
    });

    const res = await middleware(requestFor('/app/log'));
    expect(res.status).toBe(200);
  });

  it('allows entitled completed-onboarding users through app routes', async () => {
    const res = await middleware(requestFor('/app/plans'));
    expect(res.status).toBe(200);
  });

  it('fails closed to waitlist on transient access resolution throw', async () => {
    mockResolveAccess.mockRejectedValue(new Error('transient'));
    const res = await middleware(requestFor('/app'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location') || '').toContain('/journal-waitlist');
  });

  it('allows legacy-compat entitled users (grantSource from resolver)', async () => {
    mockResolveAccess.mockResolvedValue({
      status: 'authorized',
      allowed: true,
      grantSource: 'legacy_subscription_compat',
      personId: 'p1',
      authUserId: 'auth-1',
      onboarding: deriveOnboardingState({ onboarding_completed_at: '2026-07-01T00:00:00Z' }),
      reason: 'legacy_subscription_compat',
    });
    const res = await middleware(requestFor('/app'));
    expect(res.status).toBe(200);
  });

  it('rewrites legacy journal paths to canonical app after access passes', async () => {
    const res = await middleware(requestFor('/journal/log'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location') || '').toContain('/app/log');
  });
});
