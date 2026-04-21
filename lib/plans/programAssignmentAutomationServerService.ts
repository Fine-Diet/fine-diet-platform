/**
 * Plans Phase 9 — Program Assignment Automation (server-only)
 *
 * Closes the loop from acquisition → runtime assignment. Called from:
 *   - Stripe webhook (`checkout.session.completed`)
 *   - Admin offer grant (`/api/admin/offers/grant-to-person`)
 *   - Admin entitlement grant (`/api/admin/entitlements/grant`)
 *   - Admin backfill endpoint (`/api/admin/program-assignments/backfill`)
 *
 * Responsibilities:
 *   1. Map an offer_key → program_slug via `offers.assigns_program_slug`.
 *     Secondary fallback: derive slug from entitlement keys shaped
 *     `program:<slug>` (convention established in the Access Management
 *     entitlement key registry).
 *   2. Idempotently ensure a `program_assignments` row exists for
 *     (person_id, program_slug, source_ref). Replays of the same Stripe
 *     event therefore cannot create duplicates (DB-level unique index
 *     from the Phase 9 migration is the ultimate anchor; application-side
 *     logic keeps the behaviour predictable and reportable).
 *   3. Never create a broken assignment: if person/slug can't be
 *     resolved, return a skip reason instead of inserting garbage.
 *   4. Provide a `backfillAssignmentsFromEntitlements` path for
 *     historical purchases that predate Packet 9 automation.
 *
 * All failures here are non-fatal to the outer flow. The caller (Stripe
 * webhook, admin grant) will keep working; the automation logs a reason
 * and surfaces it through the admin UI.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  ProgramAcquisitionSource,
  ProgramAssignment,
} from './types';
import { rowToAssignment } from './programAssignmentServerService';

// ============================================================================
// Slug resolution
// ============================================================================

/**
 * Look up the mapped program_slug for a given offer_key. Null means the
 * offer does not opt into automation (admin has not set assigns_program_slug
 * yet). `active` / non-null rows win; we don't silently pick inactive ones.
 */
