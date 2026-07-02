/**
 * Offer Grant Service — server-only shared helper.
 *
 * Single source of truth for granting an offer's entitlements to a person.
 * Used by:
 *   - POST /api/admin/offers/grant-to-person  (admin/editor grant)
 *   - POST /api/access-codes/claim            (authenticated access-code grant)
 *
 * Behaviour (preserved from the original admin grant endpoint):
 *   - Fetches active `offer_entitlements` rows for the offer.
 *   - Resolves effective mappings via `resolveEffectiveOfferEntitlementMappings`
 *     (database mappings win; code-owned supplements fill gaps for known offers).
 *   - For each mapping, inserts a `person_entitlements` row with
 *     source='offer', source_ref=offer_key, starts_at=now, and ends_at derived
 *     from duration_days when set.
 *   - Duplicate perpetual grants (unique-index hit, 23505) are skipped, not
 *     fatal. Time-limited grants may stack (ends_at set).
 *   - Runs program-assignment automation (`handleAdminOfferGrant`); failures
 *     there are non-fatal and surfaced via assignment_action/reason.
 *
 * Hard rules:
 *   - NEVER import from client code. Uses supabaseAdmin (service role).
 *   - Does NOT touch pricing, checkout, Stripe, or offer truth. It only reads
 *     offer_entitlements and writes person_entitlements (+ program_assignments
 *     via the automation helper).
 *   - person_id must belong to a known person. Callers are responsible for
 *     resolving the person before calling.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  resolveEffectiveOfferEntitlementMappings,
  type OfferEntitlementMapping,
  type EffectiveOfferEntitlementMapping,
} from '@/lib/access/offerEntitlementMappings';
import {
  handleAdminOfferGrant,
  type EnsureAssignmentAction,
} from '@/lib/plans/programAssignmentAutomationServerService';

if (typeof window !== 'undefined') {
  throw new Error(
    'offerGrantService.ts can only be imported in server contexts.',
  );
}

export interface GrantOfferToPersonArgs {
  personId: string;
  offerKey: string;
  /** auth.users id recorded as created_by/updated_by. null for system grants. */
  createdByUserId?: string | null;
  /** Optional free-text note stamped onto each person_entitlements row. */
  note?: string | null;
}

export interface GrantOfferToPersonResult {
  offerKey: string;
  personId: string;
  granted: Record<string, unknown>[];
  skipped: number;
  mappings: EffectiveOfferEntitlementMapping[];
  assignment_action: EnsureAssignmentAction | null;
  assignment_reason: string | null;
}

/** Thrown when the offer has zero effective active entitlement mappings. */
export class NoActiveEntitlementMappingsError extends Error {
  constructor(offerKey: string) {
    super(`No active entitlement mappings found for offer ${offerKey}`);
    this.name = 'NoActiveEntitlementMappingsError';
  }
}

export async function grantOfferToPerson(
  args: GrantOfferToPersonArgs,
): Promise<GrantOfferToPersonResult> {
  const { personId, offerKey } = args;
  const createdByUserId = args.createdByUserId ?? null;
  const note = args.note?.trim() || null;

  const { data: rawMappings, error: mapErr } = await supabaseAdmin
    .from('offer_entitlements')
    .select('entitlement_key, duration_days, is_active')
    .eq('offer_key', offerKey)
    .eq('is_active', true);

  if (mapErr) {
    throw new Error(`Failed to fetch offer entitlement mappings: ${mapErr.message}`);
  }

  const entitlementMappings = resolveEffectiveOfferEntitlementMappings(
    offerKey,
    (rawMappings ?? null) as OfferEntitlementMapping[] | null,
  );

  if (entitlementMappings.length === 0) {
    throw new NoActiveEntitlementMappingsError(offerKey);
  }

  const now = new Date();
  const granted: Record<string, unknown>[] = [];

  for (const mapping of entitlementMappings) {
    const row: Record<string, unknown> = {
      person_id: personId,
      entitlement_key: mapping.entitlement_key,
      is_active: true,
      starts_at: now.toISOString(),
      source: 'offer',
      source_ref: offerKey,
    };
    if (note) row.note = note;
    if (createdByUserId) {
      row.created_by = createdByUserId;
      row.updated_by = createdByUserId;
    }

    if (mapping.duration_days && mapping.duration_days > 0) {
      const endsAt = new Date(now);
      endsAt.setDate(endsAt.getDate() + mapping.duration_days);
      row.ends_at = endsAt.toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('person_entitlements')
      .insert(row)
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation on the perpetual-entitlement dedupe index.
      // Skip duplicates; surface any other insert error to the caller.
      if (error.code !== '23505') {
        throw new Error(`Failed to grant ${mapping.entitlement_key}: ${error.message}`);
      }
    } else if (data) {
      granted.push(data);
    }
  }

  // Program-assignment automation — non-fatal. Mirrors the original admin
  // grant endpoint behaviour.
  let assignment_action: EnsureAssignmentAction | null = null;
  let assignment_reason: string | null = null;
  try {
    const asn = await handleAdminOfferGrant({
      personId,
      offerKey,
      createdByUserId,
    });
    assignment_action = asn.action;
    assignment_reason = asn.reason;
  } catch (autoErr) {
    console.error('[offerGrantService] program_assignments automation threw:', autoErr);
  }

  return {
    offerKey,
    personId,
    granted,
    skipped: entitlementMappings.length - granted.length,
    mappings: entitlementMappings,
    assignment_action,
    assignment_reason,
  };
}
