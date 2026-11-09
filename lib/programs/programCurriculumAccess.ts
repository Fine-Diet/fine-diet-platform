/**
 * Shared current-access decision for paid program curriculum.
 *
 * Service-role routes bypass RLS, so detail, delivery, library progress,
 * and progress writes must apply the same rule as
 * programs_private.current_user_has_program_access before reading
 * program_modules, program_content_items, or program_delivery_modules.
 *
 * Stripe checkout stores one source_ref on both person_entitlements and
 * the purchase program_assignments row: subscription id, otherwise
 * payment intent id, otherwise checkout session id. Comparison is exact.
 * A session id is never compared to a subscription id.
 *
 * A current program:<slug> entitlement (stripe, admin_grant, manual,
 * offer, or migration) authorizes on its own. Independent assignment
 * sources — admin_grant (including manual/comped automation), offer,
 * bundle, and other — authorize when active and in window.
 * acquisition_source = purchase never authorizes by itself. It matches
 * only a current Stripe entitlement for the same person and
 * program:<slug> with the same non-blank source_ref. Rows passed to the
 * pure helper must already be limited to that person.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  ProgramAcquisitionSource,
  ProgramAssignment,
} from '@/lib/plans/types';

export const INDEPENDENT_PROGRAM_ASSIGNMENT_SOURCES = [
  'admin_grant',
  'offer',
  'bundle',
  'other',
] as const satisfies readonly ProgramAcquisitionSource[];

const INDEPENDENT_PROGRAM_ASSIGNMENT_SOURCE_SET = new Set<string>(
  INDEPENDENT_PROGRAM_ASSIGNMENT_SOURCES,
);

export interface CurriculumEntitlementRef {
  entitlement_key: string;
  source: string | null;
  source_ref: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
}

export interface CurriculumAssignmentRef {
  program_slug: string;
  acquisition_source: string;
  status: string;
  active_from: string | null;
  active_to: string | null;
  source_ref: string | null;
}

function timeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isCurrentEntitlementWindow(
  startsAt: string,
  endsAt: string | null,
  nowMs: number,
): boolean {
  const starts = timeMs(startsAt);
  if (starts === null || starts > nowMs) return false;
  if (endsAt == null) return true;
  const ends = timeMs(endsAt);
  if (ends === null) return false;
  return ends > nowMs;
}

function isActiveInWindow(
  assignment: CurriculumAssignmentRef,
  nowMs: number,
): boolean {
  if (assignment.status !== 'active') return false;
  if (assignment.active_from) {
    const activeFrom = timeMs(assignment.active_from);
    if (activeFrom === null || activeFrom > nowMs) return false;
  }
  if (assignment.active_to) {
    const activeTo = timeMs(assignment.active_to);
    if (activeTo === null || activeTo <= nowMs) return false;
  }
  return true;
}

/**
 * Blank source_ref values fail closed. Non-blank values stay exact,
 * including surrounding spaces, so a padded id cannot match the raw
 * Stripe id.
 */
export function exactNonBlankSourceRef(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  if (value.trim() === '') return null;
  return value;
}

export function assignmentIndependentlyAuthorizesCurriculum(
  assignment: CurriculumAssignmentRef,
  programSlug: string,
  now: Date = new Date(),
): boolean {
  const slug = programSlug.trim().toLowerCase();
  if (!slug || assignment.program_slug.trim().toLowerCase() !== slug) return false;
  if (!INDEPENDENT_PROGRAM_ASSIGNMENT_SOURCE_SET.has(assignment.acquisition_source)) {
    return false;
  }
  return isActiveInWindow(assignment, now.getTime());
}

/**
 * Purchase-assignment correlation only. A current entitlement of any
 * source still authorizes through hasCurrentProgramCurriculumAccess
 * even when this returns false.
 */
