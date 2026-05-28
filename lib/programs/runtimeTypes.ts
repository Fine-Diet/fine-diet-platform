/**
 * Program Runtime Contract Packet 1 — shared types
 *
 * Runtime is the guided, version-locked layer. It is deliberately separate
 * from catalogue/content (`programs`, `program_modules`,
 * `program_content_items`), assignments, entitlements, progress, and Plans
 * guidance.
 */

export type ProgramVersionStatus = 'draft' | 'published' | 'archived';
export const PROGRAM_VERSION_STATUSES: readonly ProgramVersionStatus[] = [
  'draft',
  'published',
  'archived',
] as const;

export type ProgramEnrollmentStatus =
  | 'pre_start'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';
export const PROGRAM_ENROLLMENT_STATUSES: readonly ProgramEnrollmentStatus[] = [
  'pre_start',
  'active',
  'paused',
  'completed',
  'cancelled',
] as const;

export type ProgramEnrollmentSource =
  | 'entitlement'
  | 'assignment'
  | 'admin_grant';

export type ProgramCapacity = 'low' | 'steady' | 'high';
export const PROGRAM_CAPACITIES: readonly ProgramCapacity[] = [
  'low',
  'steady',
  'high',
] as const;

export type ProgramCheckinTemplateStatus = 'draft' | 'published' | 'archived';

export type ProgramCheckinResponseStatus = 'completed' | 'skipped';

export type ProgramRecommendationStatus =
  | 'generated'
  | 'dismissed'
  | 'applied'
  | 'superseded';

export type JsonObject = Record<string, unknown>;

export type BaselineRecommendationActionType =
  | 'personalized_care'
  | 'guided_program'
  | 'baseline_repeat'
  | 'baseline_reinforcement';

export type BaselineRecommendedStep =
  | 'PERSONALIZED_CARE'
  | 'BASELINE_REPEAT'
  | 'BASELINE_REINFORCEMENT'
  | 'DIGESTIVE_FOUNDATIONS'
  | 'DIGESTIVE_RESET'
  | 'PROTEIN_SUFFICIENCY'
  | 'PROTEIN_OPTIMIZATION'
  | 'INFLAMMATION_REGULATION'
  | 'INFLAMMATION_CONTROL';

export type BaselineRecommendationPayload = JsonObject & {
  action_type: BaselineRecommendationActionType;
  recommended_step: BaselineRecommendedStep;
  reason_snippet: string;
  rule_version: 'baseline_recommendation_engine_v1';
};

export type BaselineRecommendationMetricsSnapshot = JsonObject & {
  completed_checkin_count: number;
  skipped_checkin_count: number;
  day_21_handled: boolean;
  has_gi_red_flags: boolean;
  objective_worsening_fields: string[];
  subjective_day_21_decline: boolean;
  digestion_unstable: boolean;
  under_fueled_or_protein_unstable: boolean;
};

export type BaselineRecommendationInputSnapshot = JsonObject & {
  enrollment_id: string;
  program_slug: string;
  evaluated_checkin_days: number[];
  checkin_response_ids: string[];
  checkin_status_by_day: Record<string, ProgramCheckinResponseStatus>;
  existing_recommendation_ids: string[];
};

export interface BaselineRecommendationEvaluation {
  recommendationType: 'baseline_day_21_v1';
  programDay: 21;
  basedOnCheckinResponseId: string | null;
  payload: BaselineRecommendationPayload;
  inputSnapshot: BaselineRecommendationInputSnapshot;
  metricsSnapshot: BaselineRecommendationMetricsSnapshot;
}

export interface ProgramVersion {
  id: string;
  program_id: string;
  version_key: string;
  version_label: string | null;
  version_number: number;
  status: ProgramVersionStatus;
  duration_days: number | null;
  default_unlock_day: number;
  published_at: string | null;
  metadata: JsonObject;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramEnrollment {
  id: string;
  person_id: string;
  program_id: string;
  program_slug: string;
  program_version_id: string;
  source_type: ProgramEnrollmentSource;
  source_ref: string | null;
  entitlement_key: string | null;
  assignment_id: string | null;
  purchase_date: string | null;
  selected_start_date: string;
  started_at: string | null;
  completed_at: string | null;
  status: ProgramEnrollmentStatus;
  timezone: string;
  current_capacity: ProgramCapacity;
  paused_days_total: number;
  pause_until: string | null;
  input_snapshot_json: JsonObject;
  computed_metrics_snapshot_json: JsonObject;
  metadata: JsonObject;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramCheckinTemplate {
  id: string;
  program_version_id: string;
  checkin_day: number;
  title: string;
  description: string | null;
  prompt_md: string | null;
  questions_json: unknown[];
  status: ProgramCheckinTemplateStatus;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface ProgramCheckinResponse {
  id: string;
  enrollment_id: string;
  checkin_template_id: string | null;
  checkin_day: number;
  response_status: ProgramCheckinResponseStatus;
  response_payload_json: JsonObject;
  skipped_reason: string | null;
  responded_at: string | null;
  skipped_at: string | null;
  input_snapshot_json: JsonObject;
  computed_metrics_snapshot_json: JsonObject;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface ProgramRecommendation {
  id: string;
  enrollment_id: string;
  based_on_checkin_response_id: string | null;
  recommendation_type: string;
  program_day: number | null;
  status: ProgramRecommendationStatus;
  recommendation_payload_json: JsonObject;
  input_snapshot_json: JsonObject;
  computed_metrics_snapshot_json: JsonObject;
  metadata: JsonObject;
  generated_at: string;
  acted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramRuntimeSummary {
  enrollment: ProgramEnrollment;
  version: ProgramVersion;
  program: {
    id: string;
    slug: string;
    title: string;
    tagline: string | null;
    description: string | null;
    storefront_href: string | null;
  };
  resolved_status: ProgramEnrollmentStatus;
  current_day: number;
  timezone: string;
  next_checkin_template: ProgramCheckinTemplate | null;
  latest_checkin_response: ProgramCheckinResponse | null;
  latest_recommendation: ProgramRecommendation | null;
  resolved_at: string;
}

export interface ProgramRuntimeSummaryList {
  person_id: string;
  summaries: ProgramRuntimeSummary[];
  resolved_at: string;
}

export interface CreateProgramEnrollmentInput {
  personId: string;
  programSlug: string;
  sourceType: ProgramEnrollmentSource;
  selectedStartDate: string;
  timezone?: string | null;
  programVersionId?: string | null;
  purchaseDate?: string | null;
  sourceRef?: string | null;
  entitlementKey?: string | null;
  assignmentId?: string | null;
  currentCapacity?: ProgramCapacity;
  inputSnapshot?: JsonObject;
  computedMetricsSnapshot?: JsonObject;
  metadata?: JsonObject;
  createdByUserId?: string | null;
}

export interface RespondToProgramCheckinInput {
  personId: string;
  enrollmentId: string;
  checkinTemplateId?: string | null;
  checkinDay?: number | null;
  responseStatus: ProgramCheckinResponseStatus;
  responsesJson?: JsonObject;
  skippedReason?: string | null;
  inputSnapshot?: JsonObject;
  computedMetricsSnapshot?: JsonObject;
  metadata?: JsonObject;
}

export interface ProgramCheckinResponseResult {
  response: ProgramCheckinResponse;
  summary: ProgramRuntimeSummary;
}
