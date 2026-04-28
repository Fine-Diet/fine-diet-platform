/**
 * Packet 66 — policy-aligned audit-log types.
 *
 * Inert constants and types only. This module has no database calls and no
 * support-action execution behavior.
 */

import type {
  PlanningGrocerySupportActionCategory,
  PlanningGrocerySupportActionRisk,
} from './planningGrocerySupportActionPolicy';

export const PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_TABLE =
  'planning_grocery_support_action_audit_logs';

export const PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_RESULTS = [
  'requested',
  'dry_run',
  'approved',
  'applied',
  'failed',
  'rejected',
  'cancelled',
] as const;

export type PlanningGrocerySupportActionAuditResult =
  (typeof PLANNING_GROCERY_SUPPORT_ACTION_AUDIT_RESULTS)[number];

export interface PlanningGrocerySupportActionAuditLog {
  id: string;
  created_at: string;
  updated_at: string;
  actor_user_id: string | null;
  actor_role: string;
  action_name: string;
  action_category: PlanningGrocerySupportActionCategory;
  risk_level: PlanningGrocerySupportActionRisk;
  policy_version: string;
  target_person_id: string | null;
  target_table: string | null;
  target_row_ids: string[];
  request_payload_redacted: Record<string, unknown>;
  dry_run_id: string | null;
  before_evidence: Record<string, unknown>;
  after_evidence: Record<string, unknown> | null;
  result: PlanningGrocerySupportActionAuditResult;
  failure_reason: string | null;
  approval_actor_user_id: string | null;
  approval_note: string | null;
  source_tool: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
}

export interface PlanningGrocerySupportActionAuditLogFilters {
  target_person_id?: string | null;
  actor_user_id?: string | null;
  action_name?: string | null;
  risk_level?: PlanningGrocerySupportActionRisk | 'all' | null;
  result?: PlanningGrocerySupportActionAuditResult | 'all' | null;
  from?: string | null;
  to?: string | null;
  limit?: number | null;
}

export interface PlanningGrocerySupportActionAuditLogReport {
  generated_at: string;
  summary: {
    total_returned: number;
    by_result: Record<string, number>;
    by_risk_level: Record<string, number>;
    by_action_category: Record<string, number>;
    latest_created_at: string | null;
  };
  filters_applied: {
    target_person_id: string | null;
    actor_user_id: string | null;
    action_name: string | null;
    risk_level: PlanningGrocerySupportActionRisk | 'all';
    result: PlanningGrocerySupportActionAuditResult | 'all';
    from: string | null;
    to: string | null;
    limit: number;
  };
  audit_logs: PlanningGrocerySupportActionAuditLog[];
  warnings: string[];
  non_goals: string[];
}
