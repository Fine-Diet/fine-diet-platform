/**
 * Plans Phase 23 — OpenAI vision-backed on-screen text extractor.
 *
 * First real OCR/vision provider for the Packet 22 on-screen assist
 * layer. Registers into the extractor registry as `openai_vision`
 * and runs ahead of the default `noop` extractor so a successful
 * automated read wins over "unavailable".
 *
 * Governance (§4a, §4c):
 *   - Policy-driven enable/disable via `resolveTaskRoute('onscreen_text_extract')`.
 *     Declines cleanly when the preferred model config is null,
 *     not `openai`, or `enabled=false`.
 *   - Declines when `OPENAI_API_KEY` is missing in the server env.
 *   - Every path keeps the Packet 22 fallback intact: if extraction
 *     returns nothing useful, the service moves on to the next
 *     extractor (noop declines) and the route degrades to the
 *     transcript/user-assisted text it already had, or manual review.
 *
 * Scope (§9):
 *   - Supports YouTube and Vimeo classifications only; these are the
 *     two platforms where we can reliably pull a representative
 *     still from public endpoints without authenticated API calls.
 *   - Sends a single frame with `detail: 'low'` to keep cost/latency
 *     bounded (~2833 image tokens + small prompt; gpt-4o-mini pricing
 *     puts a call at well under 1¢).
 *   - JSON-only response with a narrow schema (`{ visible_text:
 *     string, confidence: "low"|"medium"|"high" }`).
 *
 * Trust (§5, §3c):
 *   - Never authoritative. The returned text routes through the
 *     same Packet 22 `mergeOnscreenIntoBase` + Packet 17 normalization
 *     path; on-screen text still cannot create trusted food objects.
 *   - `extractor_key='openai_vision'` and `source='extractor'` on the
 *     outcome + draft so reviewers always know the provenance.
 */

import { registerOnscreenExtractor } from '../extractorRegistry';
import type {
  OnscreenExtractor,
  OnscreenExtractorInput,
  OnscreenTextOutcome,
} from '../types';
import { resolveTaskRoute } from '@/lib/ai/runtime/aiConfigServerService';
import type { VideoUrlClassification } from '@/lib/plans/videoTranscript/types';

const EXTRACTOR_KEY = 'openai_vision';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_CHAT_TIMEOUT_MS = 18_000;
const DEFAULT_THUMB_TIMEOUT_MS = 6_000;
const MAX_OUTPUT_TOKENS = 600;
const MIN_USEFUL_CHARS = 10;
const MAX_OUTPUT_CHARS = 20_000;

interface VisionJsonResponse {
  visible_text?: string | null;
  confidence?: 'low' | 'medium' | 'high' | string | null;
}

