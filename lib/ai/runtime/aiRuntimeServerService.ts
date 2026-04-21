/**
 * Plans Phase 16 — AI runtime.
 *
 * Single entry point for any feature that needs to invoke an
 * AI-shaped task. The runtime:
 *
 *   1. Resolves the preferred model config for the task via
 *      `ai_task_policies` + `ai_model_configs`.
 *   2. Skips disabled configs.
 *   3. Calls the registered provider adapter (if any) or the
 *      caller-provided `execute` callback.
 *   4. On failure, resolves the fallback config and retries.
 *   5. On both failures, invokes the caller-provided deterministic
 *      callback when the policy allows it.
 *   6. Records exactly one `ai_runs` row with `fallback_used` and
 *      `model_config_id` so the audit trail reflects what actually
 *      executed.
 *
 * Feature code never imports provider SDKs. Provider-specific
 * branching (if any) lives inside the caller's `execute` callback and
 * is keyed on the `provider` value the runtime passes back — which
 * comes from `ai_model_configs`, not from hardcoded strings.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { getProviderAdapter } from './providerAdapter';
import { resolveTaskRoute } from './aiConfigServerService';
// Side-effect import: registers the openai adapter at module load so
// any server code that reaches the runtime picks it up automatically.
import './adapters/openaiAdapter';
// Packet 27 — External transcript provider (Supadata) for the
// `video_transcript_external` task family.
import './adapters/supadataAdapter';
import type {
  AIModelConfig,
  AIResolvedRoute,
  AIRunOutcome,
  AITaskType,
} from './types';

export interface RunAITaskContext {
  personId: string;
  planId?: string | null;
}

export interface RunAITaskArgs<TInput, TOutput> {
  taskType: AITaskType;
  input: TInput;
  ctx: RunAITaskContext;
  /**
   * Provider-agnostic executor. Called with the resolved route so the
   * feature can branch on `route.provider_key` if it needs to. Throw
   * to signal failure and trigger fallback.
   */
  execute: (route: AIResolvedRoute) => Promise<TOutput>;
  /**
   * Optional deterministic / trusted path to call when no AI config
   * is routable or both preferred and fallback executions fail. Only
   * invoked when the task policy has
   * `deterministic_fallback_available = true`.
   */
  deterministicFallback?: () => Promise<TOutput>;
}

export class AIRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'no_policy'
      | 'no_routable_config'
      | 'provider_failure_no_fallback'
      | 'provider_failure_no_deterministic',
    public readonly errors: string[] = [],
  ) {
    super(message);
    this.name = 'AIRuntimeError';
  }
}

/**
 * Runtime entry point.
 */
