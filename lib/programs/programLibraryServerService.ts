/**
 * Plans Phase 11 — Program Library (server-only)
 *
 * User-facing read model over entitlement + assignment + guidance data.
 * Answers the two Packet 11 questions:
 *
 *   (a) Library: what programs do I have access to? Which are active /
 *       scheduled / inactive?
 *   (b) Detail:  what is this one program? What content is in it? How is
 *       it shaping my plan right now?
 *
 * Library entries are derived from a union of:
 *   - active `person_entitlements` shaped `program:<slug>` (access layer)
 *   - all `program_assignments` for the person regardless of status
 *     (so a scheduled or completed program is still visible in the
 *     library, matching Packet 11 §3a)
 *
 * Packet 10 logic is reused for impact bullets and slug→title rendering.
 * This is read-only derived state; nothing here mutates a table.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  getProgramCatalogueEntry,
  resolveProgramCatalogueEntries,
  resolveProgramCatalogueEntry,
  type ProgramCatalogueEntry,
  type ProgramModuleSummary,
} from './catalogue';
import {
  getPublishedProgramTreeBySlug,
  type PublishedProgram,
} from './programContentDeliveryServerService';
import {
  deriveImpactBullets,
  slugToTitle,
  type GuidanceImpactBullet,
  type UserFacingAssignmentStatus,
} from '@/lib/plans/programRuntimeSummaryServerService';
import {
  listAssignments,
  resolveInheritedGuidanceForPerson,
} from '@/lib/plans/programAssignmentServerService';
import type {
  ProgramAssignment,
  ProgramPlanGuidance,
} from '@/lib/plans/types';
import {
  listProgressHeadlinesForPerson,
  getProgramProgressSummary,
  type ProgramProgressHeadline,
} from './programProgressServerService';
import type { ProgramProgressSummary } from './progressTypes';

// ============================================================================
// Public shapes
// ============================================================================

export type ProgramAccessState = 'entitled' | 'assigned_only' | 'unavailable';

export type ProgramRuntimeState =
  | 'active_now'
  | 'scheduled'
  | 'inactive'
  | 'completed'
  | 'cancelled'
  | 'none';

export interface ProgramLibraryAssignmentView {
  id: string;
  status: UserFacingAssignmentStatus;
  runtime_state: ProgramRuntimeState;
  active_from: string | null;
  active_to: string | null;
  acquisition_source: ProgramAssignment['acquisition_source'];
}

export interface ProgramLibraryEntry {
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  is_catalogue_stub: boolean;
  storefront_href: string | null;

  /** Does the person currently hold `program:<slug>` entitlement? */
  has_entitlement: boolean;
  access_state: ProgramAccessState;

  /**
   * The single "primary" assignment that should drive the runtime badge
   * in the library card. Preference order:
   *   1. an assignment currently in-window (active_now)
   *   2. an assignment that is scheduled
   *   3. the most recently updated non-active assignment
   *   4. null (no assignments — entitled-only)
   */
  primary_assignment: ProgramLibraryAssignmentView | null;
  runtime_state: ProgramRuntimeState;

  /** Headline impact sentence, if the program is currently active. */
  impact_headline: string | null;

  /**
   * Packet 13 — headline per-program progress state. `null` when the
   * program has no managed content items to progress through (pure
   * stub catalogue entry or empty managed program).
   */
  progress: ProgramProgressHeadline | null;
}

export interface ProgramLibrary {
  person_id: string;
  entries: ProgramLibraryEntry[];
  resolved_at: string;
}

export interface ProgramLibraryDetail extends ProgramLibraryEntry {
  /** All assignments for this slug (any status), newest first. */
  assignments: ProgramLibraryAssignmentView[];
  /**
   * Program content outline. For managed content (Packet 12) this is
   * derived from the `program_modules` rows; for stubs it's the
   * in-code outline. Empty when no outline is available.
   */
  modules: ProgramModuleSummary[];
  /**
   * Packet 12 — full managed content tree (modules + items) when the
   * program has a published `programs` row. `null` otherwise. The
   * detail UI prefers this over `modules` when present.
   */
  managed_content: PublishedProgram | null;
  /**
   * Plain-language bullets of how this program is shaping the user's
   * plan right now. Empty list when program is not active.
   */
  impact_bullets: GuidanceImpactBullet[];

  /**
   * Packet 13 — full progress + resume summary for this program/user.
   * `null` when no managed content exists (nothing to progress
   * through). The detail UI uses this for the resume CTA, per-module
   * completion counts, and item-level checkmarks.
   */
  progress_summary: ProgramProgressSummary | null;
}

// ============================================================================
// Internal helpers
// ============================================================================

