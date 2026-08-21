/**
 * Plans Phase 7 — Program Guidance Admin Service (server-only)
 *
 * Producer-side CRUD over `program_plan_guidance`. This service is the
 * single write path used by the admin authoring flow. It is deliberately
 * distinct from the Plans consumer reader in `planServerService.ts`:
 *
 *   - Reader (consumer side):       listActiveProgramGuidance(personId)
 *   - Writer (producer side, here): createGuidance / updateGuidance / ...
 *
 * Packet 7 does not change the existing Plans-side merge algorithm. It
 * only guarantees the admin can author, validate, activate, and inspect
 * guidance rows without hand-seeding the database.
 *
 * RLS note: all writes run under supabaseAdmin (service role), bypassing
 * RLS — the admin API layer enforces editor/admin role via authServer.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import type {
  ProgramPlanGuidance,
  ProgramPlanGuidancePayload,
  ProgramGuidanceType,
} from './types';
import type {
  ProgramGuidanceAdminCreateInput,
  ProgramGuidanceAdminUpdateInput,
} from './validators';

// ============================================================================
// Helpers
// ============================================================================

interface GuidanceRow {
  id: string;
  person_id: string;
  program_slug: string;
  program_run_id: string | null;
  guidance_payload_json: ProgramPlanGuidancePayload;
  active: boolean;
  effective_from: string | null;
  effective_until: string | null;
  priority?: number | null;
  guidance_type?: ProgramGuidanceType | null;
  notes?: string | null;
  created_by_user_id?: string | null;
  nds_version: string;
  classifier_version: string;
  created_at: string;
  updated_at: string;
}

function rowToGuidance(row: GuidanceRow): ProgramPlanGuidance {
  return {
    id: row.id,
    person_id: row.person_id,
    program_slug: row.program_slug,
    program_run_id: row.program_run_id,
    guidance_payload_json: row.guidance_payload_json,
    active: row.active,
    effective_from: row.effective_from,
    effective_until: row.effective_until,
    priority: typeof row.priority === 'number' ? row.priority : 0,
    guidance_type: row.guidance_type ?? null,
    notes: row.notes ?? null,
    created_by_user_id: row.created_by_user_id ?? null,
    nds_version: row.nds_version,
    classifier_version: row.classifier_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// List / Get
// ============================================================================

export interface ListGuidanceFilter {
  personId?: string;
  programSlug?: string;
  active?: boolean;
  guidanceType?: ProgramGuidanceType;
  limit?: number;
  offset?: number;
}

export interface ListGuidanceResult {
  rows: ProgramPlanGuidance[];
  total: number;
  limit: number;
  offset: number;
}

export async function listGuidance(
  filter: ListGuidanceFilter = {},
): Promise<ListGuidanceResult> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  let query = supabaseAdmin
    .from('program_plan_guidance')
    .select('*', { count: 'estimated' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter.personId) {
    query = query.eq('person_id', filter.personId);
  }
  if (filter.programSlug) {
    query = query.eq('program_slug', filter.programSlug);
  }
  if (typeof filter.active === 'boolean') {
    query = query.eq('active', filter.active);
  }
  if (filter.guidanceType) {
    query = query.eq('guidance_type', filter.guidanceType);
  }

  const { data, count, error } = await query;
  if (error) {
    throw new Error(`program_plan_guidance list failed: ${error.message}`);
  }

  return {
    rows: ((data ?? []) as unknown as GuidanceRow[]).map(rowToGuidance),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getGuidanceById(
  id: string,
): Promise<ProgramPlanGuidance | null> {
  const { data, error } = await supabaseAdmin
    .from('program_plan_guidance')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`program_plan_guidance get failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToGuidance(data as unknown as GuidanceRow);
}

/**
 * Admin-inspection helper: returns every active guidance row affecting
 * the given person *right now*, sorted by priority DESC then updated_at
 * DESC. The Plans consumer does not consult priority today — this sort
 * is purely for admin transparency.
 */
