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
 *   - prior access history, now inactive       -> 'data_access_only' (read-only)
 *   - known person without prior history       -> 'registered_no_access'
 *   - otherwise                                -> 'none'
 *
 * NEVER import this file from client/browser code.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { hasEntitlement, hasJournalAccess } from './accessService';
import type { AccessStateReason, AppAccessStateName } from './accessStateTypes';
import {
  ACTION_GATES,
  PRACTITIONER_GATE,
  VIEW_GATES,
  type CapabilityGate,
} from './capabilityGates';

export interface ResolvedAccessState {
  state: AppAccessStateName;
  /** Why this state was selected. */
  reason: AccessStateReason;
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
    case 'registered_no_access':
    case 'none':
    default:
      return [];
  }
}

function buildResolved(
  state: AppAccessStateName,
  reason: AccessStateReason,
): ResolvedAccessState {
  const grantedGates = gatesForState(state);
  return {
    state,
    reason,
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

interface PriorAccessHistory {
  hasHistory: boolean;
  reason: Extract<
    AccessStateReason,
    | 'expired_trial'
    | 'lapsed_subscription'
    | 'canceled_subscription'
    | 'past_due_subscription'
    | 'former_practitioner_or_program_user'
  >;
}

function reasonFromStripeStatus(status: string | null | undefined): PriorAccessHistory['reason'] {
  switch (status) {
    case 'canceled':
      return 'canceled_subscription';
    case 'past_due':
      return 'past_due_subscription';
    case 'ended':
      return 'lapsed_subscription';
    default:
      return 'lapsed_subscription';
  }
}

function reasonFromEntitlementRow(row: {
  entitlement_key?: string | null;
  source?: string | null;
  note?: string | null;
}): PriorAccessHistory['reason'] {
  const key = row.entitlement_key ?? '';
  const source = row.source ?? '';
  const note = row.note ?? '';
  const searchable = `${source} ${note}`.toLowerCase();

  if (searchable.includes('trial')) return 'expired_trial';
  if (key.startsWith('care:') || key.startsWith('program:')) {
    return 'former_practitioner_or_program_user';
  }
  if (source === 'stripe') return 'lapsed_subscription';
  return 'former_practitioner_or_program_user';
}

/**
 * Determine whether this person has evidence of prior app/trial/subscription
 * access. This is intentionally conservative: query failures or missing history
 * return "no history" so known users do not get lapsed/data-only framing unless
 * the database proves prior access.
 */
async function getPriorAccessHistory(personId: string): Promise<PriorAccessHistory | null> {
  const now = new Date().toISOString();

  const { data: entitlements, error: entitlementError } = await supabaseAdmin
    .from('person_entitlements')
    .select('entitlement_key, source, note, ends_at, is_active')
    .eq('person_id', personId)
    .or(`is_active.eq.false,ends_at.lte.${now}`)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (entitlementError) {
    console.error('[accessState] prior entitlement history query error:', entitlementError);
  } else if (entitlements && entitlements.length > 0) {
    return {
      hasHistory: true,
      reason: reasonFromEntitlementRow(entitlements[0]),
    };
  }

  const { data: stripeInstances, error: stripeError } = await supabaseAdmin
    .from('stripe_offer_instances')
    .select('status')
    .eq('person_id', personId)
    .in('status', ['ended', 'canceled', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1);

  if (stripeError) {
    console.error('[accessState] prior Stripe instance query error:', stripeError);
  } else if (stripeInstances && stripeInstances.length > 0) {
    return {
      hasHistory: true,
      reason: reasonFromStripeStatus(stripeInstances[0].status),
    };
  }

  const { data: legacySubscriptions, error: legacyError } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('person_id', personId)
    .eq('subscription_type', 'journal_access')
    .eq('is_active', false)
    .limit(1);

  if (legacyError) {
    console.error('[accessState] prior legacy subscription query error:', legacyError);
  } else if (legacySubscriptions && legacySubscriptions.length > 0) {
    return {
      hasHistory: true,
      reason: 'lapsed_subscription',
    };
  }

  return null;
}

/**
 * Resolve the access state for a person id.
 */
export async function resolveAccessStateForPerson(
  personId: string | null | undefined,
): Promise<ResolvedAccessState> {
  if (!personId) return buildResolved('none', 'no_person_record');

  // Practitioner-supported takes precedence (premium layered above baseline).
  const practitioner =
    (await hasEntitlement(personId, PRACTITIONER_GATE)) ||
    (await hasEntitlement(personId, 'care:integrative'));
  if (practitioner) return buildResolved('practitioner', 'practitioner_supported');

  // Active app access (subscription or trial). TODO: split trialing vs subscriber
  // once trial windows are tracked in billing data.
  const hasApp = await hasJournalAccess(personId);
  if (hasApp) return buildResolved('subscriber', 'active_subscription');

  const priorAccess = await getPriorAccessHistory(personId);
  if (priorAccess?.hasHistory) {
    return buildResolved('data_access_only', priorAccess.reason);
  }

  // Known person but no access history: subscription framing, not lapsed-user framing.
  if (await personExists(personId)) {
    return buildResolved('registered_no_access', 'known_person_no_offer_history');
  }

  return buildResolved('none', 'no_person_record');
}
