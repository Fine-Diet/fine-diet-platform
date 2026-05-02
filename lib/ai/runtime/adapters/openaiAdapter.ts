/**
 * Plans Phase 18 — First external AI provider adapter (OpenAI).
 *
 * The only live provider wired today. Scope is narrow by contract:
 * it handles the Packet 17 normalization task family
 * (`recipe_normalize`, `menu_normalize`, `structure_extract`) and
 * returns `{ handled: false }` for everything else so those tasks
 * stay on their existing deterministic paths.
 *
 * Design rules (locked by Packet 18):
 *   - No vendor SDK dependency. We call the REST API with native
 *     fetch so the runtime stays small and deployable on Vercel/Edge.
 *   - Auth via `OPENAI_API_KEY`. Optional `OPENAI_BASE_URL` override
 *     (useful for proxies and test fixtures). If the key is missing
 *     the adapter soft-declines (`handled: false`) so the runtime
 *     falls back to the deterministic caller path without blocking
 *     the user.
 *   - Response is requested in JSON object mode. We parse and wrap
 *     it in the normalization service's `{ kind: 'ai', value, _meta }`
 *     contract. Zod validation happens downstream in the
 *     normalization service; any parse/validation failure there
 *     causes the service to degrade to the deterministic input.
 *   - Hard network/HTTP/parse failures throw so the runtime records
 *     a failed `ai_runs` row and attempts fallback/deterministic.
 *   - Token caps come from the runtime's model config (Packet 16),
 *     not hardcoded feature values.
 */

import type {
  AIProviderAdapter,
  AIProviderExecuteArgs,
  AIProviderExecuteResult,
} from '../providerAdapter';
import { registerProviderAdapter } from '../providerAdapter';
import type { AIModelConfig, AITaskType } from '../types';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 20_000;
const SOCIAL_RECIPE_EXTRACT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_INPUT_CHARS = 18_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;

const SUPPORTED_TASK_TYPES: ReadonlySet<AITaskType> = new Set<AITaskType>([
  'recipe_normalize',
  'menu_normalize',
  'structure_extract',
  // Packet 26 §3d — Translate non-English caption/transcript text to
  // English so downstream normalization stays language-agnostic.
  'caption_translate',
  // Social Recipe Evidence Importer v1 — dedicated narrative extraction
  // from separated social evidence sources.
  'social_video_recipe_extract',
]);

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: { content: string | null };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  id?: string;
}

interface AIOutputWrapper {
  kind: 'ai';
  value: unknown;
  _meta: {
    provider: 'openai';
    model: string;
    openai_request_id: string | null;
    finish_reason: string | null;
    usage: {
      prompt_tokens: number | null;
      completion_tokens: number | null;
      total_tokens: number | null;
    };
    cost_cents_estimate: number | null;
    latency_ms: number;
  };
}

export const openaiAdapter: AIProviderAdapter = {
  provider_key: 'openai',

  supports(taskType) {
    return SUPPORTED_TASK_TYPES.has(taskType);
  },

  async execute<TInput, TOutput>(
    args: AIProviderExecuteArgs<TInput>,
  ): Promise<AIProviderExecuteResult<TOutput>> {
    if (!SUPPORTED_TASK_TYPES.has(args.taskType)) {
      return { handled: false };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      // Soft decline: config may be enabled but the environment lacks
      // credentials. The runtime will fall through to the caller's
      // execute callback (and, on failure, deterministic fallback).
      return { handled: false };
    }

    const baseUrl = (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const model = (args.modelKey && args.modelKey.trim().length > 0
      ? args.modelKey.trim()
      : DEFAULT_MODEL);

    const inputText = extractInputText(args.taskType, args.input);
    if (!inputText || inputText.trim().length === 0) {
      return { handled: false };
    }

    const trimmed = truncateForInput(inputText, args.modelConfig);
    const messages = buildMessages(args.taskType, trimmed);

    const maxOutputTokens =
      args.modelConfig?.max_output_tokens && args.modelConfig.max_output_tokens > 0
        ? args.modelConfig.max_output_tokens
        : DEFAULT_MAX_OUTPUT_TOKENS;
    const temperature =
      typeof args.modelConfig?.temperature === 'number'
        ? args.modelConfig.temperature
        : 0.2;

    const requestTimeoutMs = timeoutForTask(args.taskType);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const startedAt = Date.now();

    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`openai: request timed out after ${requestTimeoutMs}ms`);
      }
      throw new Error(
        `openai: fetch failed (${err instanceof Error ? err.message : String(err)})`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const bodyText = await safeReadText(resp);
      throw new Error(`openai: HTTP ${resp.status} ${resp.statusText} — ${truncate(bodyText, 500)}`);
    }

    const parsed = (await resp.json()) as OpenAIChatResponse;
    const choice = parsed.choices?.[0];
    const content = choice?.message?.content ?? '';
    if (!content) {
      throw new Error('openai: empty message content');
    }

    let jsonValue: unknown;
    try {
      jsonValue = JSON.parse(content);
    } catch {
      throw new Error(`openai: response was not valid JSON: ${truncate(content, 300)}`);
    }

    const wrapper: AIOutputWrapper = {
      kind: 'ai',
      value: jsonValue,
      _meta: {
        provider: 'openai',
        model: parsed.model ?? model,
        openai_request_id: parsed.id ?? null,
        finish_reason: choice?.finish_reason ?? null,
        usage: {
          prompt_tokens: parsed.usage?.prompt_tokens ?? null,
          completion_tokens: parsed.usage?.completion_tokens ?? null,
          total_tokens: parsed.usage?.total_tokens ?? null,
        },
        cost_cents_estimate: estimateCostCents(
          parsed.model ?? model,
          parsed.usage?.prompt_tokens ?? null,
          parsed.usage?.completion_tokens ?? null,
        ),
        latency_ms: Date.now() - startedAt,
      },
    };

    return { handled: true, output: wrapper as unknown as TOutput };
  },
};