export function purchaseAssignmentCorrelatesWithStripeEntitlement(
  assignment: CurriculumAssignmentRef,
  entitlements: readonly CurriculumEntitlementRef[],
  programSlug: string,
  now: Date = new Date(),
): boolean {
  const slug = programSlug.trim().toLowerCase();
  if (!slug || assignment.program_slug.trim().toLowerCase() !== slug) return false;
  if (assignment.acquisition_source !== 'purchase') return false;
  if (!isActiveInWindow(assignment, now.getTime())) return false;
  const sourceRef = exactNonBlankSourceRef(assignment.source_ref);
  if (!sourceRef) return false;
  const entitlementKey = `program:${slug}`;
  const nowMs = now.getTime();
  return entitlements.some((entitlement) =>
    entitlement.entitlement_key === entitlementKey
    && entitlement.source === 'stripe'
    && entitlement.is_active === true
    && isCurrentEntitlementWindow(entitlement.starts_at, entitlement.ends_at, nowMs)
    && exactNonBlankSourceRef(entitlement.source_ref) === sourceRef
  );
}

export function hasCurrentProgramCurriculumAccess(input: {
  programSlug: string;
  entitlements: readonly CurriculumEntitlementRef[];
  assignments: readonly CurriculumAssignmentRef[];
  now?: Date;
}): boolean {
  const slug = input.programSlug.trim().toLowerCase();
  if (!slug) return false;
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const entitlementKey = `program:${slug}`;
  const currentEntitlement = input.entitlements.some((entitlement) =>
    entitlement.entitlement_key === entitlementKey
    && entitlement.is_active === true
    && isCurrentEntitlementWindow(entitlement.starts_at, entitlement.ends_at, nowMs)
  );
  if (currentEntitlement) return true;
  if (
    input.assignments.some((assignment) =>
      assignmentIndependentlyAuthorizesCurriculum(assignment, slug, now)
    )
  ) {
    return true;
  }
  return input.assignments.some((assignment) =>
    purchaseAssignmentCorrelatesWithStripeEntitlement(
      assignment,
      input.entitlements,
      slug,
      now,
    )
  );
}

export function toCurriculumAssignmentRef(
  assignment: Pick<
    ProgramAssignment,
    | 'program_slug'
    | 'acquisition_source'
    | 'status'
    | 'active_from'
    | 'active_to'
    | 'source_ref'
  >,
): CurriculumAssignmentRef {
  return {
    program_slug: assignment.program_slug,
    acquisition_source: assignment.acquisition_source,
    status: assignment.status,
    active_from: assignment.active_from,
    active_to: assignment.active_to,
    source_ref: assignment.source_ref,
  };
}

/**
 * Fail closed when either lookup errors. listAssignments is intentionally
 * not used here so management callers keep their unfiltered list.
 */
export async function personHasCurrentProgramCurriculumAccess(
  personId: string,
  programSlug: string,
  now: Date = new Date(),
): Promise<boolean> {
  const slug = programSlug.trim().toLowerCase();
  if (!personId || !slug) return false;
  const nowIso = now.toISOString();
  const [entitlementResult, assignmentResult] = await Promise.all([
    supabaseAdmin
      .from('person_entitlements')
      .select('entitlement_key, source, source_ref, is_active, starts_at, ends_at')
      .eq('person_id', personId)
      .eq('entitlement_key', `program:${slug}`)
      .eq('is_active', true)
      .lte('starts_at', nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`),
    supabaseAdmin
      .from('program_assignments')
      .select(
        'program_slug, acquisition_source, status, active_from, active_to, source_ref',
      )
      .eq('person_id', personId)
      .eq('program_slug', slug),
  ]);

  if (entitlementResult.error || assignmentResult.error) {
    console.warn(
      '[programs/curriculum-access] lookup failed closed:',
      entitlementResult.error?.message ?? assignmentResult.error?.message,
    );
    return false;
  }

  return hasCurrentProgramCurriculumAccess({
    programSlug: slug,
    entitlements: (entitlementResult.data ?? []) as CurriculumEntitlementRef[],
    assignments: (assignmentResult.data ?? []) as CurriculumAssignmentRef[],
    now,
  });
}
