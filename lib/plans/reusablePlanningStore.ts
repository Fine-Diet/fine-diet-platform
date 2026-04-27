/**
 * Packet 56 — table-backed reusable planning storage.
 *
 * Authoritative storage: dedicated reusable_plan_* tables.
 *
 * Legacy people.metadata arrays are a non-destructive compatibility source
 * only. Reads are deterministic: table rows win by id, missing valid metadata
 * rows are copied into tables with storage_source='legacy_metadata', then the
 * caller receives table rows only. New writes never update legacy metadata.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  normalizeMetadataCollection,
  readPersonMetadata,
} from './personMetadataStore';
import type {
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlanSlot,
  PlanWeekPattern,
  PlanWeekPatternDay,
  PlannedMeal,
} from './types';

const PLAN_DAY_TEMPLATES_METADATA_KEY = 'plan_day_templates';
const PLAN_WEEK_PATTERNS_METADATA_KEY = 'plan_week_patterns';
const TABLE_DIRECT_STORAGE_SOURCE = 'table_direct';
const LEGACY_METADATA_STORAGE_SOURCE = 'legacy_metadata';

type MigratedStorageSource =
  | typeof TABLE_DIRECT_STORAGE_SOURCE
  | typeof LEGACY_METADATA_STORAGE_SOURCE;

interface ReusablePlanDayTemplateRow {
  id: string;
  person_id: string;
  name: string;
  source_plan_id: string;
  source_plan_day_id: string;
  source_date_local: string;
  slots_json: unknown;
  unassigned_meals_json: unknown;
  apply_policy: 'append';
  storage_source?: MigratedStorageSource;
  legacy_metadata_backfilled_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ReusablePlanWeekPatternRow {
  id: string;
  person_id: string;
  name: string;
  source_plan_id: string;
  source_date_start: string;
  source_date_end: string;
  days_json: unknown;
  apply_policy: 'append';
  storage_source?: MigratedStorageSource;
  legacy_metadata_backfilled_at?: string | null;
  created_at: string;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNdsConfidence(value: unknown): value is PlannedMeal['nds_confidence'] {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isPlannedMealType(value: unknown): value is PlannedMeal['meal_type'] {
  return (
    value === 'breakfast' ||
    value === 'lunch' ||
    value === 'dinner' ||
    value === 'snack' ||
    value === 'other'
  );
}

function isPlanSlotBlock(value: unknown): value is PlanSlot['slot_block'] {
  return value === null || value === 'morning' || value === 'midday' || value === 'evening';
}

function isTemplateMeal(value: unknown): value is PlanDayTemplateMeal {
  if (!isRecord(value)) return false;
  return (
    typeof value.source_planned_meal_id === 'string' &&
    isNullableString(value.name) &&
    isPlannedMealType(value.meal_type) &&
    isRecord(value.payload) &&
    isNullableNumber(value.protein_score_10) &&
    typeof value.is_main_meal === 'boolean' &&
    typeof value.psq_multiplier === 'number' &&
    Number.isFinite(value.psq_multiplier) &&
    isRecord(value.meal_derived_data) &&
    isNdsConfidence(value.nds_confidence) &&
    isNullableString(value.source_template_id) &&
    isNullableString(value.source_imported_meal_id) &&
    typeof value.nds_version === 'string' &&
    typeof value.classifier_version === 'string'
  );
}

function isTemplateSlot(value: unknown): value is PlanDayTemplateSlot {
  if (!isRecord(value)) return false;
  return (
    typeof value.source_plan_slot_id === 'string' &&
    typeof value.slot_ordinal === 'number' &&
    Number.isInteger(value.slot_ordinal) &&
    isPlanSlotBlock(value.slot_block) &&
    isNullableString(value.slot_label) &&
    isNullableString(value.target_time) &&
    Array.isArray(value.meals) &&
    value.meals.every(isTemplateMeal)
  );
}

function isTemplateMealArray(value: unknown): value is PlanDayTemplateMeal[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isTemplateMeal));
}

function isPlanWeekPatternDay(value: unknown): value is PlanWeekPatternDay {
  if (!isRecord(value)) return false;
  return (
    typeof value.day_offset === 'number' &&
    Number.isInteger(value.day_offset) &&
    typeof value.source_plan_day_id === 'string' &&
    typeof value.source_date_local === 'string' &&
    Array.isArray(value.slots) &&
    value.slots.every(isTemplateSlot) &&
    isTemplateMealArray(value.unassigned_meals)
  );
}

function isPlanDayTemplate(value: unknown): value is PlanDayTemplate {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<PlanDayTemplate>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.person_id === 'string' &&
    typeof candidate.name === 'string' &&
    candidate.scope === 'day' &&
    typeof candidate.source_plan_id === 'string' &&
    typeof candidate.source_plan_day_id === 'string' &&
    typeof candidate.source_date_local === 'string' &&
    Array.isArray(candidate.slots) &&
    candidate.slots.every(isTemplateSlot) &&
    isTemplateMealArray(candidate.unassigned_meals) &&
    (candidate.apply_policy === undefined || candidate.apply_policy === 'append') &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function normalizePlanDayTemplates(value: unknown): PlanDayTemplate[] {
  return normalizeMetadataCollection(
    PLAN_DAY_TEMPLATES_METADATA_KEY,
    value,
    isPlanDayTemplate,
  );
}

function isPlanWeekPattern(value: unknown): value is PlanWeekPattern {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<PlanWeekPattern>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.person_id === 'string' &&
    typeof candidate.name === 'string' &&
    candidate.scope === 'week_pattern' &&
    typeof candidate.source_plan_id === 'string' &&
    typeof candidate.source_date_start === 'string' &&
    typeof candidate.source_date_end === 'string' &&
    Array.isArray(candidate.days) &&
    candidate.days.every(isPlanWeekPatternDay) &&
    (candidate.apply_policy === undefined || candidate.apply_policy === 'append') &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function normalizePlanWeekPatterns(value: unknown): PlanWeekPattern[] {
  return normalizeMetadataCollection(
    PLAN_WEEK_PATTERNS_METADATA_KEY,
    value,
    isPlanWeekPattern,
  );
}

function templateToRow(template: PlanDayTemplate): ReusablePlanDayTemplateRow {
  if (!isPlanDayTemplate(template)) {
    throw new Error('Plan day template contains malformed records.');
  }
  return {
    id: template.id,
    person_id: template.person_id,
    name: template.name,
    source_plan_id: template.source_plan_id,
    source_plan_day_id: template.source_plan_day_id,
    source_date_local: template.source_date_local,
    slots_json: template.slots,
    unassigned_meals_json: template.unassigned_meals ?? [],
    apply_policy: template.apply_policy ?? 'append',
    storage_source: TABLE_DIRECT_STORAGE_SOURCE,
    legacy_metadata_backfilled_at: null,
    created_at: template.created_at,
    updated_at: template.updated_at,
  };
}

function rowToTemplate(row: ReusablePlanDayTemplateRow): PlanDayTemplate {
  const template: PlanDayTemplate = {
    id: row.id,
    person_id: row.person_id,
    name: row.name,
    scope: 'day',
    source_plan_id: row.source_plan_id,
    source_plan_day_id: row.source_plan_day_id,
    source_date_local: row.source_date_local,
    slots: Array.isArray(row.slots_json) ? row.slots_json : [],
    unassigned_meals: Array.isArray(row.unassigned_meals_json)
      ? row.unassigned_meals_json
      : [],
    apply_policy: row.apply_policy,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (!isPlanDayTemplate(template)) {
    throw new Error('Stored plan day template has an invalid shape.');
  }
  return template;
}

function patternToRow(pattern: PlanWeekPattern): ReusablePlanWeekPatternRow {
  if (!isPlanWeekPattern(pattern)) {
    throw new Error('Plan week pattern contains malformed records.');
  }
  return {
    id: pattern.id,
    person_id: pattern.person_id,
    name: pattern.name,
    source_plan_id: pattern.source_plan_id,
    source_date_start: pattern.source_date_start,
    source_date_end: pattern.source_date_end,
    days_json: pattern.days,
    apply_policy: pattern.apply_policy ?? 'append',
    storage_source: TABLE_DIRECT_STORAGE_SOURCE,
    legacy_metadata_backfilled_at: null,
    created_at: pattern.created_at,
    updated_at: pattern.updated_at,
  };
}

function rowToPattern(row: ReusablePlanWeekPatternRow): PlanWeekPattern {
  const pattern: PlanWeekPattern = {
    id: row.id,
    person_id: row.person_id,
    name: row.name,
    scope: 'week_pattern',
    source_plan_id: row.source_plan_id,
    source_date_start: row.source_date_start,
    source_date_end: row.source_date_end,
    days: Array.isArray(row.days_json) ? row.days_json : [],
    apply_policy: row.apply_policy,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (!isPlanWeekPattern(pattern)) {
    throw new Error('Stored plan week pattern has an invalid shape.');
  }
  return pattern;
}

async function readPlanDayTemplateRows(personId: string): Promise<ReusablePlanDayTemplateRow[]> {
  const { data, error } = await supabaseAdmin
    .from('reusable_plan_day_templates')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list plan day templates: ${error.message}`);
  return (data ?? []) as ReusablePlanDayTemplateRow[];
}

async function readPlanWeekPatternRows(personId: string): Promise<ReusablePlanWeekPatternRow[]> {
  const { data, error } = await supabaseAdmin
    .from('reusable_plan_week_patterns')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list plan week patterns: ${error.message}`);
  return (data ?? []) as ReusablePlanWeekPatternRow[];
}

async function backfillPlanDayTemplatesFromMetadata(
  personId: string,
  existingRows: ReusablePlanDayTemplateRow[],
): Promise<boolean> {
  const meta = await readPersonMetadata(personId);
  const legacyTemplates = normalizePlanDayTemplates(meta[PLAN_DAY_TEMPLATES_METADATA_KEY]);
  const existingIds = new Set(existingRows.map((row) => row.id));
  const missingRows = legacyTemplates
    .filter((template) => !existingIds.has(template.id))
    .map((template) => ({
      ...templateToRow(template),
      storage_source: LEGACY_METADATA_STORAGE_SOURCE,
      legacy_metadata_backfilled_at: new Date().toISOString(),
    }));
  if (missingRows.length === 0) return false;

  const { error } = await supabaseAdmin
    .from('reusable_plan_day_templates')
    .upsert(missingRows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to backfill plan day templates: ${error.message}`);
  return true;
}

async function backfillPlanWeekPatternsFromMetadata(
  personId: string,
  existingRows: ReusablePlanWeekPatternRow[],
): Promise<boolean> {
  const meta = await readPersonMetadata(personId);
  const legacyPatterns = normalizePlanWeekPatterns(meta[PLAN_WEEK_PATTERNS_METADATA_KEY]);
  const existingIds = new Set(existingRows.map((row) => row.id));
  const missingRows = legacyPatterns
    .filter((pattern) => !existingIds.has(pattern.id))
    .map((pattern) => ({
      ...patternToRow(pattern),
      storage_source: LEGACY_METADATA_STORAGE_SOURCE,
      legacy_metadata_backfilled_at: new Date().toISOString(),
    }));
  if (missingRows.length === 0) return false;

  const { error } = await supabaseAdmin
    .from('reusable_plan_week_patterns')
    .upsert(missingRows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Failed to backfill plan week patterns: ${error.message}`);
  return true;
}

export async function listReusablePlanDayTemplates(
  personId: string,
): Promise<PlanDayTemplate[]> {
  const initialRows = await readPlanDayTemplateRows(personId);
  const backfilled = await backfillPlanDayTemplatesFromMetadata(personId, initialRows);
  const rows = backfilled ? await readPlanDayTemplateRows(personId) : initialRows;
  return rows.map(rowToTemplate);
}

export async function saveReusablePlanDayTemplate(
  template: PlanDayTemplate,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reusable_plan_day_templates')
    .insert(templateToRow(template));
  if (error) throw new Error(`Failed to save plan day template: ${error.message}`);
}

export async function listReusablePlanWeekPatterns(
  personId: string,
): Promise<PlanWeekPattern[]> {
  const initialRows = await readPlanWeekPatternRows(personId);
  const backfilled = await backfillPlanWeekPatternsFromMetadata(personId, initialRows);
  const rows = backfilled ? await readPlanWeekPatternRows(personId) : initialRows;
  return rows.map(rowToPattern);
}

export async function saveReusablePlanWeekPattern(
  pattern: PlanWeekPattern,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reusable_plan_week_patterns')
    .insert(patternToRow(pattern));
  if (error) throw new Error(`Failed to save plan week pattern: ${error.message}`);
}
