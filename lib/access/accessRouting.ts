/**
 * Pure Package 2 access routing helpers (no DB).
 */

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { getSafeRedirectTarget, isSafeRedirectTarget } from '@/lib/redirectHelpers';
import type { OnboardingLifecycleState } from '@/lib/onboarding/onboardingState';
import type { AccessGrantSource, EffectiveAccessDecision } from './effectiveAccessTypes';

export type { AccessGrantSource, EffectiveAccessDecision };

/**
 * Resolve the next destination after auth/access/onboarding checks.
 */
export function resolvePostAccessDestination(args: {
  decision: EffectiveAccessDecision;
  requestedPath?: string | null;
  search?: string;
}): string {
  const { decision } = args;
  const requested =
    args.requestedPath && isSafeRedirectTarget(args.requestedPath)
      ? getSafeRedirectTarget(
          args.search ? `${args.requestedPath}${args.search}` : args.requestedPath,
          APP_ROUTES.home,
        )
      : APP_ROUTES.home;

  if (decision.status === 'unauthenticated') {
    const qs = new URLSearchParams({
      redirect: requested,
      ctx: 'generic',
    });
    return `/login?${qs.toString()}`;
  }

  if (
    decision.status === 'missing_person' ||
    decision.status === 'unauthorized' ||
    decision.status === 'resolution_error'
  ) {
    const qs = new URLSearchParams({ redirect: requested });
    return `/journal-waitlist?${qs.toString()}`;
  }

  if (decision.onboarding.mustEnterOnboarding) {
    const pathOnly = requested.split('?')[0];
    const search = requested.includes('?') ? `?${requested.split('?')[1]}` : '';
    const candidate = search ? `${pathOnly}${search}` : pathOnly;
    const returnTo =
      isSafeRedirectTarget(candidate) &&
      pathOnly !== APP_ROUTES.onboarding &&
      pathOnly !== '/journal/onboarding'
        ? candidate
        : null;
    if (!returnTo) return APP_ROUTES.onboarding;
    return `${APP_ROUTES.onboarding}?${new URLSearchParams({ returnTo }).toString()}`;
  }

  return requested.startsWith('/') ? requested : APP_ROUTES.home;
}

export const PACKAGE_2_ACCESS_MATRIX = {
  version: 1 as const,
  product_access_truth: 'person_entitlements',
  payment_rail: 'stripe',
  legacy_compat: {
    table: 'subscriptions',
    type: 'journal_access',
    role: 'read-only compatibility shim — not new provisioning truth',
  },
  cells: [
    {
      identity: 'authenticated',
      person: 'resolved',
      grant: 'person_entitlements.journal active',
      app_entry: 'allowed',
      source: 'entitlement',
    },
    {
      identity: 'authenticated',
      person: 'resolved',
      grant: 'legacy subscriptions.journal_access active',
      app_entry: 'allowed',
      source: 'legacy_subscription_compat',
    },
    {
      identity: 'authenticated',
      person: 'resolved',
      grant: 'none',
      app_entry: 'denied → /journal-waitlist',
      source: 'none',
    },
    {
      identity: 'authenticated',
      person: 'unresolved',
      grant: 'n/a',
      app_entry: 'denied → /journal-waitlist',
      source: 'none',
    },
    {
      identity: 'unauthenticated',
      person: 'n/a',
      grant: 'n/a',
      app_entry: 'denied → /login',
      source: 'none',
    },
  ],
  unresolved_founder_cells: [
    'free tier feature surface',
    'trial vs paid capability differences',
    'family/household access model',
    'post-trial product package',
    'data_access_only enforcement across all routes',
  ],
} as const;

export type { OnboardingLifecycleState };
