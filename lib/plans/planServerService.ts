/**
 * Plans — Server-Side Data Service (Phase 2)
 *
 * Supabase persistence for plans, plan_days, plan_slots, and planned_meals.
 * Server-only — never import from client/browser code.
 *
 * Responsibilities:
 *   - Build the PlanInputSnapshot from profile + goals (canonical kg, derived age)
 *   - Enforce the 18+ Plans policy boundary at plan-generation entry points
 *   - Persist AI-generated plans with NDS fields / nds_version / classifier_version
 *   - Expose narrow CRUD + read helpers for the Plans API routes
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { randomUUID } from 'crypto';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { getUserGoals } from '@/lib/journal/journalServerService';
import { projectDailyNDS } from './projection';
import {
  buildPlanScheduleSnapshot,
  normalizeMealSchedule,
  resolveMealSchedule,
} from './scheduleResolver';
import { readPersonMetadata } from './personMetadataStore';
import { matchReusableSlotToTarget } from './reusableSlotMatching';
import { assertContiguousPlanDays } from './reusableContiguousDays';
import {
  recomputePatternDerivedFields,
  recomputeTemplateDerivedFields,
  recomputeTemplateMealDerivedFields,
} from './mealNDSShapeRecompute';
export { recomputeMealNDSShape, recomputeTemplateMealDerivedFields } from './mealNDSShapeRecompute';
import {
  deleteReusablePlanDayTemplate,
  deleteReusablePlanWeekPattern,
  getReusablePlanDayTemplate,
  getReusablePlanWeekPattern,
  listReusablePlanDayTemplates,
  listReusablePlanWeekPatterns,
  saveReusablePlanDayTemplate,
  saveReusablePlanWeekPattern,
  updateReusablePlanDayTemplate,
  updateReusablePlanWeekPattern,
} from './reusablePlanningStore';
import type {
  Plan,
  PlanDay,
  PlanSlot,
  PlannedMeal,
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlanWeekPattern,
  PlanWeekPatternDay,
  ReusablePlanInstantiationProvenance,
  PlanInputSnapshot,
  PlanScheduleSnapshot,
  ProgramPlanGuidance,
  ProgramScheduleOverride,
} from './types';
import type {
  AiPlanGenerationResponse,
  AiPlannedMeal,
  AiPlanDay,
} from './validators';

// ============================================================================
// Row shapes (DB → domain)
// ============================================================================

interface PlanRow {
  id: string;
  person_id: string;
  title: string | null;
  plan_shape: 'day' | 'week' | 'multi_day';
  source: 'ai_generated' | 'user_manual' | 'program_template' | 'hybrid';
  status: 'draft' | 'active' | 'archived';
  start_date: string;
  end_date: string | null;
  program_slug: string | null;
  program_run_id: string | null;
  input_snapshot_json: PlanInputSnapshot;
  nds_version: string;
  classifier_version: string;
  created_at: string;
  updated_at: string;
}

interface PlanDayRow {
  id: string;
  plan_id: string;
  person_id: string;
  date_local: string;
  projected_nds_100: number | null;
  projected_wfr_10: number | null;
  projected_ps_10: number | null;
  projected_pnd_10: number | null;
  projected_fp_10: number | null;
  projected_as_10: number | null;
  projected_mnc_10: number | null;
  projected_ob_10: number | null;
  projection_confidence: 'high' | 'medium' | 'low' | null;
  projection_debug_json: Record<string, unknown> | null;
  notes: string | null;
  nds_version: string;
  classifier_version: string;
  created_at: string;
  updated_at: string;
}

interface PlanSlotRow {
  id: string;
  plan_day_id: string;
  person_id: string;
  slot_block: 'morning' | 'midday' | 'evening' | null;
  slot_ordinal: number;
  slot_label: string | null;
  target_time: string | null;
  created_at: string;
  updated_at: string;
}

interface PlannedMealRow {
  id: string;
  plan_id: string;
  plan_day_id: string;
  plan_slot_id: string | null;
  person_id: string;
  name: string | null;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
  payload: Record<string, unknown>;
  protein_score_10: number | null;
  is_main_meal: boolean;
  psq_multiplier: number;
  meal_derived_data: Record<string, unknown>;
  nds_confidence: 'high' | 'medium' | 'low';
  source_template_id: string | null;
  source_imported_meal_id: string | null;
  reusable_provenance: ReusablePlanInstantiationProvenance | null;
  nds_version: string;
  classifier_version: string;
  // Packet 39 — execution state (column has DEFAULT 'pending'; present on all rows after migration)
  execution_state: 'pending' | 'eaten' | 'skipped';
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

function planRowToDomain(row: PlanRow): Plan {
  return { ...row };
}

function dayRowToDomain(row: PlanDayRow): PlanDay {
  return { ...row };
}

function slotRowToDomain(row: PlanSlotRow): PlanSlot {
  return { ...row };
}

function mealRowToDomain(row: PlannedMealRow): PlannedMeal {
  return {
    id: row.id,
    plan_id: row.plan_id,
    plan_day_id: row.plan_day_id,
    plan_slot_id: row.plan_slot_id,
    person_id: row.person_id,
    name: row.name,
    meal_type: row.meal_type,
    payload: row.payload,
    protein_score_10: row.protein_score_10,
    is_main_meal: row.is_main_meal,
    psq_multiplier: row.psq_multiplier,
    meal_derived_data: row.meal_derived_data as unknown as PlannedMeal['meal_derived_data'],
    nds_confidence: row.nds_confidence,
    source_template_id: row.source_template_id,
    source_imported_meal_id: row.source_imported_meal_id,
    reusable_provenance: row.reusable_provenance ?? null,
    nds_version: row.nds_version,
    classifier_version: row.classifier_version,
    // Packet 39 — default 'pending' for rows created before the migration
    execution_state: row.execution_state ?? 'pending',
    journal_entry_id: row.journal_entry_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// Profile → input snapshot
// ============================================================================

interface PersonMetadata {
  date_of_birth?: string | null;
  sex?: 'male' | 'female' | 'unspecified' | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  weight_as_of?: string | null;
  body_fat_percent?: number | null;
  dining_out_frequency?:
    | 'never'
    | 'rarely'
    | 'weekly'
    | 'multiple_per_week'
    | 'daily'
    | null;
  shopping_mode_preference?: 'instacart' | 'in_store' | 'mixed' | null;
  household_size?: number | null;
  eating_window?: string | null;
  eating_window_start?: string | null;
  eating_window_end?: string | null;
  dietary_style?: string | null;
  allergies?: string[] | null;
  meal_schedule?: unknown; // Phase 3; normalized defensively.
}

function deriveAgeYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    years--;
  }
  return years;
}

/**
 * `people.metadata` is free-form JSONB so values are untrusted at the
 * PlanInputSnapshot boundary. The Zod PlanInputSnapshotSchema uses strict
 * enums — any stray/legacy value would blow up plan generation with a
 * 500. Normalize here so the snapshot is always valid; unknown values
 * collapse to null. This is a pure contract-safety layer; the profile UI
 * is still the source of truth for what users can pick.
 */
function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  if (typeof value !== 'string') return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const SNAPSHOT_SEX_VALUES = ['male', 'female', 'unspecified'] as const;
const SNAPSHOT_DINING_FREQ_VALUES = [
  'never',
  'rarely',
  'weekly',
  'multiple_per_week',
  'daily',
] as const;
const SNAPSHOT_SHOPPING_MODE_VALUES = ['instacart', 'in_store', 'mixed'] as const;

