/**
 * Access Service — server-only entitlements + journal access helpers
 *
 * Provides the "compat shim" layer:
 *   1. Check legacy subscriptions (journal_access) first
 *   2. Then check new person_entitlements
 *
 * All queries use supabaseAdmin (service_role) so they bypass RLS —
 * the same pattern used by journalServerService and other server helpers.
 *
 * NEVER import this file from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

// ============================================================================
// Core entitlement check
// ============================================================================

/**
 * Check whether a person currently holds an active entitlement.
 *
 * Queries `person_entitlements` with time-window filtering:
 *   - is_active = true
 *   - starts_at <= now
 *   - ends_at is null OR ends_at > now
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

// ============================================================================
// Journal access — compat shim
// ============================================================================

/**
 * Determine whether a person can access the journal.
 *
 * Strategy (compat shim — preserves existing behaviour):
 *   1. Check legacy subscriptions table:
 *        subscription_type = 'journal_access' AND is_active = true
 *      → if found, return true immediately.
 *   2. Otherwise fall through to person_entitlements:
 *        entitlement_key = 'journal'
 *      → return result of hasEntitlement().
 *
 * This allows a zero-downtime migration: existing subscribers keep working,
 * and new entitlements are recognised as soon as they are inserted.
 *
 * TODO (migration-assist): Once all existing subscription rows have been
 * backfilled into person_entitlements, the subscriptions leg of this check
 * can be removed. Do NOT run bulk backfill until explicitly requested.
 */
export async function hasJournalAccess(personId: string): Promise<boolean> {
  // --- Leg 1: legacy subscriptions -------------------------------------------
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('person_id', personId)
    .eq('subscription_type', 'journal_access')
    .eq('is_active', true)
    .limit(1);

  if (subsError) {
    console.error('[AccessService] subscriptions query error:', subsError);
    // Don't fail open — fall through to entitlements check
  }

  if (subs && subs.length > 0) {
    return true;
  }

  // --- Leg 2: new entitlements -----------------------------------------------
  return hasEntitlement(personId, 'journal');
}