export async function listActiveGuidanceForPerson(
  personId: string,
): Promise<ProgramPlanGuidance[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('program_plan_guidance')
    .select('*')
    .eq('person_id', personId)
    .eq('active', true)
    .or(`effective_from.is.null,effective_from.lte.${nowIso}`)
    .or(`effective_until.is.null,effective_until.gt.${nowIso}`)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(
      `program_plan_guidance list-active failed: ${error.message}`,
    );
  }

  const rows = ((data ?? []) as unknown as GuidanceRow[]).map(rowToGuidance);
  rows.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return rows;
}

// ============================================================================
// Create / Update
// ============================================================================

export interface CreateGuidanceContext {
  createdByAuthUserId?: string | null;
}

export async function createGuidance(
  input: ProgramGuidanceAdminCreateInput,
  ctx: CreateGuidanceContext = {},
): Promise<ProgramPlanGuidance> {
  const insertRow = {
    person_id: input.person_id,
    program_slug: input.program_slug.trim(),
    program_run_id: input.program_run_id ?? null,
    guidance_payload_json: input.guidance_payload_json,
    active: input.active ?? true,
    effective_from: input.effective_from ?? null,
    effective_until: input.effective_until ?? null,
    priority: typeof input.priority === 'number' ? input.priority : 0,
    guidance_type: input.guidance_type ?? null,
    notes: input.notes ?? null,
    created_by_user_id: ctx.createdByAuthUserId ?? null,
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
  };

  const { data, error } = await supabaseAdmin
    .from('program_plan_guidance')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) {
    throw new Error(`program_plan_guidance insert failed: ${error.message}`);
  }
  return rowToGuidance(data as unknown as GuidanceRow);
}

export async function updateGuidance(
  id: string,
  patch: ProgramGuidanceAdminUpdateInput,
): Promise<ProgramPlanGuidance> {
  const updateRow: Record<string, unknown> = {};
  if (patch.program_slug !== undefined) {
    updateRow.program_slug = patch.program_slug.trim();
  }
  if (patch.program_run_id !== undefined) {
    updateRow.program_run_id = patch.program_run_id;
  }
  if (patch.guidance_payload_json !== undefined) {
    updateRow.guidance_payload_json = patch.guidance_payload_json;
  }
  if (patch.active !== undefined) {
    updateRow.active = patch.active;
  }
  if (patch.effective_from !== undefined) {
    updateRow.effective_from = patch.effective_from;
  }
  if (patch.effective_until !== undefined) {
    updateRow.effective_until = patch.effective_until;
  }
  if (patch.priority !== undefined) {
    updateRow.priority = patch.priority;
  }
  if (patch.guidance_type !== undefined) {
    updateRow.guidance_type = patch.guidance_type;
  }
  if (patch.notes !== undefined) {
    updateRow.notes = patch.notes;
  }

  const { data, error } = await supabaseAdmin
    .from('program_plan_guidance')
    .update(updateRow)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`program_plan_guidance update failed: ${error.message}`);
  }
  return rowToGuidance(data as unknown as GuidanceRow);
}

export async function activateGuidance(id: string): Promise<ProgramPlanGuidance> {
  return updateGuidance(id, { active: true });
}

export async function deactivateGuidance(id: string): Promise<ProgramPlanGuidance> {
  return updateGuidance(id, { active: false });
}

// ============================================================================
// Preview (human-readable summary)
// ============================================================================

const SLOT_LABEL: Record<string, string> = {
  // Current v2 occasion keys (domain after guidance-payload normalization).
  occasion_1: 'mini meal',
  occasion_2: 'breakfast',
  occasion_3: 'mini meal',
  occasion_4: 'lunch',
  occasion_5: 'mini meal',
  occasion_6: 'mini meal',
  occasion_7: 'dinner',
  occasion_8: 'mini meal',
  // Legacy keys retained for any pre-normalized preview callers.
  breakfast: 'breakfast',
  morning_snack: 'morning snack',
  lunch: 'lunch',
  afternoon_snack: 'afternoon snack',
  dinner: 'dinner',
  evening_snack: 'evening snack',
};