/**
 * Look up a person's profile metadata + goals and assemble the canonical
 * PlanInputSnapshot. All body math uses canonical weight_kg.
 */
export async function buildPlanInputSnapshot(
  personId: string,
): Promise<PlanInputSnapshot> {
  const { data: personRow, error: personErr } = await supabaseAdmin
    .from('people')
    .select('metadata')
    .eq('id', personId)
    .single();

  if (personErr) {
    throw new Error(`Failed to read person metadata: ${personErr.message}`);
  }

  const md = ((personRow?.metadata ?? {}) as PersonMetadata) || {};

  const goals = await getUserGoals(personId);

  const programGuidance = await listActiveProgramGuidance(personId);

  // Phase 3: resolve the profile schedule + program overrides into a
  // frozen schedule_snapshot that Plans persists alongside body /
  // preferences / targets. Times always come from profile — the
  // resolver never computes clock times from program constraints.
  const profileSchedule = normalizeMealSchedule(md.meal_schedule);
  const programOverrides = extractScheduleOverrides(programGuidance);
  const scheduleSnapshot: PlanScheduleSnapshot = buildPlanScheduleSnapshot(
    profileSchedule,
    programOverrides,
    md.eating_window_start ?? null,
    md.eating_window_end ?? null,
  );

  const snapshot: PlanInputSnapshot = {
    body: {
      age_years: deriveAgeYears(md.date_of_birth),
      sex: normalizeEnum(md.sex, SNAPSHOT_SEX_VALUES),
      height_cm: typeof md.height_cm === 'number' ? md.height_cm : null,
      weight_kg: typeof md.weight_kg === 'number' ? md.weight_kg : null,
      weight_as_of: md.weight_as_of ?? null,
      body_fat_percent:
        typeof md.body_fat_percent === 'number' ? md.body_fat_percent : null,
    },
    preferences: {
      dining_out_frequency: normalizeEnum(
        md.dining_out_frequency,
        SNAPSHOT_DINING_FREQ_VALUES,
      ),
      shopping_mode_preference: normalizeEnum(
        md.shopping_mode_preference,
        SNAPSHOT_SHOPPING_MODE_VALUES,
      ),
      household_size:
        typeof md.household_size === 'number' ? md.household_size : null,
      eating_window: md.eating_window ?? null,
      eating_window_start: md.eating_window_start ?? null,
      eating_window_end: md.eating_window_end ?? null,
      dietary_style: md.dietary_style ?? null,
      allergies: Array.isArray(md.allergies) ? md.allergies : null,
    },
    targets: {
      daily_calorie_goal: goals.isDefault ? null : goals.dailyCalorieGoal,
      macro_goals: goals.isDefault
        ? null
        : {
            protein_g: goals.macroGoals.protein_g,
            carbs_g: goals.macroGoals.carbs_g,
            fat_g: goals.macroGoals.fat_g,
          },
      nds_score_100_target: null,
      subscore_floors_10: null,
    },
    program_guidance: programGuidance,
    schedule_snapshot: scheduleSnapshot,
  };

  return snapshot;
}

/**
 * Pull schedule_override out of each active ProgramPlanGuidance row's
 * payload. Rows without an override (or with malformed override data)
 * are simply skipped — we never throw from the snapshot path just
 * because a program wrote an unexpected shape.
 */
function extractScheduleOverrides(
  guidance: ProgramPlanGuidance[] | null,
): ProgramScheduleOverride[] {
  if (!guidance || guidance.length === 0) return [];
  const out: ProgramScheduleOverride[] = [];
  for (const g of guidance) {
    const payload = g.guidance_payload_json as
      | (typeof g.guidance_payload_json & {
          schedule_override?: ProgramScheduleOverride | null;
        })
      | undefined;
    const ov = payload?.schedule_override;
    if (!ov || typeof ov !== 'object') continue;
    out.push({
      require_slots: Array.isArray(ov.require_slots) ? ov.require_slots : [],
      disallow_slots: Array.isArray(ov.disallow_slots) ? ov.disallow_slots : [],
      constraints: ov.constraints ?? null,
      rationale_md: ov.rationale_md ?? null,
    });
  }
  return out;
}

/**
 * Enforce the current 18+ Plans policy boundary. Throws a typed error on
 * violation so API routes can translate it into a 403.
 */
export class PlansPolicyError extends Error {
  public readonly code = 'PLANS_POLICY_VIOLATION';
  public readonly reason: 'under_18' | 'dob_missing';
  constructor(reason: 'under_18' | 'dob_missing') {
    super(
      reason === 'dob_missing'
        ? 'Date of birth is required to generate a plan.'
        : 'Plans are currently 18+. Please contact support if you believe this is an error.',
    );
    this.reason = reason;
  }
}

export function assertEighteenPlus(snapshot: PlanInputSnapshot): void {
  const age = snapshot.body.age_years;
  if (age === null) throw new PlansPolicyError('dob_missing');
  if (age < 18) throw new PlansPolicyError('under_18');
}

// ============================================================================
// Program guidance read (Phase 8: delegated to the inheritance resolver)
//
// The resolver layer lives in programAssignmentServerService and honors:
//   - active program_assignments for the person (runtime inheritance)
//   - authored program_plan_guidance rows (producer side)
//   - deterministic merge ordering (inherited first, then priority DESC,
//     then updated_at DESC)
//
// The snapshot shape is unchanged — consumers still receive a plain
// ProgramPlanGuidance[]. The richer resolution explanation is reachable
// via resolveInheritedGuidanceForPerson() from the admin inspection
// surface.
// ============================================================================

async function listActiveProgramGuidance(
  personId: string,
): Promise<ProgramPlanGuidance[]> {
  try {
    const { resolveActiveGuidanceForPlans } = await import(
      './programAssignmentServerService'
    );
    return await resolveActiveGuidanceForPlans(personId);
  } catch (err) {
    console.warn(
      '[plans/planServerService] guidance resolver failed, falling back to direct read:',
      err instanceof Error ? err.message : err,
    );
    // Safety fallback: if the Phase 8 resolver fails (e.g. migration not
    // yet applied), continue with the pre-Phase-8 direct read so Plans
    // generation never hard-fails on snapshot build.
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('program_plan_guidance')
      .select('*')
      .eq('person_id', personId)
      .eq('active', true)
      .or(`effective_from.is.null,effective_from.lte.${now}`)
      .or(`effective_until.is.null,effective_until.gt.${now}`);

    if (error) {
      console.warn(
        '[plans/planServerService] program_plan_guidance fallback query error:',
        error.message,
      );
      return [];
    }
    return (data ?? []) as unknown as ProgramPlanGuidance[];
  }
}

// ============================================================================
// CRUD: plans
// ============================================================================

export async function listPlansForPerson(personId: string): Promise<Plan[]> {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('person_id', personId)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list plans: ${error.message}`);
  return (data as PlanRow[]).map(planRowToDomain);
}

export async function getPlan(personId: string, planId: string): Promise<Plan | null> {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('id', planId)
    .eq('person_id', personId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get plan: ${error.message}`);
  return data ? planRowToDomain(data as PlanRow) : null;
}

