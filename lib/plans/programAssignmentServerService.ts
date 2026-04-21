/**
 * Plans Phase 8 — Program Assignment & Guidance Inheritance (server-only)
 *
 * Runtime layer sitting on top of acquisition (person_entitlements).
 * Responsibilities:
 *
 *   1. CRUD + status lifecycle for `program_assignments`.
 *   2. `listActiveAssignmentsForPerson(personId)` — returns assignments
 *      whose status is 'active' AND current date is within active_from /
 *      active_to.
 *   3. `resolveInheritedGuidanceForPerson(personId)` — produces the
 *      full explanation object used both by the Plans consumer (which
 *      projects out `ProgramPlanGuidance[]`) and the admin inspection
 *      surface (which renders assignments + resolved rows + ordering).
 *
 * Merge ordering (deterministic):
 *   1. Resolution reason (inherited_from_assignment first, then
 *      direct_person_scope — inherited rows represent currently-running
 *      programs and should win ties).
 *   2. `effective_priority` DESC (assignment.priority + guidance.priority).
 *   3. `guidance.updated_at` DESC as the final tie-break.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { listActiveGuidanceForPerson as adminListActiveGuidanceForPerson } from './programGuidanceAdminServerService';
import type {
  GuidanceResolutionResult,
  ProgramAssignment,
  ProgramAssignmentStatus,
  ProgramPlanGuidance,
  ResolvedGuidanceEntry,
} from './types';
import type {
  ProgramAssignmentCreateInput,
  ProgramAssignmentUpdateInput,
} from './validators';

// ============================================================================
// Row shape (DB → domain)
// ============================================================================

interface AssignmentRow {
  id: string;
  person_id: string;
  program_slug: string;
  acquisition_source: ProgramAssignment['acquisition_source'];
  status: ProgramAssignmentStatus;
  active_from: string | null;
  active_to: string | null;
  priority: number | null;
  source_ref: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  auto_created?: boolean | null;
  created_at: string;
  updated_at: string;
}

export function rowToAssignment(row: AssignmentRow): ProgramAssignment {
  return {
    id: row.id,
    person_id: row.person_id,
    program_slug: row.program_slug,
    acquisition_source: row.acquisition_source,
    status: row.status,
    active_from: row.active_from,
    active_to: row.active_to,
    priority: typeof row.priority === 'number' ? row.priority : 0,
    source_ref: row.source_ref ?? null,
    notes: row.notes ?? null,
    created_by_user_id: row.created_by_user_id ?? null,
    auto_created: row.auto_created === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// List / Get
// ============================================================================

export interface ListAssignmentsFilter {
  personId?: string;
  programSlug?: string;
  status?: ProgramAssignmentStatus;
  acquisitionSource?: ProgramAssignment['acquisition_source'];
  limit?: number;
  offset?: number;
}

export interface ListAssignmentsResult {
  rows: ProgramAssignment[];
  total: number;
  limit: number;
  offset: number;
}

export async function listAssignments(
  filter: ListAssignmentsFilter = {},
): Promise<ListAssignmentsResult> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  let q = supabaseAdmin
    .from('program_assignments')
    .select('*', { count: 'estimated' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter.personId) q = q.eq('person_id', filter.personId);
  if (filter.programSlug) q = q.eq('program_slug', filter.programSlug);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.acquisitionSource) {
    q = q.eq('acquisition_source', filter.acquisitionSource);
  }

  const { data, count, error } = await q;
  if (error) {
    throw new Error(`program_assignments list failed: ${error.message}`);
  }
  return {
    rows: ((data ?? []) as unknown as AssignmentRow[]).map(rowToAssignment),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getAssignmentById(
  id: string,
): Promise<ProgramAssignment | null> {
  const { data, error } = await supabaseAdmin
    .from('program_assignments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`program_assignments get failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToAssignment(data as unknown as AssignmentRow);
}

/**
 * Assignments currently contributing inheritance: status = 'active' AND
 * inside (active_from, active_to] window. `active_from IS NULL` means
 * "applies immediately"; `active_to IS NULL` means "no scheduled end".
 */
export async function listActiveAssignmentsForPerson(
  personId: string,
): Promise<ProgramAssignment[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('program_assignments')
    .select('*')
    .eq('person_id', personId)
    .eq('status', 'active')
    .or(`active_from.is.null,active_from.lte.${nowIso}`)
    .or(`active_to.is.null,active_to.gt.${nowIso}`);

  if (error) {
    throw new Error(
      `program_assignments list-active failed: ${error.message}`,
    );
  }
  const rows = ((data ?? []) as unknown as AssignmentRow[]).map(rowToAssignment);
  rows.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return rows;
}

// ============================================================================
// Create / Update / Status
// ============================================================================

export interface AssignmentContext {
  createdByAuthUserId?: string | null;
}

