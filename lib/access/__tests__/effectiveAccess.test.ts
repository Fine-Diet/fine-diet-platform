import { describe, expect, it } from '@jest/globals';
import {
  PACKAGE_2_ACCESS_MATRIX,
  resolvePostAccessDestination,
  type EffectiveAccessDecision,
} from '../accessRouting';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';

describe('PACKAGE_2_ACCESS_MATRIX', () => {
  it('documents entitlement-first truth and unresolved cells', () => {
    expect(PACKAGE_2_ACCESS_MATRIX.product_access_truth).toBe('person_entitlements');
    expect(PACKAGE_2_ACCESS_MATRIX.payment_rail).toBe('stripe');
    expect(PACKAGE_2_ACCESS_MATRIX.unresolved_founder_cells.length).toBeGreaterThan(0);
  });
});

describe('resolvePostAccessDestination', () => {
  const incomplete = deriveOnboardingState({});
  const complete = deriveOnboardingState({
    onboarding_completed_at: '2026-07-31T00:00:00Z',
  });
  const skipped = deriveOnboardingState({
    onboarding_skipped_at: '2026-07-31T00:00:00Z',
  });

  it('sends unauthenticated users to login with redirect', () => {
    const decision: EffectiveAccessDecision = {
      status: 'unauthenticated',
      allowed: false,
      grantSource: 'none',
      personId: null,
      onboarding: incomplete,
      reason: 'no_session',
    };
    expect(resolvePostAccessDestination({ decision, requestedPath: '/app/log' })).toContain(
      '/login?',
    );
  });

  it('sends unauthorized users to waitlist', () => {
    const decision: EffectiveAccessDecision = {
      status: 'unauthorized',
      allowed: false,
      grantSource: 'none',
      personId: 'p1',
      authUserId: 'u1',
      onboarding: incomplete,
      reason: 'no_active_grant',
    };
    expect(resolvePostAccessDestination({ decision, requestedPath: '/app' })).toContain(
      '/journal-waitlist',
    );
  });

  it('sends authorized incomplete users to onboarding with returnTo', () => {
    const decision: EffectiveAccessDecision = {
      status: 'authorized',
      allowed: true,
      grantSource: 'entitlement',
      personId: 'p1',
      authUserId: 'u1',
      onboarding: incomplete,
      reason: 'entitlement_active',
    };
    expect(resolvePostAccessDestination({ decision, requestedPath: '/app/log' })).toBe(
      '/app/onboarding?returnTo=%2Fapp%2Flog',
    );
  });

  it('allows skipped and completed users into requested destination', () => {
    const skippedDecision: EffectiveAccessDecision = {
      status: 'authorized',
      allowed: true,
      grantSource: 'legacy_subscription_compat',
      personId: 'p1',
      authUserId: 'u1',
      onboarding: skipped,
      reason: 'legacy_subscription_compat',
    };
    expect(resolvePostAccessDestination({ decision: skippedDecision, requestedPath: '/app' })).toBe(
      '/app',
    );

    const completedDecision: EffectiveAccessDecision = {
      status: 'authorized',
      allowed: true,
      grantSource: 'entitlement',
      personId: 'p1',
      authUserId: 'u1',
      onboarding: complete,
      reason: 'entitlement_active',
    };
    expect(
      resolvePostAccessDestination({ decision: completedDecision, requestedPath: '/app/plans' }),
    ).toBe('/app/plans');
  });
});