export async function deletePlan(personId: string, planId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('plans')
    .delete()
    .eq('id', planId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to delete plan: ${error.message}`);
  return true;
}

export interface UpdatePlanArgs {
  title?: string | null;
  status?: 'draft' | 'active' | 'archived';
  end_date?: string | null;
}

export async function updatePlan(
  personId: string,
  planId: string,
  patch: UpdatePlanArgs,
): Promise<Plan | null> {
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.end_date !== undefined) updates.end_date = patch.end_date;
  if (Object.keys(updates).length === 0) return getPlan(personId, planId);

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('plans')
    .update(updates)
    .eq('id', planId)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to update plan: ${error.message}`);
  return data ? planRowToDomain(data as PlanRow) : null;
}

// ============================================================================
// Read: plan detail (days + slots + meals)
// ============================================================================

export interface PlanDetail {
  plan: Plan;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
}

export async function getPlanDetail(
  personId: string,
  planId: string,
): Promise<PlanDetail | null> {
  const plan = await getPlan(personId, planId);
  if (!plan) return null;

  const [daysRes, mealsRes] = await Promise.all([
    supabaseAdmin
      .from('plan_days')
      .select('*')
      .eq('plan_id', planId)
      .eq('person_id', personId)
      .order('date_local', { ascending: true }),
    supabaseAdmin
      .from('planned_meals')
      .select('*')
      .eq('plan_id', planId)
      .eq('person_id', personId),
  ]);

  if (daysRes.error) throw new Error(`Failed to list plan_days: ${daysRes.error.message}`);
  if (mealsRes.error) throw new Error(`Failed to list planned_meals: ${mealsRes.error.message}`);

  const dayIds = ((daysRes.data ?? []) as PlanDayRow[]).map((d) => d.id);
  let slots: PlanSlotRow[] = [];
  if (dayIds.length > 0) {
    const slotsRes = await supabaseAdmin
      .from('plan_slots')
      .select('*')
      .eq('person_id', personId)
      .in('plan_day_id', dayIds);
    if (slotsRes.error) throw new Error(`Failed to list plan_slots: ${slotsRes.error.message}`);
    slots = (slotsRes.data ?? []) as unknown as PlanSlotRow[];
  }

  return {
    plan,
    days: ((daysRes.data ?? []) as PlanDayRow[]).map(dayRowToDomain),
    slots: slots.map(slotRowToDomain),
    meals: ((mealsRes.data ?? []) as PlannedMealRow[]).map(mealRowToDomain),
  };
}

// ============================================================================
// Plan day helpers
// ============================================================================

export async function getPlanDayByDate(
  personId: string,
  planId: string,
  date_local: string,
): Promise<PlanDay | null> {
  const { data, error } = await supabaseAdmin
    .from('plan_days')
    .select('*')
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .eq('date_local', date_local)
    .maybeSingle();
  if (error) throw new Error(`Failed to read plan_day: ${error.message}`);
  return data ? dayRowToDomain(data as PlanDayRow) : null;
}

export async function getPlanDayById(
  personId: string,
  planDayId: string,
): Promise<PlanDay | null> {
  const { data, error } = await supabaseAdmin
    .from('plan_days')
    .select('*')
    .eq('id', planDayId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read plan_day: ${error.message}`);
  return data ? dayRowToDomain(data as PlanDayRow) : null;
}

export async function listSlotsForDay(
  personId: string,
  planDayId: string,
): Promise<PlanSlot[]> {
  const { data, error } = await supabaseAdmin
    .from('plan_slots')
    .select('*')
    .eq('plan_day_id', planDayId)
    .eq('person_id', personId)
    .order('slot_ordinal', { ascending: true });
  if (error) throw new Error(`Failed to list plan_slots: ${error.message}`);
  return (data as PlanSlotRow[]).map(slotRowToDomain);
}

export async function listMealsForDay(
  personId: string,
  planDayId: string,
): Promise<PlannedMeal[]> {
  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .select('*')
    .eq('plan_day_id', planDayId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to list planned_meals for day: ${error.message}`);
  return (data as PlannedMealRow[]).map(mealRowToDomain);
}

// ============================================================================
// Create planned_meal (manual / from AI payload)
// ============================================================================

export interface UpsertPlannedMealArgs {
  personId: string;
  planId: string;
  planDayId: string;
  planSlotId: string | null;
  name: string | null;
  meal_type: PlannedMeal['meal_type'];
  payload: Record<string, unknown>;
  protein_score_10: number | null;
  is_main_meal: boolean;
  psq_multiplier: number;
  meal_derived_data: Record<string, unknown>;
  nds_confidence: 'high' | 'medium' | 'low';
  source_template_id?: string | null;
  source_imported_meal_id?: string | null;
  reusable_provenance?: ReusablePlanInstantiationProvenance | null;
}

export async function insertPlannedMeal(args: UpsertPlannedMealArgs): Promise<PlannedMeal> {
  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .insert({
      person_id: args.personId,
      plan_id: args.planId,
      plan_day_id: args.planDayId,
      plan_slot_id: args.planSlotId,
      name: args.name,
      meal_type: args.meal_type,
      payload: args.payload,
      protein_score_10: args.protein_score_10,
      is_main_meal: args.is_main_meal,
      psq_multiplier: args.psq_multiplier,
      meal_derived_data: args.meal_derived_data,
      nds_confidence: args.nds_confidence,
      source_template_id: args.source_template_id ?? null,
      source_imported_meal_id: args.source_imported_meal_id ?? null,
      reusable_provenance: args.reusable_provenance ?? null,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert planned_meal: ${error.message}`);
  return mealRowToDomain(data as PlannedMealRow);
}

export async function updatePlannedMeal(
  personId: string,
  mealId: string,
  patch: Partial<UpsertPlannedMealArgs>,
): Promise<PlannedMeal | null> {
  const updates: Record<string, unknown> = {};
  const copy = (
    source: Partial<UpsertPlannedMealArgs>,
    keys: (keyof UpsertPlannedMealArgs)[],
  ) => {
    for (const k of keys) if (source[k] !== undefined) updates[k] = source[k];
  };
  copy(patch, [
    'name',
    'meal_type',
    'payload',
    'protein_score_10',
    'is_main_meal',
    'psq_multiplier',
    'meal_derived_data',
    'nds_confidence',
    'source_template_id',
    'source_imported_meal_id',
    'reusable_provenance',
  ]);
  if (patch.planSlotId !== undefined) updates.plan_slot_id = patch.planSlotId;
  if (Object.keys(updates).length === 0) return getPlannedMeal(personId, mealId);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .update(updates)
    .eq('id', mealId)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update planned_meal: ${error.message}`);
  return data ? mealRowToDomain(data as PlannedMealRow) : null;
}

export async function getPlannedMeal(
  personId: string,
  mealId: string,
): Promise<PlannedMeal | null> {
  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .select('*')
    .eq('id', mealId)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to get planned_meal: ${error.message}`);
  return data ? mealRowToDomain(data as PlannedMealRow) : null;
}

export async function deletePlannedMeal(
  personId: string,
  mealId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('planned_meals')
    .delete()
    .eq('id', mealId)
    .eq('person_id', personId);
  if (error) throw new Error(`Failed to delete planned_meal: ${error.message}`);
  return true;
}

/**
 * Packet 40 — move/reschedule one planned meal without touching siblings.
 *
 * The move is intentionally limited to pending meals. Already eaten/skipped
 * rows carry historical truth from Packet 39 and must be undone before they
 * can become future plan items again.
 */
export async function movePlannedMeal(
  personId: string,
  mealId: string,
  targetPlanDayId: string,
  targetPlanSlotId: string | null,
): Promise<{
  meal: PlannedMeal;
  source_plan_day_id: string;
  target_plan_day_id: string;
}> {
  const existing = await getPlannedMeal(personId, mealId);
  if (!existing) throw new Error('Planned meal not found.');
  if (existing.execution_state !== 'pending') {
    throw new Error('Handled planned meals must be undone before they can be moved.');
  }

  const { data: targetDay, error: dayErr } = await supabaseAdmin
    .from('plan_days')
    .select('id, plan_id, person_id')
    .eq('id', targetPlanDayId)
    .eq('person_id', personId)
    .maybeSingle();
  if (dayErr) throw new Error(`Failed to load target plan day: ${dayErr.message}`);
  if (!targetDay || targetDay.plan_id !== existing.plan_id) {
    throw new Error('Target plan day was not found under this plan.');
  }

  if (targetPlanSlotId) {
    const { data: targetSlot, error: slotErr } = await supabaseAdmin
      .from('plan_slots')
      .select('id, plan_day_id, person_id')
      .eq('id', targetPlanSlotId)
      .eq('person_id', personId)
      .maybeSingle();
    if (slotErr) throw new Error(`Failed to load target slot: ${slotErr.message}`);
    if (!targetSlot || targetSlot.plan_day_id !== targetPlanDayId) {
      throw new Error('Target slot was not found under the target day.');
    }
  }

  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .update({
      plan_day_id: targetPlanDayId,
      plan_slot_id: targetPlanSlotId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mealId)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to move planned meal: ${error.message}`);
  if (!data) throw new Error('Planned meal not found.');

  await recomputePlanDayProjection(personId, existing.plan_day_id);
  if (targetPlanDayId !== existing.plan_day_id) {
    await recomputePlanDayProjection(personId, targetPlanDayId);
  }

  return {
    meal: mealRowToDomain(data as PlannedMealRow),
    source_plan_day_id: existing.plan_day_id,
    target_plan_day_id: targetPlanDayId,
  };
}