function toRuntimeState(
  a: ProgramAssignment | null,
  now: Date,
): ProgramRuntimeState {
  if (!a) return 'none';
  if (a.status === 'completed') return 'completed';
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status !== 'active') return 'inactive';
  const afterStart = !a.active_from || new Date(a.active_from) <= now;
  const beforeEnd = !a.active_to || new Date(a.active_to) > now;
  if (afterStart && beforeEnd) return 'active_now';
  if (!afterStart) return 'scheduled';
  return 'inactive';
}

function toAssignmentView(
  a: ProgramAssignment,
  now: Date,
): ProgramLibraryAssignmentView {
  return {
    id: a.id,
    status: a.status as UserFacingAssignmentStatus,
    runtime_state: toRuntimeState(a, now),
    active_from: a.active_from,
    active_to: a.active_to,
    acquisition_source: a.acquisition_source,
  };
}

function pickPrimaryAssignment(
  assignments: ProgramAssignment[],
  now: Date,
): ProgramAssignment | null {
  if (assignments.length === 0) return null;
  const withState = assignments.map((a) => ({ a, state: toRuntimeState(a, now) }));
  const rank: Record<ProgramRuntimeState, number> = {
    active_now: 5,
    scheduled: 4,
    inactive: 3,
    completed: 2,
    cancelled: 1,
    none: 0,
  };
  withState.sort((x, y) => {
    if (rank[y.state] !== rank[x.state]) return rank[y.state] - rank[x.state];
    return y.a.updated_at.localeCompare(x.a.updated_at);
  });
  return withState[0].a;
}

function headlineFromBullets(
  bullets: GuidanceImpactBullet[],
): string | null {
  if (bullets.length === 0) return null;
  return bullets[0].text;
}

/**
 * Read active `program:<slug>` entitlements as a set of slugs. Uses the
 * same "is_active + window" gating as hasEntitlement().
 */
async function listEntitledProgramSlugs(personId: string): Promise<Set<string>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('person_entitlements')
    .select('entitlement_key')
    .eq('person_id', personId)
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  if (error) {
    console.warn(
      '[programs/library] listEntitledProgramSlugs error:',
      error.message,
    );
    return new Set();
  }
  const slugs = new Set<string>();
  for (const row of (data ?? []) as { entitlement_key: string }[]) {
    const m = (row.entitlement_key ?? '').match(/^program:([a-z0-9][a-z0-9-]*)$/i);
    if (m) slugs.add(m[1].toLowerCase());
  }
  return slugs;
}

/**
 * Group assignments by slug, then return slug → all-assignments map.
 */
function groupAssignmentsBySlug(
  assignments: ProgramAssignment[],
): Map<string, ProgramAssignment[]> {
  const m = new Map<string, ProgramAssignment[]>();
  for (const a of assignments) {
    const list = m.get(a.program_slug) ?? [];
    list.push(a);
    m.set(a.program_slug, list);
  }
  return m;
}

// ============================================================================
// Library: list
// ============================================================================

export async function listLibraryForPerson(
  personId: string,
): Promise<ProgramLibrary> {
  const now = new Date();

  const [entitledSlugs, assignmentList, resolution] = await Promise.all([
    listEntitledProgramSlugs(personId),
    listAssignments({ personId, limit: 200 }),
    resolveInheritedGuidanceForPerson(personId),
  ]);

  const bySlug = groupAssignmentsBySlug(assignmentList.rows);

  const slugSet = new Set<string>();
  Array.from(entitledSlugs).forEach((s) => slugSet.add(s));
  Array.from(bySlug.keys()).forEach((s) => slugSet.add(s));
  for (const a of resolution.active_assignments) slugSet.add(a.program_slug);

  // Per-slug impact bullets come from the resolved guidance set filtered
  // to that slug. This keeps the library consistent with what Plans is
  // actually consuming right now.
  const guidanceBySlug = new Map<string, ProgramPlanGuidance[]>();
  for (const r of resolution.resolved) {
    const list = guidanceBySlug.get(r.guidance.program_slug) ?? [];
    list.push(r.guidance);
    guidanceBySlug.set(r.guidance.program_slug, list);
  }

  const slugList = Array.from(slugSet);
  const [catalogueEntries, progressHeadlines] = await Promise.all([
    resolveProgramCatalogueEntries(slugList),
    listProgressHeadlinesForPerson(personId, slugList),
  ]);
  const catalogueBySlug = new Map(
    catalogueEntries.map((e) => [e.slug.toLowerCase(), e]),
  );

  const entries: ProgramLibraryEntry[] = slugList.map((slug) => {
    const catalogue =
      catalogueBySlug.get(slug.toLowerCase()) ?? getProgramCatalogueEntry(slug);
    const assignments = bySlug.get(slug) ?? [];
    const primary = pickPrimaryAssignment(assignments, now);
    const runtimeState = toRuntimeState(primary, now);
    const hasEntitlement = entitledSlugs.has(slug);

    let accessState: ProgramAccessState;
    if (hasEntitlement) accessState = 'entitled';
    else if (assignments.length > 0) accessState = 'assigned_only';
    else accessState = 'unavailable';

    const impactBullets =
      runtimeState === 'active_now'
        ? deriveImpactBullets(guidanceBySlug.get(slug) ?? [])
        : [];

    return {
      slug: catalogue.slug,
      title: catalogue.title,
      tagline: catalogue.tagline,
      description: catalogue.description,
      is_catalogue_stub: catalogue.is_stub,
      storefront_href: catalogue.storefront_href,
      has_entitlement: hasEntitlement,
      access_state: accessState,
      primary_assignment: primary ? toAssignmentView(primary, now) : null,
      runtime_state: runtimeState,
      impact_headline: headlineFromBullets(impactBullets),
      progress: progressHeadlines.get(slug.toLowerCase()) ?? null,
    };
  });

  // Library sort: active_now first, then scheduled, then other states;
  // within a bucket, most recent first so the freshest program leads.
  const rank: Record<ProgramRuntimeState, number> = {
    active_now: 5,
    scheduled: 4,
    inactive: 3,
    completed: 2,
    cancelled: 1,
    none: 0,
  };
  entries.sort((x, y) => {
    if (rank[y.runtime_state] !== rank[x.runtime_state]) {
      return rank[y.runtime_state] - rank[x.runtime_state];
    }
    const xUpdated = x.primary_assignment?.active_from ?? '';
    const yUpdated = y.primary_assignment?.active_from ?? '';
    if (xUpdated !== yUpdated) return yUpdated.localeCompare(xUpdated);
    return x.title.localeCompare(y.title);
  });

  return {
    person_id: personId,
    entries,
    resolved_at: resolution.resolved_at,
  };
}