interface OpenAIVisionChatResponse {
  id?: string;
  model?: string;
  choices: Array<{
    message: { content: string | null };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export const openaiVisionExtractor: OnscreenExtractor = {
  key: EXTRACTOR_KEY,

  supports(classification: VideoUrlClassification) {
    if (classification.platform === 'youtube' && classification.video_id) {
      return true;
    }
    if (classification.platform === 'vimeo' && classification.video_id) {
      return true;
    }
    return false;
  },

  async extract(input: OnscreenExtractorInput): Promise<OnscreenTextOutcome> {
    const startedAt = Date.now();

    // ---- 1. Governance gate ------------------------------------------------
    let route: Awaited<ReturnType<typeof resolveTaskRoute>>;
    try {
      route = await resolveTaskRoute('onscreen_text_extract');
    } catch (err) {
      return declineUnavailable(
        startedAt,
        `policy lookup failed: ${errMsg(err)}`,
      );
    }
    const preferred = route.preferred;
    if (
      !preferred ||
      !preferred.enabled ||
      preferred.provider_key !== 'openai'
    ) {
      return declineUnavailable(
        startedAt,
        'openai_vision not enabled in ai_task_policies',
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      return declineUnavailable(startedAt, 'OPENAI_API_KEY missing');
    }

    const modelKey =
      preferred.model_key && preferred.model_key.trim().length > 0
        ? preferred.model_key.trim()
        : DEFAULT_MODEL;

    // ---- 2. Frame acquisition ---------------------------------------------
    const thumbUrl = await resolveThumbnailUrl(input.classification);
    if (!thumbUrl) {
      return {
        status: 'unavailable',
        text: null,
        chars: 0,
        source: 'extractor',
        extractor_key: EXTRACTOR_KEY,
        latency_ms: Date.now() - startedAt,
        error_text: 'thumbnail unavailable',
        provider_key: 'openai',
        model_key: modelKey,
        cost_cents_estimate: null,
      };
    }

    // ---- 3. Vision call ---------------------------------------------------
    const baseUrl = (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
    const timeoutMs = Math.min(
      input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_CHAT_TIMEOUT_MS,
      DEFAULT_CHAT_TIMEOUT_MS,
    );

    let chatResp: OpenAIVisionChatResponse;
    try {
      chatResp = await callVisionChat({
        baseUrl,
        apiKey,
        modelKey,
        thumbUrl,
        timeoutMs,
      });
    } catch (err) {
      return {
        status: 'fetch_failed',
        text: null,
        chars: 0,
        source: 'extractor',
        extractor_key: EXTRACTOR_KEY,
        latency_ms: Date.now() - startedAt,
        error_text: `openai_vision: ${errMsg(err)}`,
        provider_key: 'openai',
        model_key: modelKey,
        cost_cents_estimate: null,
      };
    }

    const choice = chatResp.choices?.[0];
    const raw = choice?.message?.content ?? '';
    let parsed: VisionJsonResponse | null = null;
    if (raw && raw.trim().length > 0) {
      try {
        parsed = JSON.parse(raw) as VisionJsonResponse;
      } catch {
        parsed = null;
      }
    }

    const costCents = estimateCostCents(
      chatResp.model ?? modelKey,
      chatResp.usage?.prompt_tokens ?? null,
      chatResp.usage?.completion_tokens ?? null,
    );

    const visibleText = (parsed?.visible_text ?? '').toString().trim();
    const confidence = normalizeConfidence(parsed?.confidence ?? null);

    if (
      !parsed ||
      visibleText.length === 0 ||
      confidence === 'low' ||
      visibleText.length < MIN_USEFUL_CHARS
    ) {
      return {
        status: 'insufficient',
        text: null,
        chars: visibleText.length,
        source: 'extractor',
        extractor_key: EXTRACTOR_KEY,
        latency_ms: Date.now() - startedAt,
        error_text:
          visibleText.length === 0
            ? 'no visible text returned'
            : `below quality threshold (confidence=${confidence ?? 'unknown'}, chars=${visibleText.length})`,
        provider_key: 'openai',
        model_key: chatResp.model ?? modelKey,
        cost_cents_estimate: costCents,
      };
    }

    const capped = visibleText.slice(0, MAX_OUTPUT_CHARS);

    return {
      status: 'acquired',
      text: capped,
      chars: capped.length,
      source: 'extractor',
      extractor_key: EXTRACTOR_KEY,
      latency_ms: Date.now() - startedAt,
      error_text: null,
      provider_key: 'openai',
      model_key: chatResp.model ?? modelKey,
      cost_cents_estimate: costCents,
    };
  },
};

registerOnscreenExtractor(openaiVisionExtractor);

// ---------------------------------------------------------------------------
// Frame acquisition
// ---------------------------------------------------------------------------

async function resolveThumbnailUrl(
  classification: VideoUrlClassification,
): Promise<string | null> {
  if (classification.platform === 'youtube' && classification.video_id) {
    // Public YouTube thumbnails are CDN-served and don't require auth.
    // `maxresdefault` is ideal but not always present; `hqdefault` is
    // guaranteed. We return maxres first; OpenAI's fetcher gracefully
    // handles the redirect to hqdefault when maxres is missing.
    return `https://i.ytimg.com/vi/${encodeURIComponent(classification.video_id)}/hqdefault.jpg`;
  }
  if (classification.platform === 'vimeo' && classification.video_id) {
    const canonical =
      classification.canonical_url ??
      `https://vimeo.com/${encodeURIComponent(classification.video_id)}`;
    return await fetchVimeoThumbnail(canonical);
  }
  return null;
}

async function fetchVimeoThumbnail(canonicalUrl: string): Promise<string | null> {
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonicalUrl)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_THUMB_TIMEOUT_MS);
  try {
    const resp = await fetch(oembedUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (compatible; FineDiet/1.0; +https://finediet.app)',
      },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { thumbnail_url?: string | null };
    const t = (data?.thumbnail_url ?? '').trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// OpenAI vision chat call
// ---------------------------------------------------------------------------

async function callVisionChat(args: {
  baseUrl: string;
  apiKey: string;
  modelKey: string;
  thumbUrl: string;
  timeoutMs: number;
}): Promise<OpenAIVisionChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const resp = await fetch(`${args.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.modelKey,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract any visible on-screen text from this still. Return ONLY the JSON object described above.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: args.thumbUrl,
                  detail: 'low',
                },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await safeReadText(resp);
      throw new Error(
        `HTTP ${resp.status} ${resp.statusText} — ${truncate(body, 400)}`,
      );
    }
    return (await resp.json()) as OpenAIVisionChatResponse;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(`request timed out after ${args.timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(): string {
  return [
    'You are an OCR-only assistant for recipe videos. Read visible on-screen text from a single video still.',
    'Rules:',
    '- Transcribe only the text that is actually visible on the image.',
    '- Do NOT invent ingredients, quantities, brand names, or steps.',
    '- Do NOT summarize or reinterpret; output verbatim visible text.',
    '- If multiple overlays are visible, separate them with line breaks in reading order.',
    '- If no recipe-relevant text is visible, return an empty string.',
    '- Rate confidence "low" when text is blurry, partial, motion-smeared, or mostly unrelated (intros, watermarks, social handles, subscribe banners).',
    'Return ONLY a JSON object matching this exact schema:',
    '{"visible_text": string, "confidence": "low" | "medium" | "high"}',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Cost estimate — mirrors lib/ai/runtime/adapters/openaiAdapter.ts table.
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

function normalizeConfidence(
  raw: string | null,
): 'low' | 'medium' | 'high' | null {
  if (!raw) return null;
  const v = raw.toString().toLowerCase().trim();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return null;
}

function declineUnavailable(
  startedAt: number,
  reason: string,
): OnscreenTextOutcome {
  return {
    status: 'unavailable',
    text: null,
    chars: 0,
    source: 'none',
    extractor_key: EXTRACTOR_KEY,
    latency_ms: Date.now() - startedAt,
    error_text: reason,
    provider_key: null,
    model_key: null,
    cost_cents_estimate: null,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