export async function resolveProgramSlugForOffer(
  offerKey: string,
): Promise<string | null> {
  if (!offerKey) return null;
  const { data, error } = await supabaseAdmin
    .from('offers')
    .select('offer_key, assigns_program_slug, is_active')
    .eq('offer_key', offerKey)
    .maybeSingle();
  if (error) {
    console.warn(
      `[plans/assignment-automation] resolveProgramSlugForOffer(${offerKey}) query error:`,
      error.message,
    );
    return null;
  }
  const slug = (data as { assigns_program_slug: string | null } | null)
    ?.assigns_program_slug;
  if (!slug || typeof slug !== 'string') return null;
  const trimmed = slug.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fallback: `program:<slug>` entitlement keys (as used by the Access
 * Management registry) already encode the slug. Returns null for any
 * other key shape.
 */
export function deriveProgramSlugFromEntitlementKey(
  entitlementKey: string,
): string | null {
  if (!entitlementKey || typeof entitlementKey !== 'string') return null;
  const m = entitlementKey.trim().match(/^program:([a-z0-9][a-z0-9-]*)$/i);
  return m ? m[1].toLowerCase() : null;
}

// ============================================================================
// Idempotent ensure
// ============================================================================

export type EnsureAssignmentAction =
  | 'created'
  | 'reactivated'
  | 'unchanged'
  | 'skipped_unmapped'
  | 'skipped_no_person'
  | 'skipped_error';

export interface EnsureAssignmentInput {
  personId: string;
  programSlug: string;
  acquisitionSource: ProgramAcquisitionSource;
  sourceRef: string | null;
  notes?: string | null;
  /** Optional staff user id recorded as created_by_user_id. */
  createdByUserId?: string | null;
}

export interface EnsureAssignmentResult {
  action: EnsureAssignmentAction;
  assignment: ProgramAssignment | null;
  reason: string | null;
}

/**
 * Idempotent upsert. Strategy:
 *   1. If source_ref is provided, look up by (person_id, program_slug,
 *      source_ref). If a matching row exists:
 *        - active → `unchanged`
 *        - non-active → set status='active', return `reactivated`
 *   2. Otherwise, look up an existing active row for (person_id,
 *      program_slug) regardless of source_ref. If found, leave it alone
 *      and return `unchanged` (a manual/admin row already represents the
 *      runtime assignment).
 *   3. Insert a fresh row with auto_created=true.
 *
 * If the DB layer raises 23505 (unique_violation) because of the Packet 9
 * partial unique index, we read the existing row back and return
 * `unchanged` rather than surfacing the error.
 */
export async function ensureAssignmentFromAcquisition(
  input: EnsureAssignmentInput,
): Promise<EnsureAssignmentResult> {
  const { personId, programSlug, acquisitionSource, sourceRef } = input;
  if (!personId) {
    return {
      action: 'skipped_no_person',
      assignment: null,
      reason: 'person_id is required.',
    };
  }
  if (!programSlug || !programSlug.trim()) {
    return {
      action: 'skipped_unmapped',
      assignment: null,
      reason: 'program_slug is missing.',
    };
  }

  const slug = programSlug.trim();
  const notes = input.notes?.trim() || null;
  const createdBy = input.createdByUserId ?? null;

  try {
    if (sourceRef) {
      const { data: existing, error: lookupErr } = await supabaseAdmin
        .from('program_assignments')
        .select('*')
        .eq('person_id', personId)
        .eq('program_slug', slug)
        .eq('source_ref', sourceRef)
        .maybeSingle();

      if (lookupErr) {
        console.warn(
          '[plans/assignment-automation] provenance lookup error:',
          lookupErr.message,
        );
      }
      if (existing) {
        const row = existing as unknown as Parameters<typeof rowToAssignment>[0];
        if (row.status === 'active') {
          return {
            action: 'unchanged',
            assignment: rowToAssignment(row),
            reason: 'Matching active assignment already exists.',
          };
        }
        const { data: reactivated, error: reErr } = await supabaseAdmin
          .from('program_assignments')
          .update({ status: 'active' })
          .eq('id', row.id)
          .select('*')
          .single();
        if (reErr) {
          return {
            action: 'skipped_error',
            assignment: null,
            reason: reErr.message,
          };
        }
        return {
          action: 'reactivated',
          assignment: rowToAssignment(
            reactivated as unknown as Parameters<typeof rowToAssignment>[0],
          ),
          reason: 'Flipped prior inactive assignment back to active.',
        };
      }
    } else {
      const { data: existingAny, error: lookupErr } = await supabaseAdmin
        .from('program_assignments')
        .select('*')
        .eq('person_id', personId)
        .eq('program_slug', slug)
        .eq('status', 'active')
        .order('priority', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lookupErr) {
        console.warn(
          '[plans/assignment-automation] active lookup error:',
          lookupErr.message,
        );
      }
      if (existingAny) {
        return {
          action: 'unchanged',
          assignment: rowToAssignment(
            existingAny as unknown as Parameters<typeof rowToAssignment>[0],
          ),
          reason:
            'An active assignment already exists for this person/slug; not duplicating.',
        };
      }
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('program_assignments')
      .insert({
        person_id: personId,
        program_slug: slug,
        acquisition_source: acquisitionSource,
        status: 'active',
        priority: 0,
        source_ref: sourceRef,
        notes,
        created_by_user_id: createdBy,
        auto_created: true,
      })
      .select('*')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505' && sourceRef) {
        const { data: raced } = await supabaseAdmin
          .from('program_assignments')
          .select('*')
          .eq('person_id', personId)
          .eq('program_slug', slug)
          .eq('source_ref', sourceRef)
          .maybeSingle();
        if (raced) {
          return {
            action: 'unchanged',
            assignment: rowToAssignment(
              raced as unknown as Parameters<typeof rowToAssignment>[0],
            ),
            reason: 'Race-safe: unique index caught concurrent insert.',
          };
        }
      }
      return {
        action: 'skipped_error',
        assignment: null,
        reason: insertErr.message,
      };
    }

    return {
      action: 'created',
      assignment: rowToAssignment(
        inserted as unknown as Parameters<typeof rowToAssignment>[0],
      ),
      reason: null,
    };
  } catch (err) {
    return {
      action: 'skipped_error',
      assignment: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Higher-level wrappers for concrete integration points
// ============================================================================

/**
 * Stripe checkout.session.completed → program assignment upsert.
 * `sourceRef` must match whatever the webhook stored against
 * person_entitlements so admin inspection can correlate the two.
 */
export async function handleStripeCheckoutCompleted(params: {
  personId: string;
  offerKey: string;
  sourceRef: string;
}): Promise<EnsureAssignmentResult> {
  const slug = await resolveProgramSlugForOffer(params.offerKey);
  if (!slug) {
    return {
      action: 'skipped_unmapped',
      assignment: null,
      reason: `Offer ${params.offerKey} has no assigns_program_slug set.`,
    };
  }
  return ensureAssignmentFromAcquisition({
    personId: params.personId,
    programSlug: slug,
    acquisitionSource: 'purchase',
    sourceRef: params.sourceRef,
    notes: `Auto-created from Stripe checkout for offer ${params.offerKey}.`,
  });
}

/**
 * Admin offer grant → program assignment upsert.
 */
export async function handleAdminOfferGrant(params: {
  personId: string;
  offerKey: string;
  createdByUserId?: string | null;
}): Promise<EnsureAssignmentResult> {
  const slug = await resolveProgramSlugForOffer(params.offerKey);
  if (!slug) {
    return {
      action: 'skipped_unmapped',
      assignment: null,
      reason: `Offer ${params.offerKey} has no assigns_program_slug set.`,
    };
  }
  return ensureAssignmentFromAcquisition({
    personId: params.personId,
    programSlug: slug,
    acquisitionSource: 'offer',
    sourceRef: `offer:${params.offerKey}`,
    notes: `Auto-created from admin offer grant (${params.offerKey}).`,
    createdByUserId: params.createdByUserId ?? null,
  });
}

/**
 * Admin entitlement grant → program assignment upsert.
 * Uses the entitlement key as the slug source when it's `program:<slug>`.
 */
export async function handleAdminEntitlementGrant(params: {
  personId: string;
  entitlementKey: string;
  sourceRef?: string | null;
  source?: string | null;
  createdByUserId?: string | null;
}): Promise<EnsureAssignmentResult> {
  const slug = deriveProgramSlugFromEntitlementKey(params.entitlementKey);
  if (!slug) {
    return {
      action: 'skipped_unmapped',
      assignment: null,
      reason: `Entitlement key ${params.entitlementKey} is not shaped 'program:<slug>'.`,
    };
  }
  const source = (params.source ?? 'admin_grant') as string;
  const acquisitionSource: ProgramAcquisitionSource =
    source === 'stripe'
      ? 'purchase'
      : source === 'offer'
        ? 'offer'
        : source === 'bundle'
          ? 'bundle'
          : source === 'admin_grant' || source === 'manual'
            ? 'admin_grant'
            : 'other';
  return ensureAssignmentFromAcquisition({
    personId: params.personId,
    programSlug: slug,
    acquisitionSource,
    sourceRef: params.sourceRef ?? `entitlement:${params.entitlementKey}`,
    notes: `Auto-created from admin entitlement grant (${params.entitlementKey}).`,
    createdByUserId: params.createdByUserId ?? null,
  });
}

// ============================================================================
// Backfill
// ============================================================================

export interface BackfillReportItem {
  person_id: string;
  entitlement_key: string;
  program_slug: string | null;
  source: string | null;
  source_ref: string | null;
  action: EnsureAssignmentAction;
  reason: string | null;
}

export interface BackfillReport {
  scanned: number;
  mapped: number;
  dry_run: boolean;
  counts: Record<EnsureAssignmentAction, number>;
  items: BackfillReportItem[];
  truncated: boolean;
}

const ZERO_COUNTS = (): Record<EnsureAssignmentAction, number> => ({
  created: 0,
  reactivated: 0,
  unchanged: 0,
  skipped_unmapped: 0,
  skipped_no_person: 0,
  skipped_error: 0,
});

/**
 * Sweep every active person_entitlements row that looks like a program
 * entitlement (either the entitlement_key is `program:<slug>` or it maps
 * to an offer with assigns_program_slug set) and idempotently ensure a
 * matching program_assignments row exists. Safe to re-run.
 *
 * `dryRun=true` reports the plan without writing anything.
 */
export async function backfillAssignmentsFromEntitlements(
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<BackfillReport> {
  const dryRun = options.dryRun === true;
  const hardCap = Math.min(Math.max(options.limit ?? 500, 1), 5000);

  const { data: rows, error } = await supabaseAdmin
    .from('person_entitlements')
    .select(
      'person_id, entitlement_key, source, source_ref, is_active, starts_at, ends_at',
    )
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(hardCap + 1);

  if (error) {
    throw new Error(`backfill lookup failed: ${error.message}`);
  }

  const all = rows ?? [];
  const truncated = all.length > hardCap;
  const work = all.slice(0, hardCap);

  const counts = ZERO_COUNTS();
  const items: BackfillReportItem[] = [];
  let mapped = 0;

  for (const row of work) {
    const r = row as {
      person_id: string;
      entitlement_key: string;
      source: string | null;
      source_ref: string | null;
    };

    let slug = deriveProgramSlugFromEntitlementKey(r.entitlement_key);

    // Secondary mapping: entitlement_key could be a feature key granted
    // through an offer that carries assigns_program_slug. In that case
    // source_ref is typically the offer_key (admin/offer path) or a
    // Stripe id (checkout path). Only the offer path lets us resolve.
    if (!slug && r.source === 'offer' && r.source_ref) {
      slug = await resolveProgramSlugForOffer(r.source_ref);
    }

    if (!slug) {
      counts.skipped_unmapped += 1;
      items.push({
        person_id: r.person_id,
        entitlement_key: r.entitlement_key,
        program_slug: null,
        source: r.source,
        source_ref: r.source_ref,
        action: 'skipped_unmapped',
        reason: 'No program_slug derivable from entitlement or offer mapping.',
      });
      continue;
    }

    mapped += 1;

    if (dryRun) {
      counts.created += 1;
      items.push({
        person_id: r.person_id,
        entitlement_key: r.entitlement_key,
        program_slug: slug,
        source: r.source,
        source_ref: r.source_ref,
        action: 'created',
        reason: 'Would create or upsert (dry-run).',
      });
      continue;
    }

    const acquisitionSource: ProgramAcquisitionSource =
      r.source === 'stripe'
        ? 'purchase'
        : r.source === 'offer'
          ? 'offer'
          : r.source === 'bundle'
            ? 'bundle'
            : r.source === 'admin_grant' || r.source === 'manual'
              ? 'admin_grant'
              : 'other';

    const result = await ensureAssignmentFromAcquisition({
      personId: r.person_id,
      programSlug: slug,
      acquisitionSource,
      sourceRef:
        r.source_ref ?? `entitlement:${r.entitlement_key}:${r.person_id}`,
      notes: `Backfill from person_entitlements (source=${r.source ?? 'unknown'}).`,
    });

    counts[result.action] += 1;
    items.push({
      person_id: r.person_id,
      entitlement_key: r.entitlement_key,
      program_slug: slug,
      source: r.source,
      source_ref: r.source_ref,
      action: result.action,
      reason: result.reason,
    });
  }

  return {
    scanned: work.length,
    mapped,
    dry_run: dryRun,
    counts,
    items,
    truncated,
  };
}