export async function createAssignment(
  input: ProgramAssignmentCreateInput,
  ctx: AssignmentContext = {},
): Promise<ProgramAssignment> {
  const insertRow = {
    person_id: input.person_id,
    program_slug: input.program_slug.trim(),
    acquisition_source: input.acquisition_source,
    status: input.status,
    active_from: input.active_from ?? null,
    active_to: input.active_to ?? null,
    priority: input.priority ?? 0,
    source_ref: input.source_ref ?? null,
    notes: input.notes ?? null,
    created_by_user_id: ctx.createdByAuthUserId ?? null,
  };
  const { data, error } = await supabaseAdmin
    .from('program_assignments')
    .insert(insertRow)
    .select('*')
    .single();
  if (error) {
    throw new Error(`program_assignments insert failed: ${error.message}`);
  }
  return rowToAssignment(data as unknown as AssignmentRow);
}

export async function updateAssignment(
  id: string,
  patch: ProgramAssignmentUpdateInput,
): Promise<ProgramAssignment> {
  const updateRow: Record<string, unknown> = {};
  if (patch.program_slug !== undefined) {
    updateRow.program_slug = patch.program_slug.trim();
  }
  if (patch.acquisition_source !== undefined) {
    updateRow.acquisition_source = patch.acquisition_source;
  }
  if (patch.status !== undefined) updateRow.status = patch.status;
  if (patch.active_from !== undefined) {
    updateRow.active_from = patch.active_from;
  }
  if (patch.active_to !== undefined) updateRow.active_to = patch.active_to;
  if (patch.priority !== undefined) updateRow.priority = patch.priority;
  if (patch.source_ref !== undefined) updateRow.source_ref = patch.source_ref;
  if (patch.notes !== undefined) updateRow.notes = patch.notes;

  const { data, error } = await supabaseAdmin
    .from('program_assignments')
    .update(updateRow)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    throw new Error(`program_assignments update failed: ${error.message}`);
  }
  return rowToAssignment(data as unknown as AssignmentRow);
}

export async function setAssignmentStatus(
  id: string,
  status: ProgramAssignmentStatus,
): Promise<ProgramAssignment> {
  return updateAssignment(id, { status });
}

// ============================================================================
// Inheritance resolution
// ============================================================================

/**
 * Resolve every guidance row currently influencing Plans generation for
 * the given person, with full provenance.
 *
 * Inheritance rule (Packet 8):
 *   - A guidance row is "inherited_from_assignment" if there is an
 *     active program_assignments row for (person_id, program_slug).
 *   - A guidance row is "direct_person_scope" otherwise. This preserves
 *     backward compatibility with Phase 7 rows authored before any
 *     assignment existed — the admin surface still has a single obvious
 *     place to audit/remove them.
 *
 * Merge order (deterministic):
 *   1. inherited_from_assignment first (currently-running programs
 *      outweigh stale person overrides).
 *   2. `effective_priority` DESC (assignment.priority + guidance.priority
 *      when inherited; guidance.priority alone when direct).
 *   3. `guidance.updated_at` DESC as the final tie-break.
 */
export async function resolveInheritedGuidanceForPerson(
  personId: string,
): Promise<GuidanceResolutionResult> {
  const [assignments, guidanceRows] = await Promise.all([
    listActiveAssignmentsForPerson(personId),
    adminListActiveGuidanceForPerson(personId),
  ]);

  const assignmentBySlug = new Map<string, ProgramAssignment>();
  for (const a of assignments) {
    const existing = assignmentBySlug.get(a.program_slug);
    if (!existing || a.priority > existing.priority) {
      assignmentBySlug.set(a.program_slug, a);
    }
  }

  const resolved: ResolvedGuidanceEntry[] = guidanceRows.map((g) => {
    const matchedAssignment = assignmentBySlug.get(g.program_slug);
    if (matchedAssignment) {
      return {
        guidance: g,
        resolution_reason: 'inherited_from_assignment' as const,
        inherited_from_assignment_id: matchedAssignment.id,
        effective_priority: matchedAssignment.priority + g.priority,
      };
    }
    return {
      guidance: g,
      resolution_reason: 'direct_person_scope' as const,
      inherited_from_assignment_id: null,
      effective_priority: g.priority,
    };
  });

  resolved.sort((a, b) => {
    if (a.resolution_reason !== b.resolution_reason) {
      return a.resolution_reason === 'inherited_from_assignment' ? -1 : 1;
    }
    if (b.effective_priority !== a.effective_priority) {
      return b.effective_priority - a.effective_priority;
    }
    return b.guidance.updated_at.localeCompare(a.guidance.updated_at);
  });

  return {
    person_id: personId,
    active_assignments: assignments,
    candidate_guidance: guidanceRows,
    resolved,
    resolved_at: new Date().toISOString(),
  };
}

/**
 * Lightweight projection used by the Plans consumer path (which stores
 * an array of ProgramPlanGuidance in plans.input_snapshot_json). Order
 * mirrors the full resolver output so the snapshot reflects the same
 * deterministic merge ordering.
 */
export async function resolveActiveGuidanceForPlans(
  personId: string,
): Promise<ProgramPlanGuidance[]> {
  const { resolved } = await resolveInheritedGuidanceForPerson(personId);
  return resolved.map((r) => r.guidance);
}