// ============================================================================
// Library: detail
// ============================================================================

/**
 * Detailed view for a single program. Returns null when the user has no
 * access to that slug (no entitlement AND no assignment). Callers
 * should 404 in that case so we don't leak catalogue metadata to
 * unauthorized users.
 */
export async function getLibraryDetailForPerson(
  personId: string,
  slug: string,
): Promise<ProgramLibraryDetail | null> {
  const now = new Date();
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) return null;

  const [entitledSlugs, assignmentList, resolution] = await Promise.all([
    listEntitledProgramSlugs(personId),
    listAssignments({ personId, programSlug: trimmed, limit: 200 }),
    resolveInheritedGuidanceForPerson(personId),
  ]);

  const hasEntitlement = entitledSlugs.has(trimmed);
  const assignments = assignmentList.rows;

  if (!hasEntitlement && assignments.length === 0) {
    return null;
  }

  const [catalogue, managedTree, progressSummary] = await Promise.all([
    resolveProgramCatalogueEntry(trimmed),
    getPublishedProgramTreeBySlug(trimmed),
    getProgramProgressSummary(personId, trimmed),
  ]);
  const primary = pickPrimaryAssignment(assignments, now);
  const runtimeState = toRuntimeState(primary, now);

  const matchedGuidance = resolution.resolved
    .filter((r) => r.guidance.program_slug === trimmed)
    .map((r) => r.guidance);
  const impactBullets =
    runtimeState === 'active_now' ? deriveImpactBullets(matchedGuidance) : [];

  const assignmentViews = [...assignments]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((a) => toAssignmentView(a, now));

  return {
    slug: catalogue.slug,
    title: catalogue.title || slugToTitle(trimmed),
    tagline: catalogue.tagline,
    description: catalogue.description,
    is_catalogue_stub: catalogue.is_stub,
    storefront_href: catalogue.storefront_href,
    has_entitlement: hasEntitlement,
    access_state: hasEntitlement
      ? 'entitled'
      : assignments.length > 0
        ? 'assigned_only'
        : 'unavailable',
    primary_assignment: primary ? toAssignmentView(primary, now) : null,
    runtime_state: runtimeState,
    impact_headline: headlineFromBullets(impactBullets),
    assignments: assignmentViews,
    modules: catalogue.modules,
    managed_content: managedTree,
    impact_bullets: impactBullets,
    progress: progressSummary.items_total > 0
      ? {
          program_slug: progressSummary.program_slug,
          items_total: progressSummary.items_total,
          items_completed: progressSummary.items_completed,
          items_in_progress: progressSummary.items_in_progress,
          percent_complete: progressSummary.percent_complete,
          aggregate_status: progressSummary.aggregate_status,
          resume_content_item_id: progressSummary.resume_content_item_id,
          last_viewed_at: progressSummary.last_viewed_at,
        }
      : null,
    progress_summary:
      progressSummary.items_total > 0 ? progressSummary : null,
  };
}
