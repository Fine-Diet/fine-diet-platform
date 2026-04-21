/**
 * Plans Phase 17 — Normalization service.
 *
 * Thin, provider-agnostic API that imports/menu callers use to run
 * AI-assisted language cleanup and coarse structure extraction
 * through the Packet 16 AI runtime.
 *
 * Contract (locked by Packet 17):
 *   - Callers never import a provider SDK. Everything goes through
 *     `runAITask` so provider/model selection and audit logging stay
 *     centralized.
 *   - AI output must pass Zod validation before it's used. On
 *     validation failure we return the caller-supplied deterministic
 *     input untouched, so the existing importer path keeps working.
 *   - AI may not create trusted food objects, rewrite NDS math, or
 *     override trusted-corpus governance. This layer only produces
 *     cleaned-up text.
 *
 * Today the only registered provider is the stub adapter, which
 * declines handling — so every call lands in `deterministicFallback`
 * and the returned `text` is the original input. The wiring still
 * records an `ai_runs` row per task via the runtime, satisfying
 * Packet 17's auditability acceptance criteria.
 */

import {
  runAITask,
  AIRuntimeError,
  type RunAITaskContext,
} from '@/lib/ai/runtime/aiRuntimeServerService';
import type { AIResolvedRoute, AIRunOutcome } from '@/lib/ai/runtime/types';
import {
  NormalizedMenuTextSchema,
  NormalizedRecipeTextSchema,
  type NormalizedMenuText,
  type NormalizedRecipeText,
} from './schemas';

export interface NormalizeRecipeInput {
  text: string;
  source_platform?: string | null;
  source_url?: string | null;
  user_hint?: string | null;
}

export interface NormalizeMenuInput {
  text: string;
  restaurant_name?: string | null;
  source_url?: string | null;
}

export interface NormalizeOutcome<TOutput> {
  /** The text downstream parsers should consume. */
  effective_text: string;
  /** Parsed, Zod-validated payload when AI produced a valid result. */
  ai_output: TOutput | null;
  /** Describes which path actually ran (preferred / fallback / deterministic_only). */
  route: AIResolvedRoute;
  /** True when runtime fell back to deterministic (i.e. AI did not produce usable output). */
  fallback_used: boolean;
  /** True when validation of the AI output failed and we downgraded to input. */
  validation_failed: boolean;
  /** Errors accumulated by the runtime across attempts. */
  errors: string[];
}

/**
 * Normalize pasted/fetched recipe text. Returns an outcome describing
 * which path executed; `effective_text` is always safe to hand to
 * `runRecipeImport()`.
 */
export async function normalizeRecipeText(
  ctx: RunAITaskContext,
  input: NormalizeRecipeInput,
): Promise<NormalizeOutcome<NormalizedRecipeText>> {
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('normalizeRecipeText: `text` is required.');
  }

  return runNormalizationTask<NormalizeRecipeInput, NormalizedRecipeText>({
    taskType: 'recipe_normalize',
    ctx,
    input,
    schema: NormalizedRecipeTextSchema,
    deterministicText: input.text,
  });
}

/**
 * Normalize pasted/fetched menu text. Returns an outcome describing
 * which path executed; `effective_text` is always safe to hand to
 * `runMenuImport()`.
 */
export async function normalizeMenuText(
  ctx: RunAITaskContext,
  input: NormalizeMenuInput,
): Promise<NormalizeOutcome<NormalizedMenuText>> {
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('normalizeMenuText: `text` is required.');
  }

  return runNormalizationTask<NormalizeMenuInput, NormalizedMenuText>({
    taskType: 'menu_normalize',
    ctx,
    input,
    schema: NormalizedMenuTextSchema,
    deterministicText: input.text,
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface RunNormalizationArgs<TInput, TOutput> {
  taskType: 'recipe_normalize' | 'menu_normalize';
  ctx: RunAITaskContext;
  input: TInput;
  schema: {
    safeParse: (data: unknown) => { success: true; data: TOutput } | { success: false; error: unknown };
  };
  deterministicText: string;
}

async function runNormalizationTask<TInput, TOutput>(
  args: RunNormalizationArgs<TInput, TOutput>,
): Promise<NormalizeOutcome<TOutput>> {
  let validationFailed = false;

  try {
    const outcome: AIRunOutcome<AIExecuteResult<TOutput>> = await runAITask<
      TInput,
      AIExecuteResult<TOutput>
    >({
      taskType: args.taskType,
      input: args.input,
      ctx: args.ctx,
      execute: async (route) => {
        // Today only the stub provider is wired. The stub is an
        // explicit pass-through: it returns the deterministic text
        // unchanged, lets the runtime record a clean ai_runs row, and
        // signals `kind: 'deterministic'` so we skip Zod validation on
        // an uncleaned payload. When a real provider is added, its
        // branch belongs here — keyed on `route.provider_key`, never
        // on hardcoded SDK imports.
        if (route.provider_key === 'stub') {
          return { kind: 'deterministic', text: args.deterministicText };
        }
        // Any unknown provider must not silently produce AI-flavored
        // output; throw so the runtime falls back to deterministic.
        throw new Error(
          `normalizationService: no execute branch wired for provider '${route.provider_key}'`,
        );
      },
      deterministicFallback: async () => ({
        kind: 'deterministic',
        text: args.deterministicText,
      }),
    });

    // Runtime returned. Interpret the result.
    if (outcome.output.kind === 'ai') {
      const parsed = args.schema.safeParse(outcome.output.value);
      if (parsed.success) {
        const out = parsed.data;
        const text =
          typeof (out as { text?: unknown }).text === 'string'
            ? ((out as { text: string }).text)
            : args.deterministicText;
        return {
          effective_text: text,
          ai_output: out,
          route: outcome.route,
          fallback_used: outcome.fallback_used,
          validation_failed: false,
          errors: outcome.errors,
        };
      }
      // Validation failed: drop AI output and keep deterministic input.
      validationFailed = true;
    }

    return {
      effective_text: args.deterministicText,
      ai_output: null,
      route: outcome.route,
      fallback_used: outcome.fallback_used,
      validation_failed: validationFailed,
      errors: outcome.errors,
    };
  } catch (err) {
    // Even if the runtime throws (misconfiguration, etc), the import
    // flow must not be blocked by normalization. Swallow and return
    // the deterministic input so the existing importer still runs.
    const msg = err instanceof Error ? err.message : String(err);
    const isRuntime = err instanceof AIRuntimeError;
    return {
      effective_text: args.deterministicText,
      ai_output: null,
      route: {
        task_type: args.taskType,
        provider_key: 'deterministic',
        model_key: null,
        model_config: null,
        tier: null,
        source: 'deterministic_only',
        deterministic_fallback_available: true,
      },
      fallback_used: true,
      validation_failed: validationFailed,
      errors: [isRuntime ? `runtime:${msg}` : `error:${msg}`],
    };
  }
}

type AIExecuteResult<TOutput> =
  | { kind: 'ai'; value: TOutput }
  | { kind: 'deterministic'; text: string };