// ---------------------------------------------------------------------------
// Input extraction & prompts
// ---------------------------------------------------------------------------

function extractInputText(taskType: AITaskType, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const rec = input as Record<string, unknown>;
  const text = rec.text;
  if (typeof text === 'string') return text;
  if (taskType === 'structure_extract' && typeof rec.raw === 'string') {
    return rec.raw as string;
  }
  // Packet 26 §3d — translation callers pass the source text on a
  // dedicated `source_text` field so the prompt can reference the
  // source language explicitly if provided.
  if (taskType === 'caption_translate' && typeof rec.source_text === 'string') {
    return rec.source_text as string;
  }
  if (
    taskType === 'social_video_recipe_extract' &&
    typeof rec.evidence_text === 'string'
  ) {
    return rec.evidence_text as string;
  }
  return null;
}

function truncateForInput(text: string, config?: AIModelConfig): string {
  // Token caps in ai_model_configs are soft limits; we enforce a
  // character cap here as a conservative proxy so a paste bomb can't
  // send an oversized request. The rule of thumb is ~4 chars per
  // token.
  const maxInputTokens = config?.max_input_tokens && config.max_input_tokens > 0
    ? config.max_input_tokens
    : null;
  const cap = maxInputTokens ? Math.max(2000, maxInputTokens * 4) : DEFAULT_MAX_INPUT_CHARS;
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n[TRUNCATED: input exceeded ${cap} characters]`;
}

function timeoutForTask(taskType: AITaskType): number {
  if (taskType === 'social_video_recipe_extract') return SOCIAL_RECIPE_EXTRACT_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

function buildMessages(taskType: AITaskType, inputText: string): ChatMessage[] {
  const system = systemPromptFor(taskType);
  return [
    { role: 'system', content: system },
    { role: 'user', content: inputText },
  ];
}

function systemPromptFor(taskType: AITaskType): string {
  switch (taskType) {
    case 'recipe_normalize':
      return [
        'You normalize recipe text into clean, structured prose.',
        'Rules:',
        '- Do not invent ingredients, quantities, or steps.',
        '- Preserve the original language.',
        '- Return JSON matching: {"title"?: string|null, "text": string, "notes"?: string|null}.',
        '- "text" must contain the cleaned recipe with one ingredient per line under a clear "Ingredients:" heading and one step per numbered line under "Instructions:".',
        '- If input is ambiguous, leave it as-is rather than guessing.',
        'Return ONLY the JSON object, no commentary.',
      ].join('\n');
    case 'menu_normalize':
      return [
        'You normalize restaurant menu text for parsing.',
        'Rules:',
        '- Do not invent dishes or prices.',
        '- Preserve section headings (e.g., "Starters", "Mains", "Drinks").',
        '- Return JSON matching: {"restaurant_name"?: string|null, "text": string, "notes"?: string|null}.',
        '- "text" must contain the cleaned menu with one dish per line grouped under section headings.',
        'Return ONLY the JSON object, no commentary.',
      ].join('\n');
    case 'structure_extract':
      return [
        'You extract coarse section structure from messy copy.',
        'Rules:',
        '- Do not invent sections or lines.',
        '- Return JSON matching: {"sections": [{"heading"?: string|null, "lines": string[]}]}.',
        'Return ONLY the JSON object, no commentary.',
      ].join('\n');
    case 'caption_translate':
      return [
        'You translate short recipe/cooking video captions or transcripts to English.',
        'Rules:',
        '- Translate the entire input to natural, concise English.',
        '- Do not add content that is not present in the source.',
        '- Preserve line breaks, ingredient lists, and step numbering.',
        '- Do not add commentary, explanations, or "translator\'s notes".',
        '- If the input is already English, return it unchanged.',
        '- Return JSON matching: {"text": string, "source_language"?: string|null}.',
        '- "text" holds the translated body. "source_language" is the detected language code ("es", "fr", "it", etc.) or null.',
        'Return ONLY the JSON object, no commentary.',
      ].join('\n');
    case 'social_video_recipe_extract':
      return [
        'You are a social video recipe evidence extractor for Fine Diet.',
        'This is a new social evidence importer, not a recipe-header parser.',
        'You receive separated evidence blocks. Each block starts with SOURCE_ID, SOURCE_KIND, SOURCE_LABEL, PLATFORM, QUALITY, and TEXT.',
        'Your job is to recover only supported recipe or meal-planning claims from YouTube, TikTok, Instagram, or Facebook evidence.',
        'Classify content before creating recipe facts.',
        'Allowed content_type values: single_recipe, multi_recipe, meal_plan, what_i_eat_in_a_day, grocery_haul, restaurant_or_menu, supplement_or_product, not_food_related, unknown_or_insufficient.',
        'Rules:',
        '- Do not invent ingredients, quantities, servings, timing, steps, or titles.',
        '- Unknown quantities remain null with quantity_status "unknown"; vague phrases like "some", "splash", "handful", or "pinch" use quantity_status "vague" and preserve quantity_text.',
        '- Servings use status "stated" only when directly stated, "inferred" only when clearly implied, otherwise "unknown".',
        '- Every ingredient and step must include at least one evidence_refs entry using an exact SOURCE_ID from the input.',
        '- If evidence conflicts, add a conflicting_evidence review item instead of choosing silently.',
        '- Grocery hauls, restaurant/menu/eat-out content, supplements/products, not-food, and insufficient evidence must not be forced into recipe drafts.',
        '- Prefer concise natural instructions, but keep uncertainty visible through confidence and review_items.',
        'Return ONLY JSON matching this exact top-level shape:',
        '{"version":"social-recipe-evidence-importer-v1","content_type":"single_recipe|multi_recipe|meal_plan|what_i_eat_in_a_day|grocery_haul|restaurant_or_menu|supplement_or_product|not_food_related|unknown_or_insufficient","title":{"value":string|null,"confidence":"high|medium|low","evidence_refs":[{"evidence_source_id":string,"quote":string|null}]},"summary":string|null,"recipes":[{"title":{"value":string|null,"confidence":"high|medium|low","evidence_refs":[{"evidence_source_id":string,"quote":string|null}]},"description":{"value":string|null,"confidence":"high|medium|low","evidence_refs":[{"evidence_source_id":string,"quote":string|null}]},"servings":{"value":number|null,"confidence":"high|medium|low","evidence_refs":[{"evidence_source_id":string,"quote":string|null}],"status":"stated|inferred|unknown","text":string|null},"ingredients":[{"name":string,"quantity":number|null,"unit":string|null,"quantity_text":string|null,"quantity_status":"stated|vague|inferred|unknown","preparation_note":string|null,"confidence":"high|medium|low","evidence_refs":[{"evidence_source_id":string,"quote":string|null}]}],"steps":[{"order":number,"instruction":string,"timing_text":string|null,"confidence":"high|medium|low","evidence_refs":[{"evidence_source_id":string,"quote":string|null}]}],"review_items":[{"code":"missing_quantity|vague_quantity|missing_servings|unclear_step_order|conflicting_evidence|insufficient_evidence|unsupported_content_type|unsupported_platform|needs_user_assisted_text","severity":"info|warning|blocker","message":string,"evidence_refs":[{"evidence_source_id":string,"quote":string|null}]}]}],"meal_plan_items":[{"label":string,"description":string|null,"evidence_refs":[{"evidence_source_id":string,"quote":string|null}],"confidence":"high|medium|low"}],"review_items":[{"code":"missing_quantity|vague_quantity|missing_servings|unclear_step_order|conflicting_evidence|insufficient_evidence|unsupported_content_type|unsupported_platform|needs_user_assisted_text","severity":"info|warning|blocker","message":string,"evidence_refs":[{"evidence_source_id":string,"quote":string|null}]}],"warnings":[string]}',
      ].join('\n');
    default:
      return 'Return a JSON object describing the input.';
  }
}

// ---------------------------------------------------------------------------
// Cost estimation (gpt-4o-mini pricing, April 2025)
// Pricing: $0.15 / 1M input tokens, $0.60 / 1M output tokens.
// 1 cent = $0.01 → input 0.015 cents / 1k tokens, output 0.060 cents / 1k tokens.
// For unknown models we skip the estimate; admins can extend this table later.
// ---------------------------------------------------------------------------

const COST_TABLE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

function estimateCostCents(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const rate = COST_TABLE_USD_PER_MTOK[model];
  if (!rate) return null;
  const pIn = typeof promptTokens === 'number' ? promptTokens : 0;
  const pOut = typeof completionTokens === 'number' ? completionTokens : 0;
  const usd = (pIn * rate.input + pOut * rate.output) / 1_000_000;
  return Math.round(usd * 100);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Self-registration — mirror the stub adapter's module-load pattern so
// any server-side code that imports the runtime picks this up.
// ---------------------------------------------------------------------------

registerProviderAdapter(openaiAdapter);
