/**
 * Access-state resolver — server-only.
 *
 * Resolves a person to a single subscription state and the capability gates it
 * grants. This is the central place the /start + /upgrade surfaces and tool
 * locks consult.
 *
 * v1 mapping (placeholder-friendly; refine as billing data matures):
 *   - practitioner gate / care:integrative   -> 'practitioner' (full app + care)
 *   - active journal access (sub or trial)    -> 'subscriber' (full active tools)
 *       (trial-vs-paid distinction is a TODO; both currently grant full tools)
 *   - has a person record but no active access -> 'data_access_only' (read-only)
 *   - otherwise                                -> 'none'
 *
 * NEVER import this file from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { hasEntitlement, hasJournalAccess } from './accessService';
import type { AppAccessStateName } from './accessStateTypes';
import {
  ACTION_GATES,
  PRACTITIONER_GATE,
  VIEW_GATES,
  type CapabilityGate,
} from './capabilityGates';

export interface ResolvedAccessState {
  state: AppAccessStateName;
  /** Active tools (create/generate/start) usable? */
  canUseActiveTools: boolean;
  /** Account + saved data readable? */
  canViewSavedData: boolean;
  isPractitionerSupported: boolean;
  /** Capability gates effectively granted by this state. */
  grantedGates: CapabilityGate[];
}

/** Map a resolved state to the capability gates it grants. */
export function gatesForState(state: AppAccessStateName): CapabilityGate[] {
  switch (state) {
    case 'practitioner':
      return [...VIEW_GATES, ...ACTION_GATES, PRACTITIONER_GATE];
    case 'subscriber':
    case 'trialing':
      return [...VIEW_GATES, ...ACTION_GATES];
    case 'data_access_only':
      return [...VIEW_GATES];
    case 'none':
    default:
      return [];
  }
}

function buildResolved(state: AppAccessStateName): ResolvedAccessState {
  const grantedGates = gatesForState(state);
  return {
    state,
    canUseActiveTools: state === 'subscriber' || state === 'trialing' || state === 'practitioner',
    canViewSavedData: grantedGates.length > 0 || state === 'data_access_only',
    isPractitionerSupported: state === 'practitioner',
    grantedGates,
  };
}

/**
 * Determine whether a person record exists at all (for data_access_only).
 * Returns true if a `people` row with this id exists.
 */
async function personExists(personId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('id', personId)
    .limit(1);
  if (error) {
    console.error('[accessState] personExists query error:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Resolve the access state for a person id.
 */
export async function resolveAccessStateForPerson(
  personId: string | null | undefined,
): Promise<ResolvedAccessState> {
  if (!personId) return buildResolved('none');

  // Practitioner-supported takes precedence (premium layered above baseline).
  const practitioner =
    (await hasEntitlement(personId, PRACTITIONER_GATE)) ||
    (await hasEntitlement(personId, 'care:integrative'));
  if (practitioner) return buildResolved('practitioner');

  // Active app access (subscription or trial). TODO: split trialing vs subscriber
  // once trial windows are tracked in billing data.
  const hasApp = await hasJournalAccess(personId);
  if (hasApp) return buildResolved('subscriber');

  // Known person but no active access -> keep account + saved data, lock tools.
  if (await personExists(personId)) return buildResolved('data_access_only');

  return buildResolved('none');
}