/**
 * Packet 41 — copy one planned meal into another day/slot.
 *
 * Copying is intentionally not execution cloning: the new row is a fresh
 * pending planned_meal identity. Source execution_state and journal links
 * stay only on the original row.
 */
export async function copyPlannedMeal(
  personId: string,
  mealId: string,
  targetPlanDayId: string,
  targetPlanSlotId: string | null,
): Promise<{
  meal: PlannedMeal;
  source_planned_meal_id: string;
  target_plan_day_id: string;
}> {
  const source = await getPlannedMeal(personId, mealId);
  if (!source) throw new Error('Planned meal not found.');

  const { data: targetDay, error: dayErr } = await supabaseAdmin
    .from('plan_days')
    .select('id, plan_id, person_id')
    .eq('id', targetPlanDayId)
    .eq('person_id', personId)
    .maybeSingle();
  if (dayErr) throw new Error(`Failed to load target plan day: ${dayErr.message}`);
  if (!targetDay || targetDay.plan_id !== source.plan_id) {
    throw new Error('Target plan day was not found under this plan.');
  }

  if (targetPlanSlotId) {
    const { data: targetSlot, error: slotErr } = await supabaseAdmin
      .from('plan_slots')
      .select('id, plan_day_id, person_id')
      .eq('id', targetPlanSlotId)
      .eq('person_id', personId)
      .maybeSingle();
    if (slotErr) throw new Error(`Failed to load target slot: ${slotErr.message}`);
    if (!targetSlot || targetSlot.plan_day_id !== targetPlanDayId) {
      throw new Error('Target slot was not found under the target day.');
    }
  }

  const meal = await insertPlannedMeal({
    personId,
    planId: source.plan_id,
    planDayId: targetPlanDayId,
    planSlotId: targetPlanSlotId,
    name: source.name,
    meal_type: source.meal_type,
    payload: source.payload,
    protein_score_10: source.protein_score_10,
    is_main_meal: source.is_main_meal,
    psq_multiplier: source.psq_multiplier,
    meal_derived_data: source.meal_derived_data as unknown as Record<string, unknown>,
    nds_confidence: source.nds_confidence,
    source_template_id: source.source_template_id,
    source_imported_meal_id: source.source_imported_meal_id,
  });

  await recomputePlanDayProjection(personId, targetPlanDayId);

  return {
    meal,
    source_planned_meal_id: source.id,
    target_plan_day_id: targetPlanDayId,
  };
}

function plannedMealToTemplateMeal(meal: PlannedMeal): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: meal.id,
    name: meal.name,
    meal_type: meal.meal_type,
    payload: meal.payload,
    protein_score_10: meal.protein_score_10,
    is_main_meal: meal.is_main_meal,
    psq_multiplier: meal.psq_multiplier,
    meal_derived_data: meal.meal_derived_data,
    nds_confidence: meal.nds_confidence,
    source_template_id: meal.source_template_id,
    source_imported_meal_id: meal.source_imported_meal_id,
    nds_version: meal.nds_version,
    classifier_version: meal.classifier_version,
  };
}

export async function listPlanDayTemplates(personId: string): Promise<PlanDayTemplate[]> {
  return listReusablePlanDayTemplates(personId);
}

export async function listPlanWeekPatterns(personId: string): Promise<PlanWeekPattern[]> {
  return listReusablePlanWeekPatterns(personId);
}

async function planDayToPatternDaySnapshot(
  personId: string,
  planDay: PlanDay,
  dayOffset: number,
): Promise<PlanWeekPatternDay> {
  const [slots, meals] = await Promise.all([
    listSlotsForDay(personId, planDay.id),
    listMealsForDay(personId, planDay.id),
  ]);
  const mealsBySlot = new Map<string, PlannedMeal[]>();
  for (const meal of meals) {
    const key = meal.plan_slot_id ?? '__unassigned__';
    const current = mealsBySlot.get(key) ?? [];
    current.push(meal);
    mealsBySlot.set(key, current);
  }

  return {
    day_offset: dayOffset,
    source_plan_day_id: planDay.id,
    source_date_local: planDay.date_local,
    slots: slots.map((slot) => ({
      source_plan_slot_id: slot.id,
      slot_ordinal: slot.slot_ordinal,
      slot_block: slot.slot_block,
      slot_label: slot.slot_label,
      target_time: slot.target_time,
      meals: (mealsBySlot.get(slot.id) ?? []).map(plannedMealToTemplateMeal),
    })),
    unassigned_meals: (mealsBySlot.get('__unassigned__') ?? []).map(plannedMealToTemplateMeal),
  };
}

