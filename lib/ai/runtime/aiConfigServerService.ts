/**
 * Plans Phase 16 — AI config server service.
 *
 * Server-only read/write of `ai_model_configs` and `ai_task_policies`,
 * plus resolution of a task type to the routing chain used by the
 * runtime. All writes go through the Supabase service role.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  AIModelConfig,
  AIModelTier,
  AITaskPolicy,
  AITaskPolicyWithConfigs,
  AITaskType,
} from './types';
import type {
  ModelConfigUpdateInput,
  TaskPolicyUpdateInput,
} from './validators';

interface ModelConfigRow {
  id: string;
  provider_key: string;
  model_key: string;
  display_name: string | null;
  enabled: boolean;
  tier: AIModelTier;
  task_types: string[] | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  temperature: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskPolicyRow {
  task_type: AITaskType;
  preferred_model_config_id: string | null;
  fallback_model_config_id: string | null;
  deterministic_fallback_available: boolean;
  required_entitlement: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToModelConfig(row: ModelConfigRow): AIModelConfig {
  return {
    id: row.id,
    provider_key: row.provider_key,
    model_key: row.model_key,
    display_name: row.display_name,
    enabled: row.enabled,
    tier: row.tier,
    task_types: Array.isArray(row.task_types) ? row.task_types : [],
    max_input_tokens: row.max_input_tokens,
    max_output_tokens: row.max_output_tokens,
    temperature:
      row.temperature == null
        ? null
        : typeof row.temperature === 'string'
          ? Number(row.temperature)
          : row.temperature,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToTaskPolicy(row: TaskPolicyRow): AITaskPolicy {
  return {
    task_type: row.task_type,
    preferred_model_config_id: row.preferred_model_config_id,
    fallback_model_config_id: row.fallback_model_config_id,
    deterministic_fallback_available: row.deterministic_fallback_available,
    required_entitlement: row.required_entitlement,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listModelConfigs(): Promise<AIModelConfig[]> {
  const { data, error } = await supabaseAdmin
    .from('ai_model_configs')
    .select('*')
    .order('provider_key', { ascending: true })
    .order('tier', { ascending: true })
    .order('model_key', { ascending: true });
  if (error) throw new Error(`listModelConfigs failed: ${error.message}`);
  return (data ?? []).map((r) => rowToModelConfig(r as ModelConfigRow));
}

export async function getModelConfigById(
  id: string,
): Promise<AIModelConfig | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_model_configs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getModelConfigById failed: ${error.message}`);
  return data ? rowToModelConfig(data as ModelConfigRow) : null;
}

export async function updateModelConfig(
  id: string,
  patch: ModelConfigUpdateInput,
): Promise<AIModelConfig> {
  const { data, error } = await supabaseAdmin
    .from('ai_model_configs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`updateModelConfig failed: ${error.message}`);
  return rowToModelConfig(data as ModelConfigRow);
}

export async function listTaskPolicies(): Promise<AITaskPolicy[]> {
  const { data, error } = await supabaseAdmin
    .from('ai_task_policies')
    .select('*')
    .order('task_type', { ascending: true });
  if (error) throw new Error(`listTaskPolicies failed: ${error.message}`);
  return (data ?? []).map((r) => rowToTaskPolicy(r as TaskPolicyRow));
}

export async function listTaskPoliciesWithConfigs(): Promise<
  AITaskPolicyWithConfigs[]
> {
  const [policies, configs] = await Promise.all([
    listTaskPolicies(),
    listModelConfigs(),
  ]);
  const byId = new Map(configs.map((c) => [c.id, c]));
  return policies.map((p) => ({
    ...p,
    preferred_config: p.preferred_model_config_id
      ? (byId.get(p.preferred_model_config_id) ?? null)
      : null,
    fallback_config: p.fallback_model_config_id
      ? (byId.get(p.fallback_model_config_id) ?? null)
      : null,
  }));
}

export async function getTaskPolicy(
  taskType: AITaskType,
): Promise<AITaskPolicy | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_task_policies')
    .select('*')
    .eq('task_type', taskType)
    .maybeSingle();
  if (error) throw new Error(`getTaskPolicy failed: ${error.message}`);
  return data ? rowToTaskPolicy(data as TaskPolicyRow) : null;
}

export async function upsertTaskPolicy(
  taskType: AITaskType,
  patch: TaskPolicyUpdateInput,
): Promise<AITaskPolicy> {
  // Use update-if-exists / insert-if-missing semantics via upsert on
  // the primary key so admins can safely configure policies for new
  // task types before a deterministic flow wires them in.
  const { data, error } = await supabaseAdmin
    .from('ai_task_policies')
    .upsert(
      {
        task_type: taskType,
        ...patch,
      },
      { onConflict: 'task_type' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`upsertTaskPolicy failed: ${error.message}`);
  return rowToTaskPolicy(data as TaskPolicyRow);
}

/**
 * Resolution result consumed by `runAITask`.
 *
 * `preferred` / `fallback` are nullable so the runtime can distinguish
 * between "admin selected a config but it is disabled" (config
 * returned, `enabled` field false — caller filters it out) and
 * "admin never selected a config" (null here).
 */
export interface ResolvedTaskRoute {
  task_type: AITaskType;
  policy: AITaskPolicy | null;
  preferred: AIModelConfig | null;
  fallback: AIModelConfig | null;
}

export async function resolveTaskRoute(
  taskType: AITaskType,
): Promise<ResolvedTaskRoute> {
  const policy = await getTaskPolicy(taskType);
  if (!policy) {
    return { task_type: taskType, policy: null, preferred: null, fallback: null };
  }
  const [preferred, fallback] = await Promise.all([
    policy.preferred_model_config_id
      ? getModelConfigById(policy.preferred_model_config_id)
      : Promise.resolve(null),
    policy.fallback_model_config_id
      ? getModelConfigById(policy.fallback_model_config_id)
      : Promise.resolve(null),
  ]);
  return { task_type: taskType, policy, preferred, fallback };
}
