-- ============================================================================
-- Packet 66 — Planning/Grocery Support Action Audit Log Foundation
--
-- Additive schema for future support-action accountability. This script only
-- creates the audit table, constraints, indexes, comments, and RLS posture.
-- It does not insert audit rows or implement support actions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.planning_grocery_support_action_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  actor_user_id UUID,
  actor_role TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_category TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  policy_version TEXT NOT NULL,

  target_person_id UUID,
  target_table TEXT,
  target_row_ids UUID[] NOT NULL DEFAULT '{}',

  request_payload_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  dry_run_id TEXT,
  before_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_evidence JSONB,

  result TEXT NOT NULL,
  failure_reason TEXT,
  approval_actor_user_id UUID,
  approval_note TEXT,

  source_tool TEXT,
  correlation_id TEXT,
  idempotency_key TEXT,

  CONSTRAINT planning_grocery_support_audit_risk_level_check
    CHECK (risk_level IN ('read_only', 'low_mutation', 'moderate_mutation', 'high_risk', 'prohibited')),
  CONSTRAINT planning_grocery_support_audit_result_check
    CHECK (result IN ('requested', 'dry_run', 'approved', 'applied', 'failed', 'rejected', 'cancelled')),
  CONSTRAINT planning_grocery_support_audit_category_check
    CHECK (
      action_category IN (
        'read_only_export',
        'single_row_metadata_mark',
        'single_row_disable',
        'single_person_backfill_rerun',
        'legacy_metadata_cleanup',
        'bulk_cleanup',
        'product_semantics_override',
        'support_case_record',
        'support_audit_note'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_created_at
  ON public.planning_grocery_support_action_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_target_person
  ON public.planning_grocery_support_action_audit_logs (target_person_id);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_actor
  ON public.planning_grocery_support_action_audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_action_name
  ON public.planning_grocery_support_action_audit_logs (action_name);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_risk_level
  ON public.planning_grocery_support_action_audit_logs (risk_level);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_result
  ON public.planning_grocery_support_action_audit_logs (result);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_correlation
  ON public.planning_grocery_support_action_audit_logs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_planning_grocery_support_audit_idempotency
  ON public.planning_grocery_support_action_audit_logs (idempotency_key);

DROP TRIGGER IF EXISTS planning_grocery_support_action_audit_logs_updated_at
  ON public.planning_grocery_support_action_audit_logs;

CREATE TRIGGER planning_grocery_support_action_audit_logs_updated_at
  BEFORE UPDATE ON public.planning_grocery_support_action_audit_logs
  FOR EACH ROW EXECUTE FUNCTION update_journal_updated_at();

ALTER TABLE public.planning_grocery_support_action_audit_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.planning_grocery_support_action_audit_logs IS
  'Append-only accountability log for future planning/grocery support actions. Packet 66 creates inspection foundation only; future packets must add audited write paths explicitly.';

COMMENT ON COLUMN public.planning_grocery_support_action_audit_logs.request_payload_redacted IS
  'Redacted support-action request payload. Do not store raw people.metadata blobs or large product payloads here.';

COMMENT ON COLUMN public.planning_grocery_support_action_audit_logs.before_evidence IS
  'Compact before-state evidence required by the Packet 65 support action policy.';

COMMENT ON COLUMN public.planning_grocery_support_action_audit_logs.after_evidence IS
  'Compact after-state evidence for future applied actions. NULL for requested/dry-run/rejected/cancelled records.';

COMMENT ON COLUMN public.planning_grocery_support_action_audit_logs.policy_version IS
  'Support action policy version used to classify and authorize the logged event.';
