import type { OnboardingLifecycleState } from '@/lib/onboarding/onboardingState';

export type AccessGrantSource =
  | 'entitlement'
  | 'legacy_subscription_compat'
  | 'none';

export type EffectiveAccessDecision =
  | {
      status: 'unauthenticated';
      allowed: false;
      grantSource: 'none';
      personId: null;
      onboarding: OnboardingLifecycleState;
      reason: 'no_session';
    }
  | {
      status: 'missing_person';
      allowed: false;
      grantSource: 'none';
      personId: null;
      authUserId: string;
      onboarding: OnboardingLifecycleState;
      reason: 'person_unresolved';
    }
  | {
      status: 'unauthorized';
      allowed: false;
      grantSource: 'none';
      personId: string;
      authUserId: string;
      onboarding: OnboardingLifecycleState;
      reason: 'no_active_grant';
    }
  | {
      status: 'authorized';
      allowed: true;
      grantSource: Exclude<AccessGrantSource, 'none'>;
      personId: string;
      authUserId: string;
      onboarding: OnboardingLifecycleState;
      reason: 'entitlement_active' | 'legacy_subscription_compat';
      entitlementKey?: string;
    }
  | {
      status: 'resolution_error';
      allowed: false;
      grantSource: 'none';
      personId: string | null;
      authUserId: string | null;
      onboarding: OnboardingLifecycleState;
      reason: 'access_resolution_failed';
      errorMessage: string;
    };
