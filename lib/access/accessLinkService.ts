/**
 * Access Link Service — server-only person_access_links helpers
 *
 * Checks whether one person (grantee) has been granted access to
 * another person's (granter) data via person_access_links.
 *
 * All queries use supabaseAdmin (service_role) so they bypass RLS —
 * the same pattern used by journalServerService and other server helpers.
 *
 * NEVER import this file from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { UserRole } from '@/lib/authServer';

// ============================================================================
// Core access link check
// ============================================================================

export type AccessLinkScope = 'journal_read' | 'journal_write' | 'client_admin';

/**
 * Check whether grantee currently holds an active access link for
 * the given granter + scope.
 *
 * Queries `person_access_links` with time-window filtering:
 *   - is_active = true
 *   - starts_at <= now
 *   - ends_at is null OR ends_at > now
 */
export async function hasAccessLink(
  granteePersonId: string,
  granterPersonId: string,
  scope: AccessLinkScope = 'journal_read',
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('person_access_links')
    .select('id')
    .eq('grantee_person_id', granteePersonId)
    .eq('granter_person_id', granterPersonId)
    .eq('scope', scope)
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1);

  if (error) {
    console.error('[AccessLinkService] hasAccessLink query error:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

// ============================================================================
// Higher-level authorization
// ============================================================================

/**
 * Determine whether a user can act on a client's data for the given scope.
 *
 * Rules:
 *   1. Admins always can (existing behaviour, generalised).
 *   2. Otherwise, require an active person_access_links row.
 */
export async function canActOnClient(
  userRole: UserRole,
  granteePersonId: string,
  granterPersonId: string,
  scope: AccessLinkScope = 'journal_read',
): Promise<boolean> {
  // Admins bypass access links (existing admin override, generalised)
  if (userRole === 'admin') {
    return true;
  }

  return hasAccessLink(granteePersonId, granterPersonId, scope);
}
