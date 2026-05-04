/**
 * Plans Phase 27 — External transcript provider adapter (Supadata).
 *
 * Activated ONLY for the `video_transcript_external` task type. This
 * adapter is the governed fallback introduced in Packet 27 for
 * videos where the first-party YouTube/Shorts ladder (captions,
 * description, title) could not recover usable recipe text.
 *
 * Design rules (locked by Packet 27):
 *   - No vendor SDK. REST over native `fetch` so the runtime stays
 *     small and Vercel-deployable.
 *   - Auth via `SUPADATA_API_KEY`. When the key is missing the
 *     adapter soft-declines (`handled: false`) and the runtime
 *     routes to the fallback model (stub:deterministic), which the
 *     caller wires to a decline. This mirrors the Packet 18 OpenAI
 *     rollout posture: integration is wired, providers stay
 *     disabled-by-default until an operator flips it on.
 *   - Hard network / HTTP / parse failures throw so the runtime
 *     records a failed `ai_runs` row and attempts fallback.
 *   - Non-fatal provider responses (provider says "no transcript
 *     available for this video") return `handled: true` with a
 *     null transcript so the caller can decide to degrade cleanly
 *     instead of re-running the chain.
 *
 * Provider shape (2026-04 Supadata docs):
 *   GET https://api.supadata.ai/v1/youtube/transcript
 *     ?url=<video_url>&text=true&lang=en
 *   Headers: x-api-key: <SUPADATA_API_KEY>
 *   Success: { content: string, lang: string|null, available_langs: string[] }
 *   Error:   { error: string, message: string }
 *
 * If Supadata is later swapped for a different provider, only this
 * file changes. Feature code calls the runtime's `video_transcript_
 * external` task type, not Supadata directly.
 */

import type {
  AIProviderAdapter,
  AIProviderExecuteArgs,
  AIProviderExecuteResult,
} from '../providerAdapter';
import { registerProviderAdapter } from '../providerAdapter';
import type { AITaskType } from '../types';

const DEFAULT_BASE_URL = 'https://api.supadata.ai/v1';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TRANSCRIPT_CHARS = 40_000;

const SUPPORTED_TASK_TYPES: ReadonlySet<AITaskType> = new Set<AITaskType>([
  'video_transcript_external',
]);

/**
 * Caller-provided input for the `video_transcript_external` task.
 * `video_url` is required; the adapter passes it to the provider
 * which handles YouTube URL parsing on its end. `video_id` and
 * `platform` are optional context for the audit trail.
 */
export interface VideoTranscriptExternalInput {
  video_url: string;
  video_id?: string | null;
  platform?: 'youtube' | 'vimeo' | 'tiktok' | 'instagram' | 'facebook' | 'unknown' | null;
  /**
   * Language hint for the provider. Defaults to 'en' so the
   * translation step from Packet 26 does not have to re-translate.
   */
  lang?: string | null;
}

/**
 * Wrapped output shape the runtime returns to the caller. Mirrors
 * the OpenAI adapter's `{ kind: 'ai', value, _meta }` contract so
 * downstream code can parse transcripts uniformly.
 */
export interface VideoTranscriptExternalOutput {
  kind: 'ai';
  value: {
    transcript: string | null;
    language: string | null;
    available_languages: string[];
    /**
     * `true` when the provider explicitly said no transcript is
     * available for this video. Distinct from null (we didn't
     * run) and from an empty string (provider returned nothing).
     */
    provider_unavailable: boolean;
    provider_error: string | null;
  };
  _meta: {
    provider: 'supadata';
    video_url: string;
    video_id: string | null;
    platform: string | null;
    http_status: number | null;
    latency_ms: number;
  };
}

