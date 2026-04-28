/**
 * Packet 62 — legacy metadata cleanup-readiness dry-run.
 *
 * This service is read-only. It compares retained people.metadata records for
 * the four migrated planning/grocery keys against authoritative table rows.
 * It does not call compatibility stores because those may trigger backfill.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

export type LegacyPlanningMetadataKey =
  | 'plan_day_templates'
  | 'plan_week_patterns'
  | 'pantry_on_hand_items'
  | 'grocery_ingredient_resolutions';

export type LegacyCleanupClassification =
  | 'cleanup_candidate'
  | 'review_required'
  | 'malformed_legacy'
  | 'unmatched_legacy'
  | 'table_conflict';

type MigratedTableName =
  | 'reusable_plan_day_templates'
  | 'reusable_plan_week_patterns'
  | 'pantry_on_hand_items'
  | 'grocery_ingredient_resolutions';

export interface LegacyCleanupSummary {
  person_count_with_legacy_metadata: number;
  legacy_record_count: number;
  cleanup_candidate_count: number;
  review_required_count: number;
  malformed_legacy_count: number;
  unmatched_legacy_count: number;
  table_conflict_count: number;
  notes: string[];
}

export interface LegacyCleanupRecordReadiness {
  person_id: string;
  metadata_key: LegacyPlanningMetadataKey;
  legacy_identifier: string | null;
  matching_table: MigratedTableName | null;
  matching_table_row_id: string | null;
  classification: LegacyCleanupClassification;
  evidence: string[];
  warnings: string[];
}

export interface LegacyCleanupPersonReadiness {
  person_id: string;
  legacy_record_count: number;
  metadata_keys_present: LegacyPlanningMetadataKey[];
  counts_by_metadata_key: Record<LegacyPlanningMetadataKey, number>;
  counts_by_classification: Record<LegacyCleanupClassification, number>;
  needs_review: boolean;
  review_reasons: string[];
}

export interface PlanningLegacyCleanupDryRunFilters {
  person_id?: string | null;
  metadata_key?: LegacyPlanningMetadataKey | 'all' | null;
  classification?: LegacyCleanupClassification | 'all' | null;
  limit?: number | null;
}

export interface PlanningLegacyCleanupDryRun {
  generated_at: string;
  mode: 'dry_run';
  inspected_metadata_keys: LegacyPlanningMetadataKey[];
  filters: {
    person_id: string | null;
    metadata_key: LegacyPlanningMetadataKey | 'all';
    classification: LegacyCleanupClassification | 'all';
    limit: number;
  };
  summary: LegacyCleanupSummary;
  persons: LegacyCleanupPersonReadiness[];
  records: LegacyCleanupRecordReadiness[];
  review_reasons: Record<string, number>;
  non_goals: string[];
}

interface PeopleMetadataRow {
  id: string;
  plan_day_templates?: unknown;
  plan_week_patterns?: unknown;
  pantry_on_hand_items?: unknown;
  grocery_ingredient_resolutions?: unknown;
}

interface BaseMigratedRow {
  id: string;
  person_id: string;
  storage_source: string | null;
}

interface DayTemplateRow extends BaseMigratedRow {
  name: string | null;
  source_plan_id: string | null;
  source_plan_day_id: string | null;
  source_date_local: string | null;
}

interface WeekPatternRow extends BaseMigratedRow {
  name: string | null;
  source_plan_id: string | null;
  source_date_start: string | null;
  source_date_end: string | null;
}

interface PantryRow extends BaseMigratedRow {
  key: string;
  food_object_id: string | null;
  name: string | null;
  quantity: number | string | null;
  unit: string | null;
}

interface ResolutionRow extends BaseMigratedRow {
  key: string;
  raw_name: string | null;
  unit: string | null;
  food_object_id: string | null;
  canonical_name: string | null;
}

interface AuthoritativeRows {
  reusable_plan_day_templates: DayTemplateRow[];
  reusable_plan_week_patterns: WeekPatternRow[];
  pantry_on_hand_items: PantryRow[];
  grocery_ingredient_resolutions: ResolutionRow[];
}

const METADATA_KEYS: LegacyPlanningMetadataKey[] = [
  'plan_day_templates',
  'plan_week_patterns',
  'pantry_on_hand_items',
  'grocery_ingredient_resolutions',
];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function emptyClassificationCounts(): Record<LegacyCleanupClassification, number> {
  return {
    cleanup_candidate: 0,
    review_required: 0,
    malformed_legacy: 0,
    unmatched_legacy: 0,
    table_conflict: 0,
  };
}

function emptyMetadataKeyCounts(): Record<LegacyPlanningMetadataKey, number> {
  return {
    plan_day_templates: 0,
    plan_week_patterns: 0,
    pantry_on_hand_items: 0,
    grocery_ingredient_resolutions: 0,
  };
}

function compactValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '[complex]';
}

function normalizeQuantity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function legacyArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function metadataValue(row: PeopleMetadataRow, key: LegacyPlanningMetadataKey): unknown {
  return row[key];
}

async function fetchPeopleMetadataRows(personId: string | null): Promise<PeopleMetadataRow[]> {
  let query = supabaseAdmin
    .from('people')
    .select(
      'id, plan_day_templates:metadata->plan_day_templates, plan_week_patterns:metadata->plan_week_patterns, pantry_on_hand_items:metadata->pantry_on_hand_items, grocery_ingredient_resolutions:metadata->grocery_ingredient_resolutions',
    );
  if (personId) query = query.eq('id', personId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to read legacy planning metadata keys: ${error.message}`);
  }
  return (data ?? []) as PeopleMetadataRow[];
}

async function fetchAuthoritativeRows(personId: string | null): Promise<AuthoritativeRows> {
  let dayQuery = supabaseAdmin
    .from('reusable_plan_day_templates')
    .select('id, person_id, name, source_plan_id, source_plan_day_id, source_date_local, storage_source');
  let weekQuery = supabaseAdmin
    .from('reusable_plan_week_patterns')
    .select('id, person_id, name, source_plan_id, source_date_start, source_date_end, storage_source');
  let pantryQuery = supabaseAdmin
    .from('pantry_on_hand_items')
    .select('id, person_id, key, food_object_id, name, quantity, unit, storage_source');
  let resolutionQuery = supabaseAdmin
    .from('grocery_ingredient_resolutions')
    .select('id, person_id, key, raw_name, unit, food_object_id, canonical_name, storage_source');

  if (personId) {
    dayQuery = dayQuery.eq('person_id', personId);
    weekQuery = weekQuery.eq('person_id', personId);
    pantryQuery = pantryQuery.eq('person_id', personId);
    resolutionQuery = resolutionQuery.eq('person_id', personId);
  }

  const [days, weeks, pantry, resolutions] = await Promise.all([
    dayQuery,
    weekQuery,
    pantryQuery,
    resolutionQuery,
  ]);

  if (days.error) throw new Error(`Failed to read reusable_plan_day_templates: ${days.error.message}`);
  if (weeks.error) throw new Error(`Failed to read reusable_plan_week_patterns: ${weeks.error.message}`);
  if (pantry.error) throw new Error(`Failed to read pantry_on_hand_items: ${pantry.error.message}`);
  if (resolutions.error) {
    throw new Error(`Failed to read grocery_ingredient_resolutions: ${resolutions.error.message}`);
  }

  return {
    reusable_plan_day_templates: (days.data ?? []) as DayTemplateRow[],
    reusable_plan_week_patterns: (weeks.data ?? []) as WeekPatternRow[],
    pantry_on_hand_items: (pantry.data ?? []) as PantryRow[],
    grocery_ingredient_resolutions: (resolutions.data ?? []) as ResolutionRow[],
  };
}

function matchingTableForKey(key: LegacyPlanningMetadataKey): MigratedTableName {
  if (key === 'plan_day_templates') return 'reusable_plan_day_templates';
  if (key === 'plan_week_patterns') return 'reusable_plan_week_patterns';
  if (key === 'pantry_on_hand_items') return 'pantry_on_hand_items';
  return 'grocery_ingredient_resolutions';
}

function hasUnknownStorageSource(row: BaseMigratedRow): boolean {
  return row.storage_source !== 'table_direct' && row.storage_source !== 'legacy_metadata';
}

function compareField(
  label: string,
  legacy: unknown,
  table: unknown,
  warnings: string[],
): void {
  if (legacy === undefined || table === undefined) return;
  if (legacy === null && table === null) return;
  if (String(legacy) !== String(table)) {
    warnings.push(`${label} differs: legacy=${compactValue(legacy)} table=${compactValue(table)}`);
  }
}

function classifyWithMatch(
  metadataKey: LegacyPlanningMetadataKey,
  personId: string,
  legacyIdentifier: string,
  tableName: MigratedTableName,
  tableRow: BaseMigratedRow | null,
  evidence: string[],
  warnings: string[],
): LegacyCleanupRecordReadiness {
  if (!tableRow) {
    return {
      person_id: personId,
      metadata_key: metadataKey,
      legacy_identifier: legacyIdentifier,
      matching_table: tableName,
      matching_table_row_id: null,
      classification: 'unmatched_legacy',
      evidence: [...evidence, `No matching ${tableName} row found.`],
      warnings: ['Legacy record is parseable but has no authoritative table match.'],
    };
  }

  const nextEvidence = [
    ...evidence,
    `Matched ${tableName} row ${tableRow.id}.`,
    `Matched row storage_source=${tableRow.storage_source ?? 'null'}.`,
  ];
  const nextWarnings = [...warnings];
  if (hasUnknownStorageSource(tableRow)) {
    nextWarnings.push('Matching table row has unknown/null/other storage_source.');
  }

  return {
    person_id: personId,
    metadata_key: metadataKey,
    legacy_identifier: legacyIdentifier,
    matching_table: tableName,
    matching_table_row_id: tableRow.id,
    classification: nextWarnings.length > 0
      ? hasUnknownStorageSource(tableRow) && nextWarnings.length === 1
        ? 'review_required'
        : 'table_conflict'
      : 'cleanup_candidate',
    evidence: nextEvidence,
    warnings: nextWarnings,
  };
}

function malformedRecord(
  personId: string,
  metadataKey: LegacyPlanningMetadataKey,
  index: number,
  reason: string,
): LegacyCleanupRecordReadiness {
  return {
    person_id: personId,
    metadata_key: metadataKey,
    legacy_identifier: null,
    matching_table: matchingTableForKey(metadataKey),
    matching_table_row_id: null,
    classification: 'malformed_legacy',
    evidence: [`Legacy ${metadataKey}[${index}] could not be parsed: ${reason}.`],
    warnings: ['Malformed legacy metadata requires human review before any cleanup policy.'],
  };
}

function classifyDayTemplate(
  personId: string,
  index: number,
  value: unknown,
  rows: DayTemplateRow[],
): LegacyCleanupRecordReadiness {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    return malformedRecord(personId, 'plan_day_templates', index, 'missing string id');
  }
  const match = rows.find((row) => row.person_id === personId && row.id === value.id) ?? null;
  const warnings: string[] = [];
  if (match) {
    compareField('name', value.name, match.name, warnings);
    compareField('source_plan_id', value.source_plan_id, match.source_plan_id, warnings);
    compareField('source_plan_day_id', value.source_plan_day_id, match.source_plan_day_id, warnings);
    compareField('source_date_local', value.source_date_local, match.source_date_local, warnings);
  }
  return classifyWithMatch(
    'plan_day_templates',
    personId,
    value.id,
    'reusable_plan_day_templates',
    match,
    [`Legacy plan_day_templates[${index}] has id ${value.id}.`],
    warnings,
  );
}

function classifyWeekPattern(
  personId: string,
  index: number,
  value: unknown,
  rows: WeekPatternRow[],
): LegacyCleanupRecordReadiness {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    return malformedRecord(personId, 'plan_week_patterns', index, 'missing string id');
  }
  const match = rows.find((row) => row.person_id === personId && row.id === value.id) ?? null;
  const warnings: string[] = [];
  if (match) {
    compareField('name', value.name, match.name, warnings);
    compareField('source_plan_id', value.source_plan_id, match.source_plan_id, warnings);
    compareField('source_date_start', value.source_date_start, match.source_date_start, warnings);
    compareField('source_date_end', value.source_date_end, match.source_date_end, warnings);
  }
  return classifyWithMatch(
    'plan_week_patterns',
    personId,
    value.id,
    'reusable_plan_week_patterns',
    match,
    [`Legacy plan_week_patterns[${index}] has id ${value.id}.`],
    warnings,
  );
}

function classifyPantryItem(
  personId: string,
  index: number,
  value: unknown,
  rows: PantryRow[],
): LegacyCleanupRecordReadiness {
  if (!isRecord(value) || typeof value.key !== 'string' || value.key.length === 0) {
    return malformedRecord(personId, 'pantry_on_hand_items', index, 'missing string key');
  }
  const match = rows.find((row) => row.person_id === personId && row.key === value.key) ?? null;
  const warnings: string[] = [];
  if (match) {
    compareField('food_object_id', value.food_object_id, match.food_object_id, warnings);
    compareField('name', value.name, match.name, warnings);
    compareField('unit', value.unit, match.unit, warnings);
    const legacyQuantity = normalizeQuantity(value.quantity);
    const tableQuantity = normalizeQuantity(match.quantity);
    if (legacyQuantity !== tableQuantity) {
      warnings.push(
        `quantity differs: legacy=${compactValue(value.quantity)} table=${compactValue(match.quantity)}`,
      );
    }
  }
  return classifyWithMatch(
    'pantry_on_hand_items',
    personId,
    value.key,
    'pantry_on_hand_items',
    match,
    [`Legacy pantry_on_hand_items[${index}] has key ${value.key}.`],
    warnings,
  );
}

function classifyResolution(
  personId: string,
  index: number,
  value: unknown,
  rows: ResolutionRow[],
): LegacyCleanupRecordReadiness {
  if (!isRecord(value) || typeof value.key !== 'string' || value.key.length === 0) {
    return malformedRecord(personId, 'grocery_ingredient_resolutions', index, 'missing string key');
  }
  const match = rows.find((row) => row.person_id === personId && row.key === value.key) ?? null;
  const warnings: string[] = [];
  if (match) {
    compareField('raw_name', value.raw_name, match.raw_name, warnings);
    compareField('unit', value.unit, match.unit, warnings);
    compareField('food_object_id', value.food_object_id, match.food_object_id, warnings);
    compareField('canonical_name', value.canonical_name, match.canonical_name, warnings);
  }
  return classifyWithMatch(
    'grocery_ingredient_resolutions',
    personId,
    value.key,
    'grocery_ingredient_resolutions',
    match,
    [`Legacy grocery_ingredient_resolutions[${index}] has key ${value.key}.`],
    warnings,
  );
}

function classifyMetadataRecord(
  personId: string,
  metadataKey: LegacyPlanningMetadataKey,
  index: number,
  value: unknown,
  rows: AuthoritativeRows,
): LegacyCleanupRecordReadiness {
  if (metadataKey === 'plan_day_templates') {
    return classifyDayTemplate(personId, index, value, rows.reusable_plan_day_templates);
  }
  if (metadataKey === 'plan_week_patterns') {
    return classifyWeekPattern(personId, index, value, rows.reusable_plan_week_patterns);
  }
  if (metadataKey === 'pantry_on_hand_items') {
    return classifyPantryItem(personId, index, value, rows.pantry_on_hand_items);
  }
  return classifyResolution(personId, index, value, rows.grocery_ingredient_resolutions);
}

function inspectPeopleRows(
  peopleRows: PeopleMetadataRow[],
  rows: AuthoritativeRows,
  metadataKeyFilter: LegacyPlanningMetadataKey | 'all',
): LegacyCleanupRecordReadiness[] {
  const keys = metadataKeyFilter === 'all' ? METADATA_KEYS : [metadataKeyFilter];
  const records: LegacyCleanupRecordReadiness[] = [];

  for (const person of peopleRows) {
    for (const key of keys) {
      const value = metadataValue(person, key);
      if (value == null) continue;
      const legacyRecords = legacyArray(value);
      if (!legacyRecords) {
        records.push(malformedRecord(person.id, key, 0, 'metadata key is not an array'));
        continue;
      }
      legacyRecords.forEach((entry, index) => {
        records.push(classifyMetadataRecord(person.id, key, index, entry, rows));
      });
    }
  }

  return records;
}

function incrementReviewReason(
  reviewReasons: Record<string, number>,
  reason: string,
): void {
  reviewReasons[reason] = (reviewReasons[reason] ?? 0) + 1;
}

function buildReviewReasons(records: LegacyCleanupRecordReadiness[]): Record<string, number> {
  const reasons: Record<string, number> = {};
  for (const record of records) {
    if (record.classification === 'cleanup_candidate') continue;
    incrementReviewReason(reasons, record.classification);
    for (const warning of record.warnings) {
      incrementReviewReason(reasons, warning);
    }
  }
  return Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1]));
}

function buildPersons(records: LegacyCleanupRecordReadiness[]): LegacyCleanupPersonReadiness[] {
  const byPerson = new Map<string, LegacyCleanupPersonReadiness>();
  for (const record of records) {
    const current =
      byPerson.get(record.person_id) ??
      ({
        person_id: record.person_id,
        legacy_record_count: 0,
        metadata_keys_present: [],
        counts_by_metadata_key: emptyMetadataKeyCounts(),
        counts_by_classification: emptyClassificationCounts(),
        needs_review: false,
        review_reasons: [],
      } satisfies LegacyCleanupPersonReadiness);

    current.legacy_record_count += 1;
    current.counts_by_metadata_key[record.metadata_key] += 1;
    current.counts_by_classification[record.classification] += 1;
    if (!current.metadata_keys_present.includes(record.metadata_key)) {
      current.metadata_keys_present.push(record.metadata_key);
    }
    if (record.classification !== 'cleanup_candidate') {
      current.needs_review = true;
      current.review_reasons.push(record.classification);
      current.review_reasons.push(...record.warnings);
    }
    byPerson.set(record.person_id, current);
  }

  return Array.from(byPerson.values())
    .map((person) => ({
      ...person,
      metadata_keys_present: person.metadata_keys_present.sort(),
      review_reasons: Array.from(new Set(person.review_reasons)).sort(),
    }))
    .sort((a, b) => {
      if (Number(b.needs_review) !== Number(a.needs_review)) {
        return Number(b.needs_review) - Number(a.needs_review);
      }
      if (b.legacy_record_count !== a.legacy_record_count) {
        return b.legacy_record_count - a.legacy_record_count;
      }
      return a.person_id.localeCompare(b.person_id);
    });
}

function buildSummary(records: LegacyCleanupRecordReadiness[]): LegacyCleanupSummary {
  const classifications = emptyClassificationCounts();
  const personIds = new Set(records.map((record) => record.person_id));
  for (const record of records) {
    classifications[record.classification] += 1;
  }

  return {
    person_count_with_legacy_metadata: personIds.size,
    legacy_record_count: records.length,
    cleanup_candidate_count: classifications.cleanup_candidate,
    review_required_count: classifications.review_required,
    malformed_legacy_count: classifications.malformed_legacy,
    unmatched_legacy_count: classifications.unmatched_legacy,
    table_conflict_count: classifications.table_conflict,
    notes: [
      'Dry-run only: cleanup candidates are not cleanup approvals.',
      'Only the four migrated planning/grocery metadata keys are inspected.',
      'Any future deletion of legacy metadata requires a separate explicit policy packet and human approval.',
    ],
  };
}

export async function getPlanningLegacyCleanupDryRun(
  filters: PlanningLegacyCleanupDryRunFilters = {},
): Promise<PlanningLegacyCleanupDryRun> {
  const personId = filters.person_id?.trim() || null;
  const metadataKey = filters.metadata_key ?? 'all';
  const classification = filters.classification ?? 'all';
  const limit = normalizeLimit(filters.limit);
  const [peopleRows, tableRows] = await Promise.all([
    fetchPeopleMetadataRows(personId),
    fetchAuthoritativeRows(personId),
  ]);

  const allRecords = inspectPeopleRows(peopleRows, tableRows, metadataKey);
  const filteredRecords =
    classification === 'all'
      ? allRecords
      : allRecords.filter((record) => record.classification === classification);
  const limitedRecords = filteredRecords.slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    mode: 'dry_run',
    inspected_metadata_keys: metadataKey === 'all' ? METADATA_KEYS : [metadataKey],
    filters: {
      person_id: personId,
      metadata_key: metadataKey,
      classification,
      limit,
    },
    summary: buildSummary(filteredRecords),
    persons: buildPersons(filteredRecords).slice(0, limit),
    records: limitedRecords,
    review_reasons: buildReviewReasons(filteredRecords),
    non_goals: [
      'No legacy metadata deletion.',
      'No people.metadata mutation.',
      'No migrated table mutation.',
      'No compatibility backfill trigger.',
      'No cleanup policy decision.',
    ],
  };
}