function humanSlotList(slots: string[]): string {
  if (slots.length === 0) return '';
  if (slots.length === 1) return SLOT_LABEL[slots[0]] ?? slots[0];
  if (slots.length === 2) {
    return `${SLOT_LABEL[slots[0]] ?? slots[0]} and ${SLOT_LABEL[slots[1]] ?? slots[1]}`;
  }
  const head = slots.slice(0, -1).map((s) => SLOT_LABEL[s] ?? s).join(', ');
  const tail = SLOT_LABEL[slots[slots.length - 1]] ?? slots[slots.length - 1];
  return `${head}, and ${tail}`;
}

/**
 * Produces a concise natural-language description of what a guidance
 * payload will do. Used by the admin preview card — never a source of
 * truth for Plans resolution.
 */
export function previewGuidancePayload(
  payload: ProgramPlanGuidancePayload,
): string {
  const parts: string[] = [];

  const schedule = payload.schedule_override;
  if (schedule) {
    if (schedule.require_slots?.length) {
      parts.push(`Requires ${humanSlotList(schedule.require_slots)}`);
    }
    if (schedule.disallow_slots?.length) {
      parts.push(`Disallows ${humanSlotList(schedule.disallow_slots)}`);
    }
    const c = schedule.constraints;
    if (c) {
      if (c.no_earlier_than) {
        parts.push(`no eating before ${c.no_earlier_than}`);
      }
      if (c.no_later_than) {
        parts.push(`no eating after ${c.no_later_than}`);
      }
      if (typeof c.min_gap_minutes === 'number') {
        parts.push(`minimum ${c.min_gap_minutes}m between meals`);
      }
      if (typeof c.max_eating_window_minutes === 'number') {
        parts.push(`eating window ≤ ${c.max_eating_window_minutes}m`);
      }
    }
  }

  if (payload.macro_targets) {
    const m = payload.macro_targets;
    const macroBits: string[] = [];
    if (typeof m.protein_g === 'number') macroBits.push(`${m.protein_g}g protein`);
    if (typeof m.carbs_g === 'number') macroBits.push(`${m.carbs_g}g carbs`);
    if (typeof m.fat_g === 'number') macroBits.push(`${m.fat_g}g fat`);
    if (macroBits.length) parts.push(`target ${macroBits.join(' / ')} per day`);
  }

  if (payload.nds_targets) {
    const n = payload.nds_targets;
    if (typeof n.nds_score_100_min === 'number') {
      parts.push(`NDS ≥ ${n.nds_score_100_min}/100`);
    }
    const floors = n.subscore_floors_10 ?? null;
    if (floors) {
      const floorBits = Object.entries(floors)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `${k.replace(/_10$/, '')} ≥ ${v}`);
      if (floorBits.length) parts.push(`subscore floors: ${floorBits.join(', ')}`);
    }
  }

  if (payload.emphasize?.length) {
    const shown = payload.emphasize.slice(0, 3).join(', ');
    const extra = payload.emphasize.length > 3
      ? ` (+${payload.emphasize.length - 3} more)`
      : '';
    parts.push(`emphasizes ${shown}${extra}`);
  }
  if (payload.avoid?.length) {
    const shown = payload.avoid.slice(0, 3).join(', ');
    const extra = payload.avoid.length > 3
      ? ` (+${payload.avoid.length - 3} more)`
      : '';
    parts.push(`avoids ${shown}${extra}`);
  }

  if (parts.length === 0) {
    return 'No structured directives — guidance will have no measurable effect on plan generation.';
  }

  const [first, ...rest] = parts;
  const sentence = [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(', ');
  return `${sentence}.`;
}