export const supadataAdapter: AIProviderAdapter = {
  provider_key: 'supadata',

  supports(taskType) {
    return SUPPORTED_TASK_TYPES.has(taskType);
  },

  async execute<TInput, TOutput>(
    args: AIProviderExecuteArgs<TInput>,
  ): Promise<AIProviderExecuteResult<TOutput>> {
    if (!SUPPORTED_TASK_TYPES.has(args.taskType)) {
      return { handled: false };
    }

    const input = args.input as VideoTranscriptExternalInput | null;
    if (!input || typeof input.video_url !== 'string' || input.video_url.trim().length === 0) {
      return { handled: false };
    }

    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      // Config-visible soft decline: keep the no-key rollout posture
      // non-fatal, but record a clear provider_error instead of
      // falling through to the generic execute-fallback wrapper.
      const wrapper: VideoTranscriptExternalOutput = {
        kind: 'ai',
        value: {
          transcript: null,
          language: null,
          available_languages: [],
          provider_unavailable: true,
          provider_error: 'SUPADATA_API_KEY is not configured in this runtime.',
        },
        _meta: {
          provider: 'supadata',
          video_url: input.video_url,
          video_id: input.video_id ?? null,
          platform: input.platform ?? null,
          http_status: null,
          latency_ms: 0,
        },
      };
      return { handled: true, output: wrapper as unknown as TOutput };
    }

    const baseUrl = (process.env.SUPADATA_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
    const lang = input.lang && input.lang.trim().length > 0 ? input.lang.trim() : 'en';
    const qs = new URLSearchParams({
      url: input.video_url,
      text: 'true',
      lang,
    }).toString();
    const endpoint = `${baseUrl}/youtube/transcript?${qs}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const startedAt = Date.now();

    let resp: Response;
    try {
      resp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`supadata: request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw new Error(
        `supadata: fetch failed (${err instanceof Error ? err.message : String(err)})`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const latency_ms = Date.now() - startedAt;

    // A 200 with a body we can parse is the success path. Anything
    // that signals "provider cannot fetch this video" returns a
    // `handled:true` outcome with a null transcript so the caller can
    // degrade without re-running the provider ladder.
    if (!resp.ok) {
      const bodyText = await safeReadText(resp);
      // 404 / 422 typically means "transcript unavailable for this
      // video" — still a legitimate provider outcome, not a runtime
      // failure. Everything else (401/403/5xx) is a real infra issue
      // we surface so the run records as failed and the fallback can
      // try next time.
      if (resp.status === 404 || resp.status === 422) {
        const wrapper: VideoTranscriptExternalOutput = {
          kind: 'ai',
          value: {
            transcript: null,
            language: null,
            available_languages: [],
            provider_unavailable: true,
            provider_error: truncate(bodyText, 500) || `supadata HTTP ${resp.status}`,
          },
          _meta: {
            provider: 'supadata',
            video_url: input.video_url,
            video_id: input.video_id ?? null,
            platform: input.platform ?? null,
            http_status: resp.status,
            latency_ms,
          },
        };
        return { handled: true, output: wrapper as unknown as TOutput };
      }
      throw new Error(
        `supadata: HTTP ${resp.status} ${resp.statusText} — ${truncate(bodyText, 500)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await resp.json();
    } catch (err) {
      throw new Error(
        `supadata: invalid JSON response (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const body = parsed as {
      content?: unknown;
      lang?: unknown;
      available_langs?: unknown;
      error?: unknown;
      message?: unknown;
    };

    // Provider explicitly reports no transcript for this video.
    if (typeof body.error === 'string' && body.error.length > 0) {
      const wrapper: VideoTranscriptExternalOutput = {
        kind: 'ai',
        value: {
          transcript: null,
          language: null,
          available_languages: [],
          provider_unavailable: true,
          provider_error: typeof body.message === 'string' ? body.message : body.error,
        },
        _meta: {
          provider: 'supadata',
          video_url: input.video_url,
          video_id: input.video_id ?? null,
          platform: input.platform ?? null,
          http_status: resp.status,
          latency_ms,
        },
      };
      return { handled: true, output: wrapper as unknown as TOutput };
    }

    const content = typeof body.content === 'string' ? body.content : null;
    const language = typeof body.lang === 'string' ? body.lang : null;
    const availableLanguages = Array.isArray(body.available_langs)
      ? (body.available_langs.filter((s) => typeof s === 'string') as string[])
      : [];

    const transcript = content ? content.slice(0, MAX_TRANSCRIPT_CHARS) : null;

    const wrapper: VideoTranscriptExternalOutput = {
      kind: 'ai',
      value: {
        transcript,
        language,
        available_languages: availableLanguages,
        provider_unavailable: !transcript || transcript.trim().length === 0,
        provider_error: null,
      },
      _meta: {
        provider: 'supadata',
        video_url: input.video_url,
        video_id: input.video_id ?? null,
        platform: input.platform ?? null,
        http_status: resp.status,
        latency_ms,
      },
    };

    return { handled: true, output: wrapper as unknown as TOutput };
  },
};

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

registerProviderAdapter(supadataAdapter);
