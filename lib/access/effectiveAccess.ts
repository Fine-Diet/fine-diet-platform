/**
 * Package 2 — typed effective access decision.
 *
 * Single server-side contract for middleware, checkout preflight, and API
 * guards. Entitlements are normalized product-access truth; legacy
 * subscriptions remain an explicit compatibility shim only.
 *
 * NEVER import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';
import type {
  AccessGrantSource,
  EffectiveAccessDecision,
} from './effectiveAccessTypes';

export type { AccessGrantSource, EffectiveAccessDecision } from './effectiveAccessTypes';
export {
  PACKAGE_2_ACCESS_MATRIX,
  resolvePostAccessDestination,
} from './accessRouting';

export interface JournalGrantResult {
  allowed: boolean;
  grantSource: AccessGrantSource;
  reason: EffectiveAccessDecision['reason'] | 'entitlement_active' | 'legacy_subscription_compat';
  entitlementKey?: string;
}

const EMPTY_ONBOARDING = deriveOnboardingState(null);

/**
 * Resolve journal product access for a person.
 *
 * Order (Package 2 contract):
 *   1. Normalized `person_entitlements` (`journal`) — canonical truth
 *   2. Legacy active `subscriptions.journal_access` — labeled compatibility only
 */
export async function resolveJournalGrant(personId: string): Promise<JournalGrantResult> {
  const now = new Date().toISOString();

  const { data: ents, error: entError } = await supabaseAdmin
    .from('person_entitlements')
    .select('id, entitlement_key')
    .eq('person_id', personId)
    .eq('entitlement_key', 'journal')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1);

  if (entError) {
    console.error('[effectiveAccess] entitlement query error:', entError);
    // Fail closed on entitlement query; still attempt legacy only if we can
    // distinguish a hard failure — Package 2 keeps fail-closed semantics.
    return { allowed: false, grantSource: 'none', reason: 'no_active_grant' };
  }

  if ((ents?.length ?? 0) > 0) {
    return {
      allowed: true,
      grantSource: 'entitlement',
      reason: 'entitlement_active',
      entitlementKey: 'journal',
    };
  }

  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('person_id', personId)
    .eq('subscription_type', 'journal_access')
    .eq('is_active', true)
    .limit(1);

  if (subsError) {
    console.error('[effectiveAccess] legacy subscription query error:', subsError);
    return { allowed: false, grantSource: 'none', reason: 'no_active_grant' };
  }

  if ((subs?.length ?? 0) > 0) {
    return {
      allowed: true,
      grantSource: 'legacy_subscription_compat',
      reason: 'legacy_subscription_compat',
    };
  }

  return { allowed: false, grantSource: 'none', reason: 'no_active_grant' };
}

/**
 * True when the person already holds every entitlement key in `keys`
 * via normalized entitlements OR (for journal only) legacy subscription compat.
 */
export async function personHasEffectiveEntitlementKeys(
  personId: string,
  keys: string[],
): Promise<{ covered: boolean; grantSource: AccessGrantSource }> {
  if (keys.length === 0) {
    return { covered: true, grantSource: 'none' };
  }

  const now = new Date().toISOString();
  const { data: existingEnts, error } = await supabaseAdmin
    .from('person_entitlements')
    .select('entitlement_key')
    .eq('person_id', personId)
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .in('entitlement_key', keys);

  if (error) {
    console.error('[effectiveAccess] entitlement coverage query error:', error);
    return { covered: false, grantSource: 'none' };
  }

  const coveredKeys = new Set((existingEnts || []).map((e) => e.entitlement_key));
  if (keys.every((k) => coveredKeys.has(k))) {
    return { covered: true, grantSource: 'entitlement' };
  }

  // Legacy parity: a legacy journal_access subscription satisfies a journal key
  // only. Other entitlement keys still require normalized rows.
  const missing = keys.filter((k) => !coveredKeys.has(k));
  if (missing.length === 1 && missing[0] === 'journal') {
    const grant = await resolveJournalGrant(personId);
    if (grant.grantSource === 'legacy_subscription_compat') {
      return { covered: true, grantSource: 'legacy_subscription_compat' };
    }
  }

  return { covered: false, grantSource: 'none' };
}

export async function resolvePersonIdForAuthUser(
  authUserId: string,
): Promise<{ personId: string | null; metadata: Record<string, unknown> | null; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id, metadata')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    console.error('[effectiveAccess] person lookup error:', error);
    return { personId: null, metadata: null, error: error.message };
  }

  return {
    personId: data?.id ?? null,
    metadata: (data?.metadata as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Full authenticated access decision used by middleware and checkout bridges.
 */
export async function resolveEffectiveAccessForAuthUser(
  authUserId: string | null | undefined,
): Promise<EffectiveAccessDecision> {
  if (!authUserId) {
    return {
      status: 'unauthenticated',
      allowed: false,
      grantSource: 'none',
      personId: null,
      onboarding: EMPTY_ONBOARDING,
      reason: 'no_session',
    };
  }

  try {
    const person = await resolvePersonIdForAuthUser(authUserId);
    if (person.error) {
      return {
        status: 'resolution_error',
        allowed: false,
        grantSource: 'none',
        personId: null,
        authUserId,
        onboarding: EMPTY_ONBOARDING,
        reason: 'access_resolution_failed',
        errorMessage: person.error,
      };
    }

    if (!person.personId) {
      return {
        status: 'missing_person',
        allowed: false,
        grantSource: 'none',
        personId: null,
        authUserId,
        onboarding: EMPTY_ONBOARDING,
        reason: 'person_unresolved',
      };
    }

    const onboarding = deriveOnboardingState(person.metadata);
    const grant = await resolveJournalGrant(person.personId);

    if (!grant.allowed) {
      return {
        status: 'unauthorized',
        allowed: false,
        grantSource: 'none',
        personId: person.personId,
        authUserId,
        onboarding,
        reason: 'no_active_grant',
      };
    }

    return {
      status: 'authorized',
      allowed: true,
      grantSource: grant.grantSource as Exclude<AccessGrantSource, 'none'>,
      personId: person.personId,
      authUserId,
      onboarding,
      reason: grant.reason as 'entitlement_active' | 'legacy_subscription_compat',
      entitlementKey: grant.entitlementKey,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[effectiveAccess] unexpected resolution failure:', err);
    return {
      status: 'resolution_error',
      allowed: false,
      grantSource: 'none',
      personId: null,
      authUserId,
      onboarding: EMPTY_ONBOARDING,
      reason: 'access_resolution_failed',
      errorMessage: message,
    };
  }
}
