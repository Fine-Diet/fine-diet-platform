/**
 * Plans Phase 13 — Program progress server service (server-only)
 *
 * Read and write per-user progress on Packet 12 content items, and
 * derive the resume/summary read model the library + detail pages use.
 *
 * Access model:
 *   - Reads are scoped by person_id. Callers must pre-resolve the
 *     person for the signed-in user (the journal helpers already do).
 *   - Writes additionally verify that the person has access to the
 *     program that owns the item (entitlement OR any existing
 *     `program_assignments` row for that slug). This mirrors Packet 11
 *     access semantics so progress can't be fabricated for programs
 *     the user never acquired.
 *
 * Progress stays separate from `program_plan_guidance` and plan
 * runtime: no call from here touches guidance or assignments.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { listAssignments } from '@/lib/plans/programAssignmentServerService';
import type {
  PublishedProgram,
  PublishedContentItem,
  PublishedModule,
} from './programContentDeliveryServerService';
import { getPublishedProgramTreeBySlug } from './programContentDeliveryServerService';
import type {
  ProgramContentProgress,
  ProgramProgressStatus,
  ProgramProgressSummary,
  ProgramProgressModuleSummary,
} from './progressTypes';

// ============================================================================
// Row adapters
// ============================================================================

interface ProgressRow {
  id: string;
  person_id: string;
  program_slug: string;
  content_item_id: string;
  status: ProgramProgressStatus;
  started_at: string | null;
  completed_at: string | null;
  last_viewed_at: string | null;
  progress_percent: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProgress(r: ProgressRow): ProgramContentProgress {
  return {
    id: r.id,
    person_id: r.person_id,
    program_slug: r.program_slug,
    content_item_id: r.content_item_id,
    status: r.status,
    started_at: r.started_at,
    completed_at: r.completed_at,
    last_viewed_at: r.last_viewed_at,
    progress_percent: r.progress_percent,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ============================================================================
// Access helpers
// ============================================================================

async function hasProgramAccess(
  personId: string,
  programSlug: string,
): Promise<boolean> {
  const slug = programSlug.trim().toLowerCase();
  if (!slug) return false;

  // Entitlement check: person_entitlements.is_active with matching key.
  const nowIso = new Date().toISOString();
  const entitlementKey = `program:${slug}`;
  const { data: entRows, error: entErr } = await supabaseAdmin
    .from('person_entitlements')
    .select('id')
    .eq('person_id', personId)
    .eq('entitlement_key', entitlementKey)
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .limit(1);
  if (entErr) {
    console.warn('[progress] hasProgramAccess entitlements warn:', entErr.message);
  } else if ((entRows ?? []).length > 0) {
    return true;
  }

  // Assignment check: any program_assignments row is enough (assigned_only
  // access state in Packet 11 still counts as "user has this program").
  const { rows } = await listAssignments({
    personId,
    programSlug: slug,
    limit: 1,
  });
  return rows.length > 0;
}

/**
 * Look up the content item + its module and program slug in one round
 * trip. Returns null when the item doesn't exist.
 */
async function lookupItemContext(
  contentItemId: string,
): Promise<{
  item_id: string;
  module_id: string;
  program_id: string;
  program_slug: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('program_content_items')
    .select(
      'id, module_id, program_modules!inner(program_id, programs!inner(slug))',
    )
    .eq('id', contentItemId)
    .maybeSingle();
  if (error) {
    console.warn('[progress] lookupItemContext error:', error.message);
    return null;
  }
  if (!data) return null;

  // Supabase's PostgREST returns the joined row as a nested object;
  // narrow it carefully because the type is unknown at compile time.
  const rawModule = (data as unknown as {
    id: string;
    module_id: string;
    program_modules: {
      program_id: string;
      programs: { slug: string };
    };
  }).program_modules;
  if (!rawModule?.programs?.slug) return null;

  return {
    item_id: data.id as string,
    module_id: data.module_id as string,
    program_id: rawModule.program_id,
    program_slug: rawModule.programs.slug,
  };
}

// ============================================================================
// Reads
// ============================================================================

export async function listProgressForPerson(
  personId: string,
  options: { programSlug?: string } = {},
): Promise<ProgramContentProgress[]> {
  let q = supabaseAdmin
    .from('program_content_progress')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (options.programSlug) {
    q = q.eq('program_slug', options.programSlug.toLowerCase());
  }
  const { data, error } = await q;
  if (error) throw new Error(`listProgressForPerson failed: ${error.message}`);
  return ((data ?? []) as ProgressRow[]).map(rowToProgress);
}

