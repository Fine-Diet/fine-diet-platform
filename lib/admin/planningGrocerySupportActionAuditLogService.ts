/**
 * Packet 66 — read-only support action audit-log inspection service.
 *
 * This service performs direct SELECTs only. It does not insert audit logs and
 * does not execute support actions.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { PlanningGrocerySupportActionRisk } from './planningGrocerySupportActionPolicy';
import {
  PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_RESULTS,
  PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_TABLE,
  type PlanningGrocerySupportActionAuditLog,
  type PlanningGrocerySupportActionAuditLogFilters,
  type PlanningGrocerySupportActionAuditLogReport,
  type PlanningGrocerySupportActionAuditResult,
} from './planningGrocerySupportActionAuditTypes';

interface AuditLogRow {
  id: string;
  created_at: string;
  updated_at: string;
  actor_user_id: string | null;
  actor_role: string;
  action_name: string;
  action_category: string;
  risk_level: string;
  policy_version: string;
  target_person_id: string | null;
  target_table: string | null;
  target_row_ids: string[] | null;
  request_payload_redacted: unknown;
  dry_run_id: string | null;
  before_evidence: unknown;
  after_evidence: unknown;
  result: string;
  failure_reason: string | null;
  approval_actor_user_id: string | null;
  approval_note: string | null;
  source_tool: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const RISK_LEVELS: Array<PlanningGrocerySupportActionRisk | 'all'> = [
  'all',
  'read_only',
  'low_mutation',
  'moderate_mutation',
  'high_risk',
  'prohibited',
];

const RESULTS: Array<PlanningGrocerySupportActionAuditResult | 'all'> = [
  'all',
  ...PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_RESULTS,
];

function normalizeLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function normalizeRiskLevel(
  value: PlanningGrocerySupportActionAuditLogFilters['risk_level'],
): PlanningGrocerySupportActionRisk | 'all' {
  return value && RISK_LEVELS.includes(value) ? value : 'all';
}

function normalizeResult(
  value: PlanningGrocerySupportActionAuditLogFilters['result'],
): PlanningGrocerySupportActionAuditResult | 'all' {
  return value && RESULTS.includes(value) ? value : 'all';
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function rowToAuditLog(row: AuditLogRow): PlanningGrocerySupportActionAuditLog {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    action_name: row.action_name,
    action_category: row.action_category as PlanningGrocerySupportActionAuditLog['action_category'],
    risk_level: row.risk_level as PlanningGrocerySupportActionRisk,
    policy_version: row.policy_version,
    target_person_id: row.target_person_id,
    target_table: row.target_table,
    target_row_ids: row.target_row_ids ?? [],
    request_payload_redacted: recordOrEmpty(row.request_payload_redacted),
    dry_run_id: row.dry_run_id,
    before_evidence: recordOrEmpty(row.before_evidence),
    after_evidence: row.after_evidence == null ? null : recordOrEmpty(row.after_evidence),
    result: row.result as PlanningGrocerySupportActionAuditResult,
    failure_reason: row.failure_reason,
    approval_actor_user_id: row.approval_actor_user_id,
    approval_note: row.approval_note,
    source_tool: row.source_tool,
    correlation_id: row.correlation_id,
    idempotency_key: row.idempotency_key,
  };
}

function countBy<T extends string>(
  rows: PlanningGrocerySupportActionAuditLog[],
  selector: (row: PlanningGrocerySupportActionAuditLog) => T,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function emptyReport(
  filters: PlanningGrocerySupportActionAuditLogReport['filters_applied'],
  warnings: string[] = [],
): PlanningGrocerySupportActionAuditLogReport {
  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_returned: 0,
      by_result: {},
      by_risk_level: {},
      by_action_category: {},
      latest_created_at: null,
    },
    filters_applied: filters,
    audit_logs: [],
    warnings,
    non_goals: [
      'This report is read-only audit-log inspection.',
      'This service does not insert audit logs or execute support actions.',
      'Future support actions require separate implementation packets and policy approval.',
    ],
  };
}

function missingTableMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message ?? '';
  if (
    maybeError.code === '42P01' ||
    maybeError.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('Could not find the table')
  ) {
    return `Audit-log table ${PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_TABLE} is not available yet. Apply scripts/sql/createPlanningGrocerySupportActionAuditLogs.sql before expecting records.`;
  }
  return null;
}

export async function getPlanningGrocerySupportActionAuditLogs(
  filters: PlanningGrocerySupportActionAuditLogFilters = {},
): Promise<PlanningGrocerySupportActionAuditLogReport> {
  const normalizedFilters: PlanningGrocerySupportActionAuditLogReport['filters_applied'] = {
    target_person_id: normalizeText(filters.target_person_id),
    actor_user_id: normalizeText(filters.actor_user_id),
    action_name: normalizeText(filters.action_name),
    risk_level: normalizeRiskLevel(filters.risk_level),
    result: normalizeResult(filters.result),
    from: normalizeText(filters.from),
    to: normalizeText(filters.to),
    limit: normalizeLimit(filters.limit),
  };

  let query = supabaseAdmin
    .from(PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(normalizedFilters.limit);

  if (normalizedFilters.target_person_id) {
    query = query.eq('target_person_id', normalizedFilters.target_person_id);
  }
  if (normalizedFilters.actor_user_id) {
    query = query.eq('actor_user_id', normalizedFilters.actor_user_id);
  }
  if (normalizedFilters.action_name) {
    query = query.eq('action_name', normalizedFilters.action_name);
  }
  if (normalizedFilters.risk_level !== 'all') {
    query = query.eq('risk_level', normalizedFilters.risk_level);
  }
  if (normalizedFilters.result !== 'all') {
    query = query.eq('result', normalizedFilters.result);
  }
  if (normalizedFilters.from) {
    query = query.gte('created_at', normalizedFilters.from);
  }
  if (normalizedFilters.to) {
    query = query.lte('created_at', normalizedFilters.to);
  }

  const { data, error } = await query;
  if (error) {
    const missing = missingTableMessage(error);
    if (missing) {
      return emptyReport(normalizedFilters, [missing]);
    }
    throw new Error(`Failed to read support action audit logs: ${error.message}`);
  }

  const auditLogs = ((data ?? []) as AuditLogRow[]).map(rowToAuditLog);
  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_returned: auditLogs.length,
      by_result: countBy(auditLogs, (row) => row.result),
      by_risk_level: countBy(auditLogs, (row) => row.risk_level),
      by_action_category: countBy(auditLogs, (row) => row.action_category),
      latest_created_at: auditLogs[0]?.created_at ?? null,
    },
    filters_applied: normalizedFilters,
    audit_logs: auditLogs,
    warnings: [],
    non_goals: [
      'This report is read-only audit-log inspection.',
      'This service does not insert audit logs or execute support actions.',
      'Future support actions require separate implementation packets and policy approval.',
    ],
  };
}