export async function runAITask<TInput, TOutput>(
  args: RunAITaskArgs<TInput, TOutput>,
): Promise<AIRunOutcome<TOutput>> {
  const route = await resolveTaskRoute(args.taskType);
  const errors: string[] = [];

  const preferred = route.preferred && route.preferred.enabled ? route.preferred : null;
  const fallback = route.fallback && route.fallback.enabled ? route.fallback : null;
  const deterministicAllowed =
    (route.policy?.deterministic_fallback_available ?? false) &&
    typeof args.deterministicFallback === 'function';

  // No routable AI config at all.
  if (!preferred && !fallback) {
    if (!deterministicAllowed) {
      throw new AIRuntimeError(
        `No routable AI config for task '${args.taskType}' and no deterministic fallback.`,
        'no_routable_config',
      );
    }
    const started = Date.now();
    try {
      const output = await args.deterministicFallback!();
      const latency_ms = Date.now() - started;
      const resolved: AIResolvedRoute = {
        task_type: args.taskType,
        provider_key: 'deterministic',
        model_key: null,
        model_config: null,
        tier: null,
        source: 'deterministic_only',
        deterministic_fallback_available: true,
      };
      await recordAiRun({
        personId: args.ctx.personId,
        planId: args.ctx.planId ?? null,
        taskType: args.taskType,
        config: null,
        route: resolved,
        input: args.input,
        output,
        status: 'succeeded',
        error_text: null,
        latency_ms,
        fallback_used: true,
      });
      return { output, route: resolved, latency_ms, fallback_used: true, errors: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`deterministic:${msg}`);
      throw new AIRuntimeError(
        `Deterministic fallback failed for task '${args.taskType}'.`,
        'provider_failure_no_fallback',
        errors,
      );
    }
  }

  // Attempt preferred, then fallback, then deterministic in that order.
  const attempts: Array<{ config: AIModelConfig; source: 'preferred' | 'fallback' }> =
    [];
  if (preferred) attempts.push({ config: preferred, source: 'preferred' });
  if (fallback && (!preferred || fallback.id !== preferred.id)) {
    attempts.push({ config: fallback, source: 'fallback' });
  }

  let attempt = 0;
  for (const a of attempts) {
    attempt += 1;
    const started = Date.now();
    const resolved: AIResolvedRoute = {
      task_type: args.taskType,
      provider_key: a.config.provider_key,
      model_key: a.config.model_key,
      model_config: a.config,
      tier: a.config.tier,
      source: a.source,
      deterministic_fallback_available:
        route.policy?.deterministic_fallback_available ?? false,
    };

    try {
      // Give the registered adapter a chance first.
      const adapter = getProviderAdapter(a.config.provider_key);
      let output: TOutput | undefined;
      if (adapter && adapter.supports(args.taskType)) {
        const result = await adapter.execute<TInput, TOutput>({
          taskType: args.taskType,
          modelKey: a.config.model_key,
          modelConfig: a.config,
          input: args.input,
          personId: args.ctx.personId,
          planId: args.ctx.planId ?? null,
        });
        if (result.handled && typeof result.output !== 'undefined') {
          output = result.output as TOutput;
        }
      }

      if (typeof output === 'undefined') {
        output = await args.execute(resolved);
      }

      const latency_ms = Date.now() - started;
      const fallback_used = a.source !== 'preferred';
      await recordAiRun({
        personId: args.ctx.personId,
        planId: args.ctx.planId ?? null,
        taskType: args.taskType,
        config: a.config,
        route: resolved,
        input: args.input,
        output,
        status: 'succeeded',
        error_text: null,
        latency_ms,
        fallback_used,
      });
      return { output, route: resolved, latency_ms, fallback_used, errors };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${a.source}(${a.config.provider_key}/${a.config.model_key}):${msg}`);
      // Record the failed attempt so the audit trail shows what was tried.
      await recordAiRun({
        personId: args.ctx.personId,
        planId: args.ctx.planId ?? null,
        taskType: args.taskType,
        config: a.config,
        route: resolved,
        input: args.input,
        output: null,
        status: 'failed',
        error_text: msg,
        latency_ms: Date.now() - started,
        fallback_used: a.source !== 'preferred',
      });
      continue;
    }
  }

  // Provider chain exhausted — deterministic fallback is the last resort.
  if (deterministicAllowed) {
    const started = Date.now();
    try {
      const output = await args.deterministicFallback!();
      const latency_ms = Date.now() - started;
      const resolved: AIResolvedRoute = {
        task_type: args.taskType,
        provider_key: 'deterministic',
        model_key: null,
        model_config: null,
        tier: null,
        source: 'deterministic_only',
        deterministic_fallback_available: true,
      };
      await recordAiRun({
        personId: args.ctx.personId,
        planId: args.ctx.planId ?? null,
        taskType: args.taskType,
        config: null,
        route: resolved,
        input: args.input,
        output,
        status: 'succeeded',
        error_text: null,
        latency_ms,
        fallback_used: true,
      });
      return { output, route: resolved, latency_ms, fallback_used: true, errors };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`deterministic:${msg}`);
    }
  }

  throw new AIRuntimeError(
    `AI task '${args.taskType}' failed: preferred + fallback + deterministic exhausted.`,
    'provider_failure_no_deterministic',
    errors,
  );
}

// ---------------------------------------------------------------------------
// ai_runs writer — fire-and-forget. Any failure is logged and
// swallowed to match the "never block the feature response" contract.
// ---------------------------------------------------------------------------

interface RecordAiRunArgs {
  personId: string;
  planId: string | null;
  taskType: AITaskType;
  config: AIModelConfig | null;
  route: AIResolvedRoute;
  input: unknown;
  output: unknown;
  status: 'succeeded' | 'failed' | 'pending';
  error_text: string | null;
  latency_ms: number;
  fallback_used: boolean;
}

export async function recordAiRun(args: RecordAiRunArgs): Promise<void> {
  try {
    await supabaseAdmin.from('ai_runs').insert({
      person_id: args.personId,
      plan_id: args.planId,
      run_type: args.taskType,
      provider: args.route.provider_key,
      model: args.route.model_key,
      model_config_id: args.config?.id ?? null,
      fallback_used: args.fallback_used,
      request_payload_json: args.input ?? {},
      response_payload_json: args.output ?? null,
      status: args.status,
      error_text: args.error_text,
      latency_ms: args.latency_ms,
      cost_cents: null,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    });
  } catch (e) {
    console.warn('[ai_runtime/ai_runs] insert failed (non-fatal):', e);
  }
}