// ============================================================================
// Summary derivation
// ============================================================================

function flattenItems(tree: PublishedProgram): Array<{
  item: PublishedContentItem;
  module: PublishedModule;
}> {
  const out: Array<{ item: PublishedContentItem; module: PublishedModule }> = [];
  for (const m of tree.modules) {
    for (const it of m.items) {
      out.push({ item: it, module: m });
    }
  }
  return out;
}

function emptySummary(slug: string): ProgramProgressSummary {
  return {
    program_slug: slug,
    items_total: 0,
    items_completed: 0,
    items_in_progress: 0,
    percent_complete: 0,
    aggregate_status: 'not_started',
    modules: [],
    resume_content_item_id: null,
    resume_module_id: null,
    last_viewed_at: null,
  };
}

/**
 * Build the full progress + resume summary for a person/program.
 *
 * Resume rule (Packet 13 §3b, deterministic):
 *   1. If there's an `in_progress` item, pick the one with the newest
 *      `last_viewed_at` (tie → earliest in content order).
 *   2. Otherwise, the first `not_started` / null item in content order.
 *   3. Otherwise (everything complete), resume target is null.
 *
 * Only published content items participate. Draft/archived items are
 * ignored so admins can iterate without mutating user progress totals.
 */
export async function getProgramProgressSummary(
  personId: string,
  programSlug: string,
): Promise<ProgramProgressSummary> {
  const slug = programSlug.trim().toLowerCase();
  if (!slug) return emptySummary(slug);

  const tree = await getPublishedProgramTreeBySlug(slug);
  if (!tree) return emptySummary(slug);

  const orderedItems = flattenItems(tree);
  const itemsTotal = orderedItems.length;
  if (itemsTotal === 0) return emptySummary(slug);

  const progress = await listProgressForPerson(personId, { programSlug: slug });
  const byItem = new Map<string, ProgramContentProgress>(
    progress.map((p) => [p.content_item_id, p]),
  );

  const byModule = new Map<string, ProgramProgressModuleSummary>();
  for (const m of tree.modules) {
    byModule.set(m.id, {
      module_id: m.id,
      items_total: 0,
      items_completed: 0,
      items_in_progress: 0,
      item_states: [],
    });
  }

  let itemsCompleted = 0;
  let itemsInProgress = 0;
  let newestViewed: string | null = null;

  type ResumeCandidate = {
    item_id: string;
    module_id: string;
    last_viewed_at: string | null;
    order: number;
  };
  let firstInProgress: ResumeCandidate | null = null;
  let firstNotStarted: ResumeCandidate | null = null;

  orderedItems.forEach(({ item, module }, idx) => {
    const state = byItem.get(item.id);
    const status: ProgramProgressStatus = state?.status ?? 'not_started';

    const moduleSummary = byModule.get(module.id);
    if (moduleSummary) {
      moduleSummary.items_total += 1;
      moduleSummary.item_states.push({
        content_item_id: item.id,
        status,
        last_viewed_at: state?.last_viewed_at ?? null,
      });
      if (status === 'completed') moduleSummary.items_completed += 1;
      if (status === 'in_progress') moduleSummary.items_in_progress += 1;
    }

    if (status === 'completed') itemsCompleted += 1;
    if (status === 'in_progress') {
      itemsInProgress += 1;
      const candidateViewed = state?.last_viewed_at ?? null;
      if (!firstInProgress) {
        firstInProgress = {
          item_id: item.id,
          module_id: module.id,
          last_viewed_at: candidateViewed,
          order: idx,
        };
      } else {
        const currentViewed = firstInProgress.last_viewed_at;
        const aNewer =
          candidateViewed &&
          (!currentViewed || candidateViewed > currentViewed);
        if (aNewer) {
          firstInProgress = {
            item_id: item.id,
            module_id: module.id,
            last_viewed_at: candidateViewed,
            order: idx,
          };
        }
      }
    }

    if (status === 'not_started' && !firstNotStarted) {
      firstNotStarted = {
        item_id: item.id,
        module_id: module.id,
        last_viewed_at: null,
        order: idx,
      };
    }

    const viewed = state?.last_viewed_at;
    if (viewed && (!newestViewed || viewed > newestViewed)) {
      newestViewed = viewed;
    }
  });

  const percentComplete =
    itemsTotal > 0 ? Math.round((itemsCompleted / itemsTotal) * 100) : 0;

  let aggregateStatus: ProgramProgressStatus = 'not_started';
  if (itemsCompleted === itemsTotal && itemsTotal > 0) {
    aggregateStatus = 'completed';
  } else if (itemsCompleted > 0 || itemsInProgress > 0) {
    aggregateStatus = 'in_progress';
  }

  const resume = ((firstInProgress as ResumeCandidate | null) ??
    (firstNotStarted as ResumeCandidate | null)) as ResumeCandidate | null;

  return {
    program_slug: slug,
    items_total: itemsTotal,
    items_completed: itemsCompleted,
    items_in_progress: itemsInProgress,
    percent_complete: percentComplete,
    aggregate_status: aggregateStatus,
    modules: Array.from(byModule.values()),
    resume_content_item_id: resume?.item_id ?? null,
    resume_module_id: resume?.module_id ?? null,
    last_viewed_at: newestViewed,
  };
}

