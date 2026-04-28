/**
 * Packet 65 — planning/grocery support action policy constants.
 *
 * This module is intentionally inert: no imports, reads, writes, network calls,
 * database calls, or runtime side effects. It mirrors the policy document for
 * future support-action design work.
 */

export const PLANNING_GROCERY_SUPPORT_ACTION_POLICY_VERSION = '2026-04-packet-65';

export type PlanningGrocerySupportActionRisk =
  | 'read_only'
  | 'low_mutation'
  | 'moderate_mutation'
  | 'high_risk'
  | 'prohibited';

export type PlanningGrocerySupportActionCategory =
  | 'read_only_export'
  | 'single_row_metadata_mark'
  | 'single_row_disable'
  | 'single_person_backfill_rerun'
  | 'legacy_metadata_cleanup'
  | 'bulk_cleanup'
  | 'product_semantics_override'
  | 'support_case_record'
  | 'support_audit_note';

export type PlanningGrocerySupportApprovalRequirement =
  | 'admin_access'
  | 'single_operator_confirmation'
  | 'operator_confirmation_with_dry_run'
  | 'engineering_approval_with_rollback_plan'
  | 'no_implementation';

export interface PlanningGrocerySupportActionPolicyClassification {
  category: PlanningGrocerySupportActionCategory;
  risk: PlanningGrocerySupportActionRisk;
  approval_requirement: PlanningGrocerySupportApprovalRequirement;
  future_only: boolean;
  audit_log_required: boolean;
  dry_run_required: boolean;
  mutation_allowed_by_policy: boolean;
}

export const READ_ONLY_SUPPORT_ACTIONS = [
  'planning_grocery_snapshot',
  'planning_storage_audit',
  'planning_legacy_cleanup_dry_run',
  'planning_grocery_anomalies',
  'planning_grocery_support_case_export',
] as const;

export const PROHIBITED_SUPPORT_ACTIONS = [
  'bulk_people_metadata_delete',
  'unscoped_cleanup_without_dry_run',
  'derived_grocery_truth_override',
  'execution_state_change_for_grocery_demand',
  'silent_legacy_metadata_response_merge',
  'delete_imported_meal_ancestry',
  'delete_reusable_provenance',
  'delete_journal_entries_for_planning_repair',
  'mutation_without_audit_log',
  'mutation_from_get_endpoint',
  'non_admin_support_action',
  'client_side_supabase_write_bypass',
  'unapproved_scheduled_cleanup_or_repair',
] as const;

export const SUPPORT_ACTION_POLICY_CLASSIFICATIONS = {
  read_only_export: {
    category: 'read_only_export',
    risk: 'read_only',
    approval_requirement: 'admin_access',
    future_only: false,
    audit_log_required: false,
    dry_run_required: false,
    mutation_allowed_by_policy: false,
  },
  low_risk_support_note: {
    category: 'support_audit_note',
    risk: 'low_mutation',
    approval_requirement: 'single_operator_confirmation',
    future_only: true,
    audit_log_required: true,
    dry_run_required: false,
    mutation_allowed_by_policy: false,
  },
  moderate_single_row_disable: {
    category: 'single_row_disable',
    risk: 'moderate_mutation',
    approval_requirement: 'operator_confirmation_with_dry_run',
    future_only: true,
    audit_log_required: true,
    dry_run_required: true,
    mutation_allowed_by_policy: false,
  },
  high_risk_legacy_cleanup: {
    category: 'legacy_metadata_cleanup',
    risk: 'high_risk',
    approval_requirement: 'engineering_approval_with_rollback_plan',
    future_only: true,
    audit_log_required: true,
    dry_run_required: true,
    mutation_allowed_by_policy: false,
  },
  prohibited_bulk_cleanup: {
    category: 'bulk_cleanup',
    risk: 'prohibited',
    approval_requirement: 'no_implementation',
    future_only: false,
    audit_log_required: true,
    dry_run_required: true,
    mutation_allowed_by_policy: false,
  },
} as const satisfies Record<string, PlanningGrocerySupportActionPolicyClassification>;

export interface PlanningGrocerySupportActionAuditLogShape {
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_role: string;
  action_name: string;
  action_category: PlanningGrocerySupportActionCategory;
  risk_level: PlanningGrocerySupportActionRisk;
  target_person_id: string | null;
  target_table: string | null;
  target_row_ids: string[];
  request_payload_redacted: Record<string, unknown>;
  dry_run_id: string | null;
  before_evidence: Record<string, unknown>;
  after_evidence: Record<string, unknown> | null;
  result: 'requested' | 'dry_run' | 'applied' | 'failed' | 'rejected';
  failure_reason: string | null;
  approval_actor_user_id: string | null;
  approval_note: string | null;
  policy_version: typeof PLANNING_GROCERY_SUPPORT_ACTION_POLICY_VERSION;
}
