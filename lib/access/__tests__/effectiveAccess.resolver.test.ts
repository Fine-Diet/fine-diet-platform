/**
 * Effective access resolver — entitlement-first + legacy compat coverage.
 *
 * Mocks supabaseAdmin only; no live DB. Fail-closed behavior is preserved.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  resolveJournalGrant,
  resolveEffectiveAccessForAuthUser,
  personHasEffectiveEntitlementKeys,
} from '../effectiveAccess';
import { resolvePostAccessDestination } from '../accessRouting';
import {
  isOnboardingGateExempt,
  mustEnterOnboarding,
  buildOnboardingRedirectDestination,
} from '@/lib/onboarding/onboardingGate';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

type QueryResult = { data: unknown; error: unknown };

function tableChain(result: QueryResult, terminal: 'limit' | 'maybeSingle' = 'limit') {
  const chain: Record<string, jest.Mock> = {};
  for (const m of ['select', 'eq', 'lte', 'or', 'in', 'gt']) {
    chain[m] = jest.fn(() => chain);
  }
  if (terminal === 'limit') {
    chain.limit = jest.fn(async () => result);
  } else {
    chain.maybeSingle = jest.fn(async () => result);
    chain.limit = jest.fn(async () => result);
  }
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveJournalGrant', () => {
  it('allows entitled users from person_entitlements', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'person_entitlements') {
        return tableChain({
          data: [{ id: 'e1', entitlement_key: 'journal' }],
          error: null,
        });
      }
      throw new Error(`unexpected ${table}`);
    });

    await expect(resolveJournalGrant('person-1')).resolves.toEqual({
      allowed: true,
      grantSource: 'entitlement',
      reason: 'entitlement_active',
      entitlementKey: 'journal',
    });
  });

  it('falls back to legacy subscription when no entitlement row exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'person_entitlements') {
        return tableChain({ data: [], error: null });
      }
      if (table === 'subscriptions') {
        return tableChain({ data: [{ id: 'sub-1' }], error: null });
      }
      throw new Error(`unexpected ${table}`);
    });

    await expect(resolveJournalGrant('person-1')).resolves.toEqual({
      allowed: true,
      grantSource: 'legacy_subscription_compat',
      reason: 'legacy_subscription_compat',
    });
  });

  it('denies when neither entitlement nor legacy subscription is active', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'person_entitlements' || table === 'subscriptions') {
        return tableChain({ data: [], error: null });
      }
      throw new Error(`unexpected ${table}`);
    });

    await expect(resolveJournalGrant('person-1')).resolves.toEqual({
      allowed: false,
      grantSource: 'none',
      reason: 'no_active_grant',
    });
  });

  it('fails closed on entitlement lookup error (does not invent access)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'person_entitlements') {
        return tableChain({ data: null, error: { message: 'db_down' } });
      }
      throw new Error(`unexpected ${table}`);
    });

    await expect(resolveJournalGrant('person-1')).resolves.toEqual({
      allowed: false,
      grantSource: 'none',
      reason: 'no_active_grant',
    });
  });
});

describe('personHasEffectiveEntitlementKeys legacy journal shim', () => {
  it('treats legacy journal_access as covering a sole journal key', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'person_entitlements') {
        return tableChain({ data: [], error: null });
      }
      if (table === 'subscriptions') {
        return tableChain({ data: [{ id: 'sub-1' }], error: null });
      }
      throw new Error(`unexpected ${table}`);
    });

    await expect(
      personHasEffectiveEntitlementKeys('person-1', ['journal']),
    ).resolves.toEqual({
      covered: true,
      grantSource: 'legacy_subscription_compat',
    });
  });
});

describe('resolveEffectiveAccessForAuthUser', () => {
  function mockPerson(
    person: { id: string; metadata: Record<string, unknown> } | null,
    grant: 'entitlement' | 'legacy' | 'none' | 'ent_error',
  ) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return tableChain(
          { data: person, error: null },
          'maybeSingle',
        );
      }
      if (table === 'person_entitlements') {
        if (grant === 'ent_error') {
          return tableChain({ data: null, error: { message: 'transient' } });
        }
        if (grant === 'entitlement') {
          return tableChain({
            data: [{ id: 'e1', entitlement_key: 'journal' }],
            error: null,
          });
        }
        return tableChain({ data: [], error: null });
      }
      if (table === 'subscriptions') {
        if (grant === 'legacy') {
          return tableChain({ data: [{ id: 'sub-1' }], error: null });
        }
        return tableChain({ data: [], error: null });
      }
      throw new Error(`unexpected ${table}`);
    });
  }

  it('returns unauthenticated when auth user is missing', async () => {
    await expect(resolveEffectiveAccessForAuthUser(null)).resolves.toMatchObject({
      status: 'unauthenticated',
      allowed: false,
      reason: 'no_session',
    });
  });

  it('returns unauthorized for authenticated but not entitled users', async () => {
    mockPerson({ id: 'p1', metadata: {} }, 'none');
    await expect(resolveEffectiveAccessForAuthUser('auth-1')).resolves.toMatchObject({
      status: 'unauthorized',
      allowed: false,
      personId: 'p1',
      reason: 'no_active_grant',
    });
  });

  it('authorizes incomplete onboarding users (mustEnterOnboarding)', async () => {
    mockPerson({ id: 'p1', metadata: {} }, 'entitlement');
    const decision = await resolveEffectiveAccessForAuthUser('auth-1');
    expect(decision).toMatchObject({
      status: 'authorized',
      allowed: true,
      grantSource: 'entitlement',
    });
    expect(decision.onboarding.mustEnterOnboarding).toBe(true);
    expect(mustEnterOnboarding({
      onboarding_completed_at: decision.onboarding.completedAt,
      onboarding_skipped_at: decision.onboarding.skippedAt,
      onboarding_started_at: decision.onboarding.startedAt,
      onboarding_last_step: decision.onboarding.lastStep,
    })).toBe(true);
  });

  it('authorizes entitled users who skipped onboarding', async () => {
    mockPerson(
      { id: 'p1', metadata: { onboarding_skipped_at: '2026-07-01T00:00:00Z' } },
      'entitlement',
    );
    const decision = await resolveEffectiveAccessForAuthUser('auth-1');
    expect(decision.onboarding.phase).toBe('skipped');
    expect(decision.onboarding.mustEnterOnboarding).toBe(false);
    expect(
      resolvePostAccessDestination({ decision, requestedPath: '/app/log' }),
    ).toBe('/app/log');
  });

  it('authorizes entitled users with completed onboarding', async () => {
    mockPerson(
      { id: 'p1', metadata: { onboarding_completed_at: '2026-07-01T00:00:00Z' } },
      'entitlement',
    );
    const decision = await resolveEffectiveAccessForAuthUser('auth-1');
    expect(decision.onboarding.phase).toBe('completed');
    expect(
      resolvePostAccessDestination({ decision, requestedPath: '/app/plans' }),
    ).toBe('/app/plans');
  });

  it('fails closed on transient person lookup failure', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return tableChain(
          { data: null, error: { message: 'timeout' } },
          'maybeSingle',
        );
      }
      throw new Error(`unexpected ${table}`);
    });

    await expect(resolveEffectiveAccessForAuthUser('auth-1')).resolves.toMatchObject({
      status: 'resolution_error',
      allowed: false,
      reason: 'access_resolution_failed',
    });
  });

  it('fails closed on transient entitlement lookup failure', async () => {
    mockPerson({ id: 'p1', metadata: {} }, 'ent_error');
    await expect(resolveEffectiveAccessForAuthUser('auth-1')).resolves.toMatchObject({
      status: 'unauthorized',
      allowed: false,
      reason: 'no_active_grant',
    });
  });

  it('preserves legacy-only users via compatibility shim', async () => {
    mockPerson(
      { id: 'p1', metadata: { onboarding_completed_at: '2026-07-01T00:00:00Z' } },
      'legacy',
    );
    await expect(resolveEffectiveAccessForAuthUser('auth-1')).resolves.toMatchObject({
      status: 'authorized',
      allowed: true,
      grantSource: 'legacy_subscription_compat',
      reason: 'legacy_subscription_compat',
    });
  });
});

describe('middleware-adjacent gate routing helpers', () => {
  it('does not journal-gate public or checkout routes via onboarding exempt / path checks', () => {
    // Middleware only applies signed-in app gate to /app and /journal.
    // Public /programs and /checkout/success are outside that gate entirely.
    expect(isOnboardingGateExempt('/checkout/success')).toBe(false);
    expect(isOnboardingGateExempt('/programs/nutrition')).toBe(false);
    expect(isOnboardingGateExempt('/app/onboarding')).toBe(true);
  });

  it('preserves return-to when building onboarding redirects', () => {
    expect(buildOnboardingRedirectDestination('/app/log', '?tab=1')).toBe(
      `${APP_ROUTES.onboarding}?returnTo=${encodeURIComponent('/app/log?tab=1')}`,
    );
  });
});