export async function savePlanDayAsTemplate(args: {
  personId: string;
  planId: string;
  planDayId: string;
  name: string | null;
  includeMeals?: boolean;
}): Promise<PlanDayTemplate> {
  const { personId, planId, planDayId } = args;
  const includeMeals = args.includeMeals !== false;

  const { data: dayRow, error: dayErr } = await supabaseAdmin
    .from('plan_days')
    .select('*')
    .eq('id', planDayId)
    .eq('plan_id', planId)
    .eq('person_id', personId)
    .maybeSingle();
  if (dayErr) throw new Error(`Failed to load source plan day: ${dayErr.message}`);
  if (!dayRow) throw new Error('Source plan day not found.');

  const [slots, meals] = await Promise.all([
    listSlotsForDay(personId, planDayId),
    includeMeals ? listMealsForDay(personId, planDayId) : Promise.resolve([] as PlannedMeal[]),
  ]);
  const mealsBySlot = new Map<string, PlannedMeal[]>();
  for (const meal of meals) {
    const key = meal.plan_slot_id ?? '__unassigned__';
    const current = mealsBySlot.get(key) ?? [];
    current.push(meal);
    mealsBySlot.set(key, current);
  }

  const templateSlots: PlanDayTemplateSlot[] = slots.map((slot) => ({
    source_plan_slot_id: slot.id,
    slot_ordinal: slot.slot_ordinal,
    slot_block: slot.slot_block,
    slot_label: slot.slot_label,
    target_time: slot.target_time,
    meals: includeMeals
      ? (mealsBySlot.get(slot.id) ?? []).map(plannedMealToTemplateMeal)
      : [],
  }));
  const unassignedMeals = includeMeals
    ? (mealsBySlot.get('__unassigned__') ?? []).map(plannedMealToTemplateMeal)
    : [];

  const now = new Date().toISOString();
  const day = dayRowToDomain(dayRow as PlanDayRow);
  const template: PlanDayTemplate = {
    id: randomUUID(),
    person_id: personId,
    name: args.name?.trim() || `Template from ${day.date_local}`,
    scope: 'day',
    source_plan_id: planId,
    source_plan_day_id: planDayId,
    source_date_local: day.date_local,
    slots: templateSlots,
    unassigned_meals: unassignedMeals,
    apply_policy: 'append',
    created_at: now,
    updated_at: now,
  };

  await saveReusablePlanDayTemplate(template);
  return template;
}

export async function instantiatePlanDayTemplate(args: {
  personId: string;
  templateId: string;
  targetPlanId: string;
  targetPlanDayId: string;
  applyPolicy?: 'append';
  allowDuplicateAppend?: boolean;
}): Promise<{
  template: PlanDayTemplate;
  meals: PlannedMeal[];
  target_plan_day_id: string;
}> {
  const { personId, templateId, targetPlanId, targetPlanDayId } = args;
  const applyPolicy = args.applyPolicy ?? 'append';
  if (applyPolicy !== 'append') {
    throw new Error('Only append template application is supported.');
  }
  const templates = await listPlanDayTemplates(personId);
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new Error('Plan day template not found.');

  const { data: targetDay, error: dayErr } = await supabaseAdmin
    .from('plan_days')
    .select('id, plan_id, person_id')
    .eq('id', targetPlanDayId)
    .eq('plan_id', targetPlanId)
    .eq('person_id', personId)
    .maybeSingle();
  if (dayErr) throw new Error(`Failed to load target plan day: ${dayErr.message}`);
  if (!targetDay) throw new Error('Target plan day not found.');

  const targetSlots = await listSlotsForDay(personId, targetPlanDayId);
  const existingMeals = await listMealsForDay(personId, targetPlanDayId);
  if (existingMeals.length > 0 && !args.allowDuplicateAppend) {
    throw new Error('Target day already has meals. Confirm append before applying template.');
  }
  const findTargetSlot = (templateSlot: PlanDayTemplateSlot): PlanSlot | null => {
    return matchReusableSlotToTarget(templateSlot, targetSlots).slot;
  };
  const inserted: PlannedMeal[] = [];
  const instantiatedAt = new Date().toISOString();

  const insertFromTemplateMeal = async (
    templateMeal: PlanDayTemplateMeal,
    planSlotId: string | null,
  ): Promise<void> => {
    const derivedMeal = recomputeTemplateMealDerivedFields(templateMeal);
    const meal = await insertPlannedMeal({
      personId,
      planId: targetPlanId,
      planDayId: targetPlanDayId,
      planSlotId,
      name: derivedMeal.name,
      meal_type: derivedMeal.meal_type,
      payload: derivedMeal.payload,
      protein_score_10: derivedMeal.protein_score_10,
      is_main_meal: derivedMeal.is_main_meal,
      psq_multiplier: derivedMeal.psq_multiplier,
      meal_derived_data: derivedMeal.meal_derived_data as unknown as Record<string, unknown>,
      nds_confidence: derivedMeal.nds_confidence,
      source_template_id: derivedMeal.source_template_id,
      source_imported_meal_id: derivedMeal.source_imported_meal_id,
      reusable_provenance: {
        kind: 'day_template',
        id: template.id,
        name: template.name,
        instantiated_at: instantiatedAt,
        source_plan_id: template.source_plan_id,
        source_plan_day_id: template.source_plan_day_id,
        source_date_local: template.source_date_local,
        source_planned_meal_id: templateMeal.source_planned_meal_id,
      },
    });
    inserted.push(meal);
  };

  for (const templateSlot of template.slots) {
    const targetSlot = findTargetSlot(templateSlot);
    for (const templateMeal of templateSlot.meals) {
      await insertFromTemplateMeal(templateMeal, targetSlot?.id ?? null);
    }
  }
  for (const templateMeal of template.unassigned_meals ?? []) {
    await insertFromTemplateMeal(templateMeal, null);
  }

  await recomputePlanDayProjection(personId, targetPlanDayId);

  return {
    template,
    meals: inserted,
    target_plan_day_id: targetPlanDayId,
  };
}

export async function savePlanWeekPattern(args: {
  personId: string;
  planId: string;
  sourcePlanDayIds: string[];
  name: string | null;
}): Promise<PlanWeekPattern> {
  const { personId, planId } = args;
  const uniqueIds = Array.from(new Set(args.sourcePlanDayIds));
  if (uniqueIds.length === 0) {
    throw new Error('At least one source day is required.');
  }

  const detail = await getPlanDetail(personId, planId);
  if (!detail) throw new Error('Plan not found.');

  const selected = detail.days
    .filter((day) => uniqueIds.includes(day.id))
    .sort((a, b) => a.date_local.localeCompare(b.date_local));
  if (selected.length !== uniqueIds.length) {
    throw new Error('One or more source days were not found under this plan.');
  }
  assertContiguousPlanDays(selected);

  const days: PlanWeekPatternDay[] = [];
  for (let i = 0; i < selected.length; i += 1) {
    days.push(await planDayToPatternDaySnapshot(personId, selected[i]!, i));
  }

  const now = new Date().toISOString();
  const pattern: PlanWeekPattern = {
    id: randomUUID(),
    person_id: personId,
    name:
      args.name?.trim() ||
      `Pattern ${selected[0]!.date_local} to ${selected[selected.length - 1]!.date_local}`,
    scope: 'week_pattern',
    source_plan_id: planId,
    source_date_start: selected[0]!.date_local,
    source_date_end: selected[selected.length - 1]!.date_local,
    days,
    apply_policy: 'append',
    created_at: now,
    updated_at: now,
  };

  await saveReusablePlanWeekPattern(pattern);
  return pattern;
}

