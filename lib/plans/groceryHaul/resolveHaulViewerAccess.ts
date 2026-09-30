/**
 * Database-backed Haul membership resolution (Invite to Haul v1).
 *
 * Shared by API guards and middleware so contributor vs owner semantics cannot
 * drift. Intentionally free of invitation email / delivery dependencies.
 *
 * NEVER import from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { HAUL_INVITATIONS_TABLE } from './schema';

export type HaulViewerRole = 'owner' | 'contributor';

export interface HaulViewerAccess {
  role: HaulViewerRole;
  haulId: string;
  ownerPersonId: string;
  actorPersonId: string;
}

/**
 * Resolve the caller's role on a Haul from the database.
 *
 *  - owner:       grocery_hauls.person_id = caller
 *  - contributor: an ACCEPTED grocery_haul_invitations row for the caller
 *  - null:        anything else (including pending, revoked, or unknown Hauls)
 *
 * Callers must treat null as "not found" (404), never as "forbidden", so Haul
 * existence is not disclosed to non-members.
 */
export async function resolveHaulViewerAccess(
  actorPersonId: string,
  haulId: string,
): Promise<HaulViewerAccess | null> {
  const { data: haul, error } = await supabaseAdmin
    .from('grocery_hauls')
    .select('id, person_id')
    .eq('id', haulId)
    .maybeSingle();
  if (error) throw new Error(`Failed to resolve Haul access: ${error.message}`);
  if (!haul) return null;

  const ownerPersonId = String(haul.person_id);
  if (ownerPersonId === actorPersonId) {
    return { role: 'owner', haulId, ownerPersonId, actorPersonId };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from(HAUL_INVITATIONS_TABLE)
    .select('id')
    .eq('haul_id', haulId)
    .eq('invited_person_id', actorPersonId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (membershipError) {
    throw new Error(`Failed to resolve Haul membership: ${membershipError.message}`);
  }
  if (!membership) return null;
  return { role: 'contributor', haulId, ownerPersonId, actorPersonId };
}
