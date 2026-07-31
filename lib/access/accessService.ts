/**
 * Access Service — server-only entitlements + journal access helpers
 *
 * Package 2 contract:
 *   1. person_entitlements is normalized product-access truth
 *   2. Legacy subscriptions remain an explicit compatibility shim only
 *
 * Prefer `resolveJournalGrant` / `resolveEffectiveAccessForAuthUser` from
 * `effectiveAccess.ts` for new call sites that need grant source.
 *
 * NEVER import this file from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { resolveJournalGrant } from './effectiveAccess';

/**
 * Check whether a person currently holds an active entitlement.
 *
 * Multi-row safe: a person may have multiple person_entitlements rows for
 * the same key. Returns true if ANY qualifying row exists.
 */
export async function hasEntitlement(
  personId: string,
  entitlementKey: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('person_entitlements')
    .select('id')
    .eq('person_id', personId)
    .eq('entitlement_key', entitlementKey)
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1);

  if (error) {
    console.error('[AccessService] hasEntitlement query error:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Determine whether a person can access the journal / signed-in app.
 * Boolean wrapper over the typed Package 2 grant resolver (entitlement first,
 * then legacy subscription compatibility).
 */
export async function hasJournalAccess(personId: string): Promise<boolean> {
  const grant = await resolveJournalGrant(personId);
  return grant.allowed;
}