async function resolveActivePlanContext(personId: string): Promise<{
  plan: Plan;
  referenceDay: PlanDay;
}> {
  const plans = await listPlansForPerson(personId);
  const plan = plans.find((p) => p.status === 'active') ?? plans[0] ?? null;
  if (!plan) throw new Error('No plan found. Generate a plan before creating reusable templates.');
  const detail = await getPlanDetail(personId, plan.id);
  if (!detail || detail.days.length === 0) {
    throw new Error('Active plan has no days yet.');
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
  const referenceDay =
    detail.days.find((day) => day.date_local === todayKey) ??
    [...detail.days].sort((a, b) => a.date_local.localeCompare(b.date_local))[0]!;
  return { plan, referenceDay };
}

async function buildBlankTemplateSlotsFromSchedule(
  personId: string,
): Promise<PlanDayTemplateSlot[]> {
  const meta = await readPersonMetadata(personId);
  const schedule = normalizeMealSchedule(meta.meal_schedule);
  const resolved = resolveMealSchedule({
    profile_schedule: schedule,
    program_overrides: [],
  });
  return resolved.resolved_slots
    .filter((slot) => slot.enabled)
    .map((slot, index) => ({
      source_plan_slot_id: randomUUID(),
      slot_ordinal: index + 1,
      slot_block: slot.slot_block,
      slot_label: slot.label,
      target_time: slot.target_time,
      meals: [],
    }));
}

export async function getPlanDayTemplate(
  personId: string,
  templateId: string,
): Promise<PlanDayTemplate | null> {
  return getReusablePlanDayTemplate(personId, templateId);
}

export async function createBlankPlanDayTemplate(args: {
  personId: string;
  name: string | null;
}): Promise<PlanDayTemplate> {
  const { plan, referenceDay } = await resolveActivePlanContext(args.personId);
  const slots = await buildBlankTemplateSlotsFromSchedule(args.personId);
  const now = new Date().toISOString();
  const template: PlanDayTemplate = {
    id: randomUUID(),
    person_id: args.personId,
    name: args.name?.trim() || 'New day template',
    scope: 'day',
    source_plan_id: plan.id,
    source_plan_day_id: referenceDay.id,
    source_date_local: referenceDay.date_local,
    slots,
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: now,
    updated_at: now,
  };
  await saveReusablePlanDayTemplate(template);
  return template;
}

export async function updatePlanDayTemplate(args: {
  personId: string;
  templateId: string;
  name?: string | null;
  slots?: PlanDayTemplateSlot[];
  unassigned_meals?: PlanDayTemplateMeal[];
}): Promise<PlanDayTemplate> {
  const existing = await getReusablePlanDayTemplate(args.personId, args.templateId);
  if (!existing) throw new Error('Plan day template not found.');
  const updated: PlanDayTemplate = recomputeTemplateDerivedFields({
    ...existing,
    name: args.name !== undefined ? (args.name?.trim() || existing.name) : existing.name,
    slots: args.slots ?? existing.slots,
    unassigned_meals: args.unassigned_meals ?? existing.unassigned_meals,
    updated_at: new Date().toISOString(),
  });
  return updateReusablePlanDayTemplate(updated);
}

export async function deletePlanDayTemplate(
  personId: string,
  templateId: string,
): Promise<void> {
  const existing = await getReusablePlanDayTemplate(personId, templateId);
  if (!existing) throw new Error('Plan day template not found.');
  await deleteReusablePlanDayTemplate(personId, templateId);
}

export async function duplicatePlanDayTemplate(
  personId: string,
  templateId: string,
): Promise<PlanDayTemplate> {
  const existing = await getReusablePlanDayTemplate(personId, templateId);
  if (!existing) throw new Error('Plan day template not found.');
  const now = new Date().toISOString();
  const copy: PlanDayTemplate = {
    ...existing,
    id: randomUUID(),
    name: `${existing.name} (Copy)`,
    created_at: now,
    updated_at: now,
  };
  await saveReusablePlanDayTemplate(copy);
  return copy;
}

export async function getPlanWeekPattern(
  personId: string,
  patternId: string,
): Promise<PlanWeekPattern | null> {
  return getReusablePlanWeekPattern(personId, patternId);
}

export async function updatePlanWeekPattern(args: {
  personId: string;
  patternId: string;
  name?: string | null;
  days?: PlanWeekPatternDay[];
}): Promise<PlanWeekPattern> {
  const existing = await getReusablePlanWeekPattern(args.personId, args.patternId);
  if (!existing) throw new Error('Plan week pattern not found.');
  const updated: PlanWeekPattern = recomputePatternDerivedFields({
    ...existing,
    name: args.name !== undefined ? (args.name?.trim() || existing.name) : existing.name,
    days: args.days ?? existing.days,
    updated_at: new Date().toISOString(),
  });
  return updateReusablePlanWeekPattern(updated);
}

export async function deletePlanWeekPattern(
  personId: string,
  patternId: string,
): Promise<void> {
  const existing = await getReusablePlanWeekPattern(personId, patternId);
  if (!existing) throw new Error('Plan week pattern not found.');
  await deleteReusablePlanWeekPattern(personId, patternId);
}

export async function duplicatePlanWeekPattern(
  personId: string,
  patternId: string,
): Promise<PlanWeekPattern> {
  const existing = await getReusablePlanWeekPattern(personId, patternId);
  if (!existing) throw new Error('Plan week pattern not found.');
  const now = new Date().toISOString();
  const copy: PlanWeekPattern = {
    ...existing,
    id: randomUUID(),
    name: `${existing.name} (Copy)`,
    created_at: now,
    updated_at: now,
  };
  await saveReusablePlanWeekPattern(copy);
  return copy;
}

export async function instantiatePlanWeekPattern(args: {
  personId: string;
  patternId: string;
  targetPlanId: string;
  targetStartPlanDayId: string;
  applyPolicy?: 'append';
  allowDuplicateAppend?: boolean;
}): Promise<{
  pattern: PlanWeekPattern;
  meals: PlannedMeal[];
  target_plan_day_ids: string[];
  appended_to_existing_meal_count: number;
}> {
  const applyPolicy = args.applyPolicy ?? 'append';
  if (applyPolicy !== 'append') {
    throw new Error('Only append week-pattern application is supported.');
  }

  const patterns = await listPlanWeekPatterns(args.personId);
  const pattern = patterns.find((p) => p.id === args.patternId);
  if (!pattern) throw new Error('Plan week pattern not found.');

  const detail = await getPlanDetail(args.personId, args.targetPlanId);
  if (!detail) throw new Error('Target plan not found.');
  const days = [...detail.days].sort((a, b) => a.date_local.localeCompare(b.date_local));
  const startIndex = days.findIndex((d) => d.id === args.targetStartPlanDayId);
  if (startIndex < 0) throw new Error('Target start day not found.');
  if (startIndex + pattern.days.length > days.length) {
    throw new Error('Target plan does not have enough contiguous days for this pattern.');
  }

  const targetDays = pattern.days.map((patternDay, idx) => {
    const targetDay = days[startIndex + idx]!;
    return { patternDay, targetDay };
  });
  const targetDayIds = targetDays.map(({ targetDay }) => targetDay.id);
  const existingMeals = detail.meals.filter((meal) => targetDayIds.includes(meal.plan_day_id));
  if (existingMeals.length > 0 && !args.allowDuplicateAppend) {
    throw new Error(
      `Target span already has ${existingMeals.length} planned meal(s). Confirm append before applying week pattern.`,
    );
  }

  const inserted: PlannedMeal[] = [];
  const instantiatedAt = new Date().toISOString();
  for (const { patternDay, targetDay } of targetDays) {
    const targetSlots = await listSlotsForDay(args.personId, targetDay.id);
    const findTargetSlot = (templateSlot: PlanDayTemplateSlot): PlanSlot | null => {
      return matchReusableSlotToTarget(templateSlot, targetSlots).slot;
    };

    const insertFromTemplateMeal = async (
      templateMeal: PlanDayTemplateMeal,
      planSlotId: string | null,
    ): Promise<void> => {
      const derivedMeal = recomputeTemplateMealDerivedFields(templateMeal);
      const meal = await insertPlannedMeal({
        personId: args.personId,
        planId: args.targetPlanId,
        planDayId: targetDay.id,
        planSlotId,
        name: derivedMeal.name,
        meal_type: derivedMeal.meal_type,
        payload: derivedMeal.payload,
        protein_score_10: derivedMeal.protein_score_10,
        is_main_meal: derivedMeal.is_main_meal,
        psq_multiplier: derivedMeal.psq_multiplier,
        meal_derived_data: derivedMeal.meal_derived_data as unknown as Record<string, unknown>,
        nds_confidence: derivedMeal.nds_confidence,
        source_template_id: derivedMeal.source_template_id,
        source_imported_meal_id: derivedMeal.source_imported_meal_id,
        reusable_provenance: {
          kind: 'week_pattern',
          id: pattern.id,
          name: pattern.name,
          instantiated_at: instantiatedAt,
          source_plan_id: pattern.source_plan_id,
          source_plan_day_id: patternDay.source_plan_day_id,
          source_date_local: patternDay.source_date_local,
          source_planned_meal_id: templateMeal.source_planned_meal_id,
          pattern_day_offset: patternDay.day_offset,
        },
      });
      inserted.push(meal);
    };

    for (const templateSlot of patternDay.slots) {
      const targetSlot = findTargetSlot(templateSlot);
      for (const templateMeal of templateSlot.meals) {
        await insertFromTemplateMeal(templateMeal, targetSlot?.id ?? null);
      }
    }
    for (const templateMeal of patternDay.unassigned_meals ?? []) {
      await insertFromTemplateMeal(templateMeal, null);
    }
  }

  await Promise.all(targetDayIds.map((id) => recomputePlanDayProjection(args.personId, id)));

  return {
    pattern,
    meals: inserted,
    target_plan_day_ids: targetDayIds,
    appended_to_existing_meal_count: existingMeals.length,
  };
}

// ============================================================================
// Packet 39 — Plan-to-Journal execution
//
// Connects planned meals to lived consumption. Execution is additive:
// the planned_meal payload is NEVER mutated; it always reflects what was
// planned. The resulting journal_entry captures what was actually consumed.
// ============================================================================

import { createEntry, deleteEntry, getEntry } from '@/lib/journal/journalServerService';
import { removeLinkedJournalEntryForUndo } from './plannedMealUndoJournal';
import { assertAdjustedIntakePayloadAcceptable } from './plannedMealAdjustedPayloadValidation';
import type { JournalEntry, JournalEntryPayload } from '@/lib/journal/journalServerService';
import { intakePayloadSchema } from '@/lib/journal/payloadValidators';
import {
  buildExactPlannedMealIntakePayload,
  plannedMealAlreadyLogged,
} from './plannedMealExecutionPayload';
import type { GroupedMealEntryPayload } from '@/lib/meals/types';

export type ExecuteAction = 'eat' | 'skip' | 'undo' | 'log_adjusted';

export interface ExecuteMealResult {
  meal: PlannedMeal;
  /** Set when action creates or returns a journal entry (eat / log_adjusted). */
  journal_entry: JournalEntry | null;
  /** True when the request returned an existing linked entry (idempotent). */
  already_logged?: boolean;
}

async function getExistingEatExecution(
  personId: string,
  meal: PlannedMeal,
): Promise<ExecuteMealResult | null> {
  if (!plannedMealAlreadyLogged(meal)) return null;
  const journal_entry = meal.journal_entry_id
    ? await getEntry(personId, meal.journal_entry_id)
    : null;
  return { meal, journal_entry, already_logged: true };
}

async function claimPlannedMealJournalLink(
  personId: string,
  mealId: string,
  journalEntryId: string,
): Promise<PlannedMeal | null> {
  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .update({
      execution_state: 'eaten',
      journal_entry_id: journalEntryId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mealId)
    .eq('person_id', personId)
    .eq('execution_state', 'pending')
    .is('journal_entry_id', null)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to mark meal eaten: ${error.message}`);
  return data ? mealRowToDomain(data as PlannedMealRow) : null;
}

async function finalizePlannedMealJournalLog(
  personId: string,
  mealId: string,
  mealBefore: PlannedMeal,
  intakePayload: GroupedMealEntryPayload,
  occurredAtDate: Date,
): Promise<ExecuteMealResult> {
  const existing = await getExistingEatExecution(personId, mealBefore);
  if (existing) return existing;

  const entry = await createEntry({
    personId,
    entryType: 'intake',
    occurredAt: occurredAtDate,
    payload: intakePayload as JournalEntryPayload,
  });

  const claimed = await claimPlannedMealJournalLink(personId, mealId, entry.id);
  if (claimed) {
    return { meal: claimed, journal_entry: entry };
  }

  await deleteEntry(personId, entry.id).catch(() => undefined);
  const refreshed = await getPlannedMeal(personId, mealId);
  if (!refreshed) throw new Error('Planned meal not found.');
  const raced = await getExistingEatExecution(personId, refreshed);
  if (raced) return raced;
  throw new Error('Failed to link planned meal to journal entry.');
}

/**
 * Execute a planned meal:
 *   eat  — create a journal_entry from the meal's payload, back-link it,
 *           and mark execution_state='eaten'.
 *   skip — mark execution_state='skipped' (no journal entry).
 *   undo — revert to 'pending'; delete the linked journal entry if present.
 *
 * @param occurred_at ISO timestamp for the journal entry (eat action only).
 *        Defaults to the current server time when not provided.
 */
export async function executePlannedMeal(
  personId: string,
  mealId: string,
  action: ExecuteAction,
  occurred_at?: string,
  intake_payload?: GroupedMealEntryPayload,
): Promise<ExecuteMealResult> {
  const meal = await getPlannedMeal(personId, mealId);
  if (!meal) throw new Error('Planned meal not found.');

  if (action === 'eat') {
    const existing = await getExistingEatExecution(personId, meal);
    if (existing) return existing;

    const intakePayload = buildExactPlannedMealIntakePayload(meal);
    const occurredAtDate = occurred_at ? new Date(occurred_at) : new Date();
    return finalizePlannedMealJournalLog(
      personId,
      mealId,
      meal,
      intakePayload,
      occurredAtDate,
    );
  }

  if (action === 'log_adjusted') {
    const existing = await getExistingEatExecution(personId, meal);
    if (existing) return existing;

    if (!intake_payload) {
      throw new Error('intake_payload is required for log_adjusted.');
    }
    const parsed = intakePayloadSchema.safeParse(intake_payload);
    if (!parsed.success) {
      throw new Error('Invalid adjusted intake payload.');
    }
    if (parsed.data.source_planned_meal_id && parsed.data.source_planned_meal_id !== mealId) {
      throw new Error('Adjusted intake payload must reference the same planned meal.');
    }
    assertAdjustedIntakePayloadAcceptable(parsed.data as GroupedMealEntryPayload);
    const payload: GroupedMealEntryPayload = {
      ...parsed.data,
      name: parsed.data.name ?? meal.name ?? 'Planned meal',
      source_planned_meal_id: mealId,
      logged_as_planned: false,
      meal_group: parsed.data.meal_group
        ? {
            ...parsed.data.meal_group,
            source_planned_meal_id: mealId,
            logged_as_planned: false,
            detached_from_source: true,
          }
        : undefined,
    };

    const occurredAtDate = occurred_at ? new Date(occurred_at) : new Date();
    return finalizePlannedMealJournalLog(
      personId,
      mealId,
      meal,
      payload,
      occurredAtDate,
    );
  }

  if (action === 'skip') {
    const { data, error } = await supabaseAdmin
      .from('planned_meals')
      .update({
        execution_state: 'skipped',
        journal_entry_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mealId)
      .eq('person_id', personId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to mark meal skipped: ${error.message}`);
    return { meal: mealRowToDomain(data as PlannedMealRow), journal_entry: null };
  }

  if (action === 'undo') {
    if (meal.journal_entry_id) {
      await removeLinkedJournalEntryForUndo(personId, meal.journal_entry_id);
    }
    const { data, error } = await supabaseAdmin
      .from('planned_meals')
      .update({
        execution_state: 'pending',
        journal_entry_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mealId)
      .eq('person_id', personId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to undo meal execution: ${error.message}`);
    return { meal: mealRowToDomain(data as PlannedMealRow), journal_entry: null };
  }

  throw new Error(`Unknown execute action: ${action as string}`);
}

// ============================================================================
// Persist an AI-generated plan in a single pass
// ============================================================================

export interface PersistAiPlanArgs {
  personId: string;
  ai: AiPlanGenerationResponse;
  input_snapshot: PlanInputSnapshot;
  start_date: string;
  end_date: string | null;
}

export async function persistAiPlan(args: PersistAiPlanArgs): Promise<PlanDetail> {
  const { personId, ai, input_snapshot, start_date, end_date } = args;

  const { data: planIns, error: planErr } = await supabaseAdmin
    .from('plans')
    .insert({
      person_id: personId,
      title: ai.title,
      plan_shape: ai.plan_shape,
      source: 'ai_generated',
      status: 'active',
      start_date,
      end_date,
      input_snapshot_json: input_snapshot,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    })
    .select('*')
    .single();
  if (planErr) throw new Error(`Failed to insert plan: ${planErr.message}`);
  const plan = planRowToDomain(planIns as PlanRow);

  const days: PlanDay[] = [];
  const slots: PlanSlot[] = [];
  const meals: PlannedMeal[] = [];

  for (const aiDay of ai.plan_days) {
    const day = await insertPlanDayFromAi(personId, plan.id, aiDay);
    days.push(day);

    for (const aiSlot of aiDay.slots) {
      const { data: slotIns, error: slotErr } = await supabaseAdmin
        .from('plan_slots')
        .insert({
          person_id: personId,
          plan_day_id: day.id,
          slot_block: aiSlot.slot_block,
          slot_ordinal: aiSlot.slot_ordinal,
          slot_label: aiSlot.slot_label ?? null,
          target_time: aiSlot.target_time ?? null,
        })
        .select('*')
        .single();
      if (slotErr) throw new Error(`Failed to insert plan_slot: ${slotErr.message}`);
      const slot = slotRowToDomain(slotIns as PlanSlotRow);
      slots.push(slot);

      for (const aiMeal of aiSlot.planned_meals) {
        const meal = await insertPlannedMeal({
          personId,
          planId: plan.id,
          planDayId: day.id,
          planSlotId: slot.id,
          name: aiMeal.name,
          meal_type: aiMeal.meal_type,
          payload: aiMeal.payload as Record<string, unknown>,
          protein_score_10: aiMeal.protein_score_10,
          is_main_meal: aiMeal.is_main_meal,
          psq_multiplier: aiMeal.psq_multiplier,
          meal_derived_data: aiMeal.meal_derived_data as Record<string, unknown>,
          nds_confidence: aiMeal.nds_confidence,
          source_imported_meal_id: aiMeal.source_imported_meal_id ?? null,
        });
        meals.push(meal);
      }
    }
  }

  return { plan, days, slots, meals };
}

async function insertPlanDayFromAi(
  personId: string,
  planId: string,
  aiDay: AiPlanDay,
): Promise<PlanDay> {
  const p = aiDay.projected_daily_nds;
  const { data, error } = await supabaseAdmin
    .from('plan_days')
    .insert({
      person_id: personId,
      plan_id: planId,
      date_local: aiDay.date_local,
      projected_nds_100: p.projected_nds_100,
      projected_wfr_10: p.projected_wfr_10,
      projected_ps_10: p.projected_ps_10,
      projected_pnd_10: p.projected_pnd_10,
      projected_fp_10: p.projected_fp_10,
      projected_as_10: p.projected_as_10,
      projected_mnc_10: p.projected_mnc_10,
      projected_ob_10: p.projected_ob_10,
      projection_confidence: p.projection_confidence,
      projection_debug_json: null,
      notes: aiDay.notes ?? null,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert plan_day: ${error.message}`);
  return dayRowToDomain(data as PlanDayRow);
}

// ============================================================================
// Convenience: turn a DB planned_meal back into the AI-shaped payload so
// regenerate-slot can feed the current meal back into the gateway.
// ============================================================================

export function plannedMealToAiShape(meal: PlannedMeal): AiPlannedMeal {
  return {
    name: meal.name ?? 'meal',
    meal_type: meal.meal_type,
    payload: meal.payload as AiPlannedMeal['payload'],
    source_imported_meal_id: meal.source_imported_meal_id ?? null,
    protein_score_10: meal.protein_score_10,
    is_main_meal: meal.is_main_meal,
    psq_multiplier: meal.psq_multiplier,
    meal_derived_data: meal.meal_derived_data,
    nds_confidence: meal.nds_confidence,
  };
}

// ============================================================================
// Edit path: recompute derived NDS + parent-day projection
// ============================================================================

/**
 * Recompute and write projected_* columns on a plan_day from its current
 * set of planned_meals. Called after any meal mutation so day-level
 * projections stay in sync with per-meal edits.
 */
export async function recomputePlanDayProjection(
  personId: string,
  planDayId: string,
): Promise<void> {
  const meals = await listMealsForDay(personId, planDayId);
  const result = projectDailyNDS(meals);

  const { error } = await supabaseAdmin
    .from('plan_days')
    .update({
      projected_nds_100: result.nds_score_100,
      projected_wfr_10: result.subscores.wfr_10,
      projected_ps_10: result.subscores.ps_10,
      projected_pnd_10: result.subscores.pnd_10,
      projected_fp_10: result.subscores.fp_10,
      projected_as_10: result.subscores.as_10,
      projected_mnc_10: result.subscores.mnc_10,
      projected_ob_10: result.subscores.ob_10,
      projection_confidence:
        meals.length === 0
          ? 'low'
          : meals.some((m) => m.nds_confidence === 'low')
            ? 'low'
            : meals.some((m) => m.nds_confidence === 'medium')
              ? 'medium'
              : 'high',
      updated_at: new Date().toISOString(),
    })
    .eq('id', planDayId)
    .eq('person_id', personId);
  if (error) {
    console.warn(
      '[plans/recomputePlanDayProjection] update error:',
      error.message,
    );
  }
}
