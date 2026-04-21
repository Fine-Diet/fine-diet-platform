/**
 * Plans Phase 16 — AI runtime types.
 *
 * Governed substrate for provider/model selection, task routing, and
 * fallback. Kept provider-agnostic: there are no imports from any
 * vendor SDK here, and feature code should never hardcode provider or
 * model strings at call sites — they must come from ai_model_configs
 * via the runtime.
 */

export const AI_MODEL_TIERS = ['default', 'quality', 'fallback'] as const;
export type AIModelTier = (typeof AI_MODEL_TIERS)[number];

/**
 * Task types mirror the `ai_runs.run_type` check constraint. Any new
 * task type must be added there first to keep the audit trail
 * consistent.
 */
export const AI_TASK_TYPES = [
  'plan_generate',
  'plan_regenerate',
  'substitution',
  'restaurant_rec',
  'menu_parse',
  'recipe_parse',
  'grocery_list',
  'nds_optimize',
  'recipe_normalize',
  'menu_normalize',
  'structure_extract',
  'video_transcript_fetch',
  'onscreen_text_extract',
  // Packet 26 §3d — Translate a non-English caption/transcript to
  // English before it flows into recipe normalization. Deterministic
  // fallback returns the original text unchanged so the import never
  // blocks when translation is unavailable.
  'caption_translate',
  // Packet 27 — External transcript provider fallback for videos
  // where the first-party adapter ladder (captions/description/
  // title) could not recover usable recipe text. Preferred route is
  // a governed third-party provider (e.g. Supadata); fallback is
  // stub:deterministic which declines so the acquisition stays on
  // the existing title-only/manual-assist path. Input shape: the
  // caller passes the canonical video URL + platform classification
  // so the adapter can target the right endpoint.
  'video_transcript_external',
] as const;
export type AITaskType = (typeof AI_TASK_TYPES)[number];

export interface AIModelConfig {
  id: string;
  provider_key: string;
  model_key: string;
  display_name: string | null;
  enabled: boolean;
  tier: AIModelTier;
  task_types: string[];
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  temperature: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AITaskPolicy {
  task_type: AITaskType;
  preferred_model_config_id: string | null;
  fallback_model_config_id: string | null;
  deterministic_fallback_available: boolean;
  required_entitlement: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The resolved routing decision made by the runtime before it hands
 * off to a feature's `execute` callback. `deterministic_only` is true
 * when no AI config is routable for this task and the runtime is
 * relying entirely on the caller's deterministic path.
 */
export interface AIResolvedRoute {
  task_type: AITaskType;
  provider_key: string;
  model_key: string | null;
  model_config: AIModelConfig | null;
  tier: AIModelTier | null;
  source: 'preferred' | 'fallback' | 'deterministic_only';
  deterministic_fallback_available: boolean;
}

/**
 * Result from a single runtime execution attempt.
 */
export interface AIRunOutcome<TOutput> {
  output: TOutput;
  route: AIResolvedRoute;
  latency_ms: number;
  fallback_used: boolean;
  errors: string[];
}

/**
 * Admin-facing join of a policy with its resolved configs, used by
 * the admin UI so a single page can render the full routing view.
 */
export interface AITaskPolicyWithConfigs extends AITaskPolicy {
  preferred_config: AIModelConfig | null;
  fallback_config: AIModelConfig | null;
}
