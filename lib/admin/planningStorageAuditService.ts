/**
 * Packet 61 — read-only storage-source and legacy-backfill audit.
 *
 * This service reads the four authoritative migrated planning/grocery tables
 * directly. It must not call compatibility stores because those can backfill
 * legacy metadata as a side effect.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

export type StorageSourceBucket = 'table_direct' | 'legacy_metadata' | 'unknown';
export type StorageAuditSeverity = 'info' | 'warning' | 'high';

export type PlanningStorageAuditTableName =
  | 'reusable_plan_day_templates'
  | 'reusable_plan_week_patterns'
  | 'pantry_on_hand_items'
  | 'grocery_ingredient_resolutions';

export type StorageAuditAnomalyCode =
  | 'unknown_storage_source'
  | 'legacy_source_without_backfilled_at'
  | 'table_direct_with_backfilled_at'
  | 'missing_person_id'
  | 'legacy_backfilled_row_missing_created_at';

export interface StorageSourceCounts {
  table_direct: number;
  legacy_metadata: number;
  unknown: number;
}

export interface TimestampRange {
  oldest: string | null;
  newest: string | null;
}

export interface TableStorageAudit {
  table: PlanningStorageAuditTableName;
  total_rows: number;
  storage_sources: StorageSourceCounts;
  legacy_metadata_backfilled_rows: number;
  legacy_metadata_backfilled_at_range: TimestampRange;
  created_at_range: TimestampRange;
  updated_at_range: TimestampRange;
  distinct_person_count: number;
}

export interface PersonStorageAudit {
  person_id: string;
  total_migrated_rows: number;
  tables: Record<PlanningStorageAuditTableName, number>;
  storage_sources: StorageSourceCounts;
  latest_backfill_at: string | null;
  has_table_direct_rows: boolean;
  has_legacy_metadata_rows: boolean;
  has_unknown_storage_source_rows: boolean;
  warning_flags: StorageAuditAnomalyCode[];
}

export interface StorageAuditAnomaly {
  table: PlanningStorageAuditTableName;
  person_id: string | null;
  row_id: string | null;
  severity: StorageAuditSeverity;
  code: StorageAuditAnomalyCode;
  message: string;
}

export interface PlanningStorageAuditFilters {
  person_id?: string | null;
  storage_source?: StorageSourceBucket | 'all' | null;
  limit?: number | null;
}

export interface PlanningStorageAudit {
  generated_at: string;
  filters: {
    person_id: string | null;
    storage_source: StorageSourceBucket | 'all';
    limit: number;
  };
  tables: Record<PlanningStorageAuditTableName, TableStorageAudit>;
  persons: PersonStorageAudit[];
  anomalies: StorageAuditAnomaly[];
  cleanup_readiness: {
    legacy_backfilled_person_count: number;
    table_direct_person_count: number;
    unknown_storage_source_count: number;
    notes: string[];
  };
}

interface StorageAuditRow {
  id: string | null;
  person_id: string | null;
  storage_source: string | null;
  legacy_metadata_backfilled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  table: PlanningStorageAuditTableName;
}

const AUDITED_TABLES: PlanningStorageAuditTableName[] = [
  'reusable_plan_day_templates',
  'reusable_plan_week_patterns',
  'pantry_on_hand_items',
  'grocery_ingredient_resolutions',
];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function emptyStorageCounts(): StorageSourceCounts {
  return {
    table_direct: 0,
    legacy_metadata: 0,
    unknown: 0,
  };
}

function emptyTableCounts(): Record<PlanningStorageAuditTableName, number> {
  return {
    reusable_plan_day_templates: 0,
    reusable_plan_week_patterns: 0,
    pantry_on_hand_items: 0,
    grocery_ingredient_resolutions: 0,
  };
}

function normalizeStorageSource(value: string | null | undefined): StorageSourceBucket {
  if (value === 'table_direct' || value === 'legacy_metadata') return value;
  return 'unknown';
}

function normalizeLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function emptyRange(): TimestampRange {
  return { oldest: null, newest: null };
}

function timestampRange(values: Array<string | null | undefined>): TimestampRange {
  const present = values.filter((value): value is string => !!value).sort();
  if (present.length === 0) return emptyRange();
  return {
    oldest: present[0],
    newest: present[present.length - 1],
  };
}

function incrementStorageCount(counts: StorageSourceCounts, source: StorageSourceBucket): void {
  counts[source] += 1;
}

async function fetchTableRows(
  table: PlanningStorageAuditTableName,
  personId: string | null,
): Promise<StorageAuditRow[]> {
  let query = supabaseAdmin
    .from(table)
    .select('id, person_id, storage_source, legacy_metadata_backfilled_at, created_at, updated_at');

  if (personId) {
    query = query.eq('person_id', personId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to audit ${table}: ${error.message}`);
  }

  return ((data ?? []) as Array<Omit<StorageAuditRow, 'table'>>).map((row) => ({
    ...row,
    table,
  }));
}

function filterRowsByStorageSource(
  rows: StorageAuditRow[],
  storageSource: StorageSourceBucket | 'all',
): StorageAuditRow[] {
  if (storageSource === 'all') return rows;
  return rows.filter((row) => normalizeStorageSource(row.storage_source) === storageSource);
}

function buildTableAudit(
  table: PlanningStorageAuditTableName,
  rows: StorageAuditRow[],
): TableStorageAudit {
  const storageSources = emptyStorageCounts();
  const personIds = new Set<string>();

  for (const row of rows) {
    incrementStorageCount(storageSources, normalizeStorageSource(row.storage_source));
    if (row.person_id) personIds.add(row.person_id);
  }

  return {
    table,
    total_rows: rows.length,
    storage_sources: storageSources,
    legacy_metadata_backfilled_rows: rows.filter((row) => !!row.legacy_metadata_backfilled_at).length,
    legacy_metadata_backfilled_at_range: timestampRange(
      rows.map((row) => row.legacy_metadata_backfilled_at),
    ),
    created_at_range: timestampRange(rows.map((row) => row.created_at)),
    updated_at_range: timestampRange(rows.map((row) => row.updated_at)),
    distinct_person_count: personIds.size,
  };
}

function anomalyForRow(row: StorageAuditRow): StorageAuditAnomaly[] {
  const anomalies: StorageAuditAnomaly[] = [];
  const source = normalizeStorageSource(row.storage_source);
  const rowRef = row.id ?? null;

  if (!row.person_id) {
    anomalies.push({
      table: row.table,
      person_id: null,
      row_id: rowRef,
      severity: 'high',
      code: 'missing_person_id',
      message: `${row.table} row ${rowRef ?? '(unknown id)'} has no person_id.`,
    });
  }

  if (source === 'unknown') {
    anomalies.push({
      table: row.table,
      person_id: row.person_id,
      row_id: rowRef,
      severity: 'warning',
      code: 'unknown_storage_source',
      message: `${row.table} row ${rowRef ?? '(unknown id)'} has storage_source ${row.storage_source ?? 'null'}.`,
    });
  }

  if (source === 'legacy_metadata' && !row.legacy_metadata_backfilled_at) {
    anomalies.push({
      table: row.table,
      person_id: row.person_id,
      row_id: rowRef,
      severity: 'warning',
      code: 'legacy_source_without_backfilled_at',
      message: `${row.table} row ${rowRef ?? '(unknown id)'} is legacy_metadata without legacy_metadata_backfilled_at.`,
    });
  }

  if (source === 'table_direct' && row.legacy_metadata_backfilled_at) {
    anomalies.push({
      table: row.table,
      person_id: row.person_id,
      row_id: rowRef,
      severity: 'info',
      code: 'table_direct_with_backfilled_at',
      message: `${row.table} row ${rowRef ?? '(unknown id)'} is table_direct but has legacy_metadata_backfilled_at.`,
    });
  }

  if (source === 'legacy_metadata' && !row.created_at) {
    anomalies.push({
      table: row.table,
      person_id: row.person_id,
      row_id: rowRef,
      severity: 'warning',
      code: 'legacy_backfilled_row_missing_created_at',
      message: `${row.table} row ${rowRef ?? '(unknown id)'} is legacy_metadata without created_at.`,
    });
  }

  return anomalies;
}

function buildPersonAudits(
  rows: StorageAuditRow[],
  anomalies: StorageAuditAnomaly[],
): PersonStorageAudit[] {
  const byPerson = new Map<string, PersonStorageAudit>();
  const anomalyCodesByPerson = new Map<string, Set<StorageAuditAnomalyCode>>();

  for (const anomaly of anomalies) {
    if (!anomaly.person_id) continue;
    const current = anomalyCodesByPerson.get(anomaly.person_id) ?? new Set<StorageAuditAnomalyCode>();
    current.add(anomaly.code);
    anomalyCodesByPerson.set(anomaly.person_id, current);
  }

  for (const row of rows) {
    if (!row.person_id) continue;
    const source = normalizeStorageSource(row.storage_source);
    const current =
      byPerson.get(row.person_id) ??
      ({
        person_id: row.person_id,
        total_migrated_rows: 0,
        tables: emptyTableCounts(),
        storage_sources: emptyStorageCounts(),
        latest_backfill_at: null,
        has_table_direct_rows: false,
        has_legacy_metadata_rows: false,
        has_unknown_storage_source_rows: false,
        warning_flags: [],
      } satisfies PersonStorageAudit);

    current.total_migrated_rows += 1;
    current.tables[row.table] += 1;
    incrementStorageCount(current.storage_sources, source);
    current.has_table_direct_rows ||= source === 'table_direct';
    current.has_legacy_metadata_rows ||= source === 'legacy_metadata';
    current.has_unknown_storage_source_rows ||= source === 'unknown';
    if (
      row.legacy_metadata_backfilled_at &&
      (!current.latest_backfill_at || row.legacy_metadata_backfilled_at > current.latest_backfill_at)
    ) {
      current.latest_backfill_at = row.legacy_metadata_backfilled_at;
    }

    byPerson.set(row.person_id, current);
  }

  for (const [personId, person] of Array.from(byPerson.entries())) {
    person.warning_flags = Array.from(anomalyCodesByPerson.get(personId) ?? []).sort();
  }

  return Array.from(byPerson.values()).sort((a, b) => {
    if (b.total_migrated_rows !== a.total_migrated_rows) {
      return b.total_migrated_rows - a.total_migrated_rows;
    }
    return a.person_id.localeCompare(b.person_id);
  });
}

function buildCleanupReadiness(rows: StorageAuditRow[], persons: PersonStorageAudit[]) {
  const unknownStorageSourceCount = rows.filter(
    (row) => normalizeStorageSource(row.storage_source) === 'unknown',
  ).length;
  const legacyBackfilledPersonCount = persons.filter(
    (person) => person.has_legacy_metadata_rows,
  ).length;
  const tableDirectPersonCount = persons.filter((person) => person.has_table_direct_rows).length;
  const notes: string[] = [
    'Audit only: this report does not determine cleanup eligibility or mutate legacy metadata.',
    'Review legacy_metadata rows and anomalies before any future cleanup policy is considered.',
  ];

  if (legacyBackfilledPersonCount > 0) {
    notes.push(`${legacyBackfilledPersonCount} person(s) have legacy-backfilled table rows.`);
  }
  if (unknownStorageSourceCount > 0) {
    notes.push(`${unknownStorageSourceCount} row(s) have unknown/null/other storage_source values.`);
  }

  return {
    legacy_backfilled_person_count: legacyBackfilledPersonCount,
    table_direct_person_count: tableDirectPersonCount,
    unknown_storage_source_count: unknownStorageSourceCount,
    notes,
  };
}

export async function getPlanningStorageAudit(
  filters: PlanningStorageAuditFilters = {},
): Promise<PlanningStorageAudit> {
  const limit = normalizeLimit(filters.limit);
  const storageSource = filters.storage_source ?? 'all';
  const personId = filters.person_id?.trim() || null;

  const rowsByTable = await Promise.all(
    AUDITED_TABLES.map(async (table) => ({
      table,
      rows: await fetchTableRows(table, personId),
    })),
  );

  const allRows = filterRowsByStorageSource(
    rowsByTable.flatMap((entry) => entry.rows),
    storageSource,
  );

  const tableRows = Object.fromEntries(
    AUDITED_TABLES.map((table) => [
      table,
      allRows.filter((row) => row.table === table),
    ]),
  ) as Record<PlanningStorageAuditTableName, StorageAuditRow[]>;

  const allAnomalies = allRows.flatMap(anomalyForRow);
  const persons = buildPersonAudits(allRows, allAnomalies);

  return {
    generated_at: new Date().toISOString(),
    filters: {
      person_id: personId,
      storage_source: storageSource,
      limit,
    },
    tables: {
      reusable_plan_day_templates: buildTableAudit(
        'reusable_plan_day_templates',
        tableRows.reusable_plan_day_templates,
      ),
      reusable_plan_week_patterns: buildTableAudit(
        'reusable_plan_week_patterns',
        tableRows.reusable_plan_week_patterns,
      ),
      pantry_on_hand_items: buildTableAudit(
        'pantry_on_hand_items',
        tableRows.pantry_on_hand_items,
      ),
      grocery_ingredient_resolutions: buildTableAudit(
        'grocery_ingredient_resolutions',
        tableRows.grocery_ingredient_resolutions,
      ),
    },
    persons: persons.slice(0, limit),
    anomalies: allAnomalies.slice(0, limit),
    cleanup_readiness: buildCleanupReadiness(allRows, persons),
  };
}