/**
 * Light summary variant used by the library list page. Avoids the full
 * module breakdown when only the headline numbers are needed.
 */
export interface ProgramProgressHeadline {
  program_slug: string;
  items_total: number;
  items_completed: number;
  items_in_progress: number;
  percent_complete: number;
  aggregate_status: ProgramProgressStatus;
  resume_content_item_id: string | null;
  last_viewed_at: string | null;
}

export async function listProgressHeadlinesForPerson(
  personId: string,
  programSlugs: string[],
): Promise<Map<string, ProgramProgressHeadline>> {
  const unique = Array.from(
    new Set(programSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );
  const result = new Map<string, ProgramProgressHeadline>();
  if (unique.length === 0) return result;

  // Parallelize the derivations; each summary call hits the managed
  // catalogue once for the tree. In practice the user only has a
  // handful of programs, so this is fine.
  const summaries = await Promise.all(
    unique.map((slug) => getProgramProgressSummary(personId, slug)),
  );
  for (const s of summaries) {
    result.set(s.program_slug, {
      program_slug: s.program_slug,
      items_total: s.items_total,
      items_completed: s.items_completed,
      items_in_progress: s.items_in_progress,
      percent_complete: s.percent_complete,
      aggregate_status: s.aggregate_status,
      resume_content_item_id: s.resume_content_item_id,
      last_viewed_at: s.last_viewed_at,
    });
  }
  return result;
}

// ============================================================================
// Writes
// ============================================================================

export interface UpsertStatusInput {
  personId: string;
  contentItemId: string;
  status: ProgramProgressStatus;
  progressPercent?: number | null;
  notes?: string | null;
}

/**
 * Upsert a progress row for a single item. Validates that the person
 * has program access before writing; throws on denied access so the
 * API layer can surface a 403.
 */
export async function upsertItemStatus(
  input: UpsertStatusInput,
): Promise<ProgramContentProgress> {
  const ctx = await lookupItemContext(input.contentItemId);
  if (!ctx) {
    throw new Error('Content item not found.');
  }

  const allowed = await hasProgramAccess(input.personId, ctx.program_slug);
  if (!allowed) {
    const err = new Error('Program access denied for progress write.');
    (err as Error & { code?: string }).code = 'PROGRAM_ACCESS_DENIED';
    throw err;
  }

  const nowIso = new Date().toISOString();

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('program_content_progress')
    .select('*')
    .eq('person_id', input.personId)
    .eq('content_item_id', input.contentItemId)
    .maybeSingle();
  if (existingErr) {
    throw new Error(`upsertItemStatus.read failed: ${existingErr.message}`);
  }
  const existingRow = existing as ProgressRow | null;

  const startedAt = existingRow?.started_at
    ?? (input.status === 'not_started' ? null : nowIso);
  const completedAt =
    input.status === 'completed'
      ? existingRow?.completed_at ?? nowIso
      : null;

  const payload = {
    person_id: input.personId,
    program_slug: ctx.program_slug.toLowerCase(),
    content_item_id: input.contentItemId,
    status: input.status,
    started_at: startedAt,
    completed_at: completedAt,
    last_viewed_at: nowIso,
    progress_percent: input.progressPercent ?? existingRow?.progress_percent ?? null,
    notes: input.notes ?? existingRow?.notes ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from('program_content_progress')
    .upsert(payload, { onConflict: 'person_id,content_item_id' })
    .select('*')
    .single();
  if (error) {
    throw new Error(`upsertItemStatus failed: ${error.message}`);
  }

  return rowToProgress(data as ProgressRow);
}
