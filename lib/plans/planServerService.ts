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
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { getUserGoals } from '@/lib/journal/journalServerService';
import { computeMealDerivedFromPayload } from '@/lib/nds/mealDerived';
import { projectDailyNDS } from './projection';
import { confidenceForMealItems } from './ndsConfidence';
import {
  buildPlanScheduleSnapshot,
  normalizeMealSchedule,
} from './scheduleResolver';
import type {
  Plan,
  PlanDay,
  PlanSlot,
  PlannedMeal,
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

// ============================================================================
// Packet 39 — Plan-to-Journal execution
//
// Connects planned meals to lived consumption. Execution is additive:
// the planned_meal payload is NEVER mutated; it always reflects what was
// planned. The resulting journal_entry captures what was actually consumed.
// ============================================================================

import { createEntry, deleteEntry } from '@/lib/journal/journalServerService';
import type { JournalEntry } from '@/lib/journal/journalServerService';

export type ExecuteAction = 'eat' | 'skip' | 'undo';

export interface ExecuteMealResult {
  meal: PlannedMeal;
  /** Set only when action='eat'. */
  journal_entry: JournalEntry | null;
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
): Promise<ExecuteMealResult> {
  const meal = await getPlannedMeal(personId, mealId);
  if (!meal) throw new Error('Planned meal not found.');

  if (action === 'eat') {
    // Build an intake payload from the planned meal's aggregate totals.
    // Provenance is embedded via source_planned_meal_id so the journal
    // entry stays traceable without a separate join.
    const totals = (meal.payload as Record<string, unknown>).totals as
      | Record<string, unknown>
      | undefined;
    const calories =
      typeof totals?.calories === 'number' ? totals.calories : undefined;
    const protein_g =
      typeof totals?.protein_g === 'number' ? totals.protein_g : undefined;
    const carbs_g =
      typeof totals?.carbs_g === 'number' ? totals.carbs_g : undefined;
    const fat_g =
      typeof totals?.fat_g === 'number' ? totals.fat_g : undefined;

    const intakePayload: Record<string, unknown> = {
      name: meal.name ?? 'Planned meal',
      quantity: 1,
      unit: 'serving',
      source_planned_meal_id: mealId,
    };
    if (calories !== undefined) intakePayload.calories = calories;
    if (protein_g !== undefined || carbs_g !== undefined || fat_g !== undefined) {
      intakePayload.macros = {
        protein: protein_g,
        carbs: carbs_g,
        fat: fat_g,
      };
    }

    const occurredAtDate = occurred_at
      ? new Date(occurred_at)
      : new Date();

    const entry = await createEntry({
      personId,
      entryType: 'intake',
      occurredAt: occurredAtDate,
      payload: intakePayload as import('@/lib/journal/journalServerService').JournalEntryPayload,
    });

    // Persist execution state on the planned meal.
    const { data, error } = await supabaseAdmin
      .from('planned_meals')
      .update({
        execution_state: 'eaten',
        journal_entry_id: entry.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mealId)
      .eq('person_id', personId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to mark meal eaten: ${error.message}`);

    return {
      meal: mealRowToDomain(data as PlannedMealRow),
      journal_entry: entry,
    };
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
    // If there was a journal entry, remove it (preserves journal integrity).
    if (meal.journal_entry_id) {
      await deleteEntry(personId, meal.journal_entry_id).catch(() => {
        // If entry was already deleted (e.g. from the journal UI), continue.
      });
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

interface PayloadForDerived {
  items?: Array<{ food_object_id?: string | null; calories?: number | null }>;
  totals?: { calories?: number; protein_g?: number };
}

/**
 * Given a (potentially edited) planned_meal payload, recompute the
 * meal-level NDS shape used by SlotCard badges and day projection.
 *
 * Stays within the existing lib/nds contract — we call
 * computeMealDerivedFromPayload() (the same function the Stub AI gateway
 * uses) with totals as the single "serving" so it produces consistent
 * values with AI-generated meals.
 */
export function recomputeMealNDSShape(
  name: string | null,
  payload: PayloadForDerived,
): {
  protein_score_10: number | null;
  is_main_meal: boolean;
  psq_multiplier: number;
  meal_derived_data: {
    protein_score_10: number | null;
    is_main_meal: boolean;
    meal_calories: number;
    meal_protein_g: number;
    psq_multiplier: number;
  };
  nds_confidence: 'high' | 'medium' | 'low';
} {
  const totals = payload.totals ?? {};
  const derived = computeMealDerivedFromPayload({
    calories: totals.calories,
    macros: { protein: totals.protein_g },
    quantity: 1,
    name: name ?? undefined,
  });
  const confidence = confidenceForMealItems(payload.items ?? []);
  return {
    protein_score_10: derived.protein_score_10,
    is_main_meal: derived.is_main_meal,
    psq_multiplier: derived.psq_multiplier,
    meal_derived_data: derived,
    nds_confidence: confidence,
  };
}

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
