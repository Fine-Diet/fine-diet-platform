/**
 * Plans Phase 19 / 20 — Video transcript / caption acquisition service.
 *
 * Acquisition layer for the import-recipe flow. Classifies a pasted
 * URL into a known video platform and dispatches to the matching
 * platform adapter (see `adapters/`). Adapters register themselves
 * at module load so adding a new platform is additive:
 *
 *   1. Add a new adapter file under `adapters/<platform>Adapter.ts`
 *      that implements `PlatformTranscriptAdapter` and calls
 *      `registerPlatformAdapter(...)` at the bottom of the file.
 *   2. Import that file from this module for its side-effect.
 *   3. Extend `classifyVideoUrl` to recognize the platform's URL
 *      shape.
 *
 * Guarantees:
 *   - Never throws. Every outcome is a typed `TranscriptAcquisitionOutcome`.
 *   - Adapter logic is isolated; feature code (the import-recipe
 *     route) only talks to this module.
 *   - When no adapter can acquire a transcript for a supported
 *     platform, the caller must degrade to a manual_review draft
 *     with the URL preserved (done in the route).
 */

import { getPlatformAdapter } from './adapterRegistry';
// Side-effect imports — register the platform adapters at module load.
import './adapters/youtubeAdapter';
import './adapters/vimeoAdapter';
import type {
  TranscriptAcquisitionOutcome,
  VideoPlatform,
  VideoUrlClassification,
} from './types';
import { runAITask } from '@/lib/ai/runtime/aiRuntimeServerService';
import type { AIResolvedRoute } from '@/lib/ai/runtime/types';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ASSISTED_TEXT_CHARS = 40_000;
/** Cap translation input at the same budget as on-device parsing. */
const MAX_TRANSLATION_INPUT_CHARS = 20_000;
/**
 * Packet 27 — when an external provider returns a short transcript
 * that's basically noise, we prefer the existing first-party outcome
 * over swapping it in. This threshold matches the "usable recipe
 * text" floor used in the on-screen assist merger.
 */
const EXTERNAL_PROVIDER_MIN_CHARS = 40;

/**
 * Packet 26 §3d — Translation context passed by the import route so
 * the acquisition layer can translate a non-English transcript
 * through the governed AI runtime. `personId` is required for the
 * `ai_runs` audit trail.
 *
 * Packet 27 reuses this same shape for the external-provider
 * fallback so a single `{ personId, planId }` can drive both
 * AI-runtime-backed steps.
 */
export interface TranslationCtx {
  personId: string;
  planId?: string | null;
}

/** Packet 27 — alias for the external provider fallback. Same shape. */
export type ExternalProviderCtx = TranslationCtx;

/**
 * Classify a pasted URL into a video platform + canonical video id
 * where possible. Returns `platform: 'unknown'` for things we don't
 * treat as videos.
 */
export function classifyVideoUrl(rawUrl: string): VideoUrlClassification {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { platform: 'unknown', video_id: null, canonical_url: null };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname;

  // YouTube ------------------------------------------------------------------
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = parsed.searchParams.get('v');
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return {
        platform: 'youtube',
        video_id: id,
        canonical_url: `https://www.youtube.com/watch?v=${id}`,
      };
    }
    const shortMatch = path.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (shortMatch) {
      return {
        platform: 'youtube',
        video_id: shortMatch[1],
        canonical_url: `https://www.youtube.com/watch?v=${shortMatch[1]}`,
      };
    }
    return { platform: 'youtube', video_id: null, canonical_url: parsed.toString() };
  }
  if (host === 'youtu.be') {
    const id = path.replace(/^\//, '').split('/')[0];
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return {
        platform: 'youtube',
        video_id: id,
        canonical_url: `https://www.youtube.com/watch?v=${id}`,
      };
    }
    return { platform: 'youtube', video_id: null, canonical_url: parsed.toString() };
  }

  // Vimeo --------------------------------------------------------------------
  if (host === 'vimeo.com') {
    // vimeo.com/<id> or vimeo.com/<id>/<hash> — the first numeric
    // segment is the video id.
    const seg = path.split('/').filter(Boolean);
    const id = seg.find((s) => /^\d{6,}$/.test(s)) ?? null;
    return {
      platform: 'vimeo',
      video_id: id,
      canonical_url: id ? `https://vimeo.com/${id}` : parsed.toString(),
    };
  }
  if (host === 'player.vimeo.com') {
    const match = path.match(/\/video\/(\d{6,})/);
    const id = match ? match[1] : null;
    return {
      platform: 'vimeo',
      video_id: id,
      canonical_url: id ? `https://vimeo.com/${id}` : parsed.toString(),
    };
  }

  // Recognized-but-not-yet-supported platforms -------------------------------
  if (host.endsWith('tiktok.com')) return platformOnly('tiktok', parsed);
  if (host.endsWith('instagram.com')) return platformOnly('instagram', parsed);
  if (host === 'facebook.com' || host === 'fb.watch')
    return platformOnly('facebook', parsed);

  return { platform: 'unknown', video_id: null, canonical_url: parsed.toString() };
}

function platformOnly(platform: VideoPlatform, url: URL): VideoUrlClassification {
  return { platform, video_id: null, canonical_url: url.toString() };
}

/**
 * Packet 21 — Build a `TranscriptAcquisitionOutcome` for the
 * user-assisted path: no network, no adapter, just a caller who
 * supplied caption/recipe text alongside a video URL. Returns
 * `status='user_assisted'` so audit tooling distinguishes this from
 * automatic acquisition. Trims and caps the supplied text.
 */
export function buildUserAssistedOutcome(args: {
  classification: VideoUrlClassification;
  assistedText: string;
}): TranscriptAcquisitionOutcome {
  const trimmed = args.assistedText.trim();
  const capped = trimmed.slice(0, MAX_ASSISTED_TEXT_CHARS);
  return {
    status: 'user_assisted',
    platform: args.classification.platform,
    video_id: args.classification.video_id,
    transcript: capped.length > 0 ? capped : null,
    transcript_chars: capped.length,
    language: null,
    source: 'user_assisted_caption',
    latency_ms: 0,
    error_text: null,
  };
}

/**
 * Acquire a transcript for a video URL. Always resolves; status
 * describes the outcome. Never throws.
 *
 * Dispatch rules:
 *   - `platform === 'unknown'`          → invalid_url
 *   - adapter registered + supports()   → adapter result
 *   - platform recognized, no adapter   → unsupported_platform
 */
export async function acquireVideoTranscript(
  rawUrl: string,
  opts: {
    timeoutMs?: number;
    /**
     * Packet 26 §3d — When provided and the adapter returns a
     * non-English transcript, the service calls the AI runtime's
     * `caption_translate` task to translate the text to English
     * before returning. Omitted for API clients that haven't wired
     * through a person context.
     */
    translationCtx?: TranslationCtx | null;
    /**
     * Packet 27 — When provided and the first-party adapter ladder
     * returned unavailable / fetch_failed / title-only / empty, the
     * service calls the AI runtime's `video_transcript_external`
     * task. A successful provider response swaps the outcome to
     * `acquired` with `source='external_provider'`; anything else
     * (disabled, declined, no key, provider-unavailable) leaves the
     * first-party outcome untouched so downstream UX stays exactly
     * where Packet 26 left it. Runs for `platform='youtube'` only
     * in V1 — other platforms pass through unchanged.
     */
    externalProviderCtx?: ExternalProviderCtx | null;
  } = {},
): Promise<TranscriptAcquisitionOutcome> {
  const startedAt = Date.now();
  const cls = classifyVideoUrl(rawUrl);

  if (cls.platform === 'unknown') {
    return {
      status: 'invalid_url',
      platform: cls.platform,
      video_id: null,
      transcript: null,
      transcript_chars: 0,
      language: null,
      source: 'unknown',
      latency_ms: Date.now() - startedAt,
      error_text: 'URL did not match a known video platform.',
      translated_from_language: null,
    };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const adapter = getPlatformAdapter(cls.platform);
  if (adapter && adapter.supports(cls)) {
    let outcome = await adapter.acquire(cls, { timeoutMs });
    // Normalise latency if the adapter didn't stamp it.
    if (!outcome.latency_ms || outcome.latency_ms <= 0) {
      outcome = { ...outcome, latency_ms: Date.now() - startedAt };
    }

    // Packet 27 — external provider fallback. Runs BEFORE translation
    // so the translation step sees whichever transcript ended up
    // winning (first-party or provider-recovered). Helper is a
    // no-op pass-through when the ctx is missing or the first-party
    // outcome is already satisfactory.
    if (opts.externalProviderCtx) {
      outcome = await tryExternalProviderFallback({
        outcome,
        classification: cls,
        rawUrl,
        ctx: opts.externalProviderCtx,
      });
    }

    // Packet 26 §3d — language-aware translation. Runs only when a
    // translation context was supplied, an actual transcript was
    // acquired, and the language hint is non-English. The helper
    // itself degrades gracefully: if the AI runtime is not routable
    // the original text flows through unchanged.
    if (
      opts.translationCtx &&
      outcome.status === 'acquired' &&
      typeof outcome.transcript === 'string' &&
      outcome.transcript.trim().length > 0 &&
      isNonEnglishLang(outcome.language)
    ) {
      return translateOutcomeIfNeeded(outcome, opts.translationCtx);
    }
    return outcome;
  }

  return {
    status: 'unsupported_platform',
    platform: cls.platform,
    video_id: cls.video_id,
    transcript: null,
    transcript_chars: 0,
    language: null,
    source: 'unknown',
    latency_ms: Date.now() - startedAt,
    error_text:
      cls.platform === 'youtube' || cls.platform === 'vimeo'
        ? `${cls.platform}: URL did not contain a recognizable video id.`
        : `Transcript acquisition is not wired for '${cls.platform}' in V1. Manual review is used instead.`,
    translated_from_language: null,
  };
}

// ---------------------------------------------------------------------------
// Packet 26 §3d — Language-aware translation path.
// ---------------------------------------------------------------------------

function isNonEnglishLang(lang: string | null | undefined): boolean {
  if (!lang) return false;
  return !/^en(?:[-_].*)?$/i.test(lang.trim());
}

interface CaptionTranslateOutput {
  kind?: 'ai';
  value?: unknown;
  text?: string | null;
  source_language?: string | null;
}

/**
 * Translate the outcome's transcript to English via the AI runtime.
 * Falls through to the original outcome when:
 *   - the runtime has no routable model for `caption_translate`
 *   - the provider returns nothing usable
 *   - an internal error occurs (never surfaces to the caller; we
 *     prefer the untranslated text over a blocked import)
 *
 * A successful translation swaps the transcript, sets `language` to
 * 'en', and stamps `translated_from_language` with the original
 * language code so the audit trail retains provenance.
 */
async function translateOutcomeIfNeeded(
  outcome: TranscriptAcquisitionOutcome,
  ctx: TranslationCtx,
): Promise<TranscriptAcquisitionOutcome> {
  if (!outcome.transcript) return outcome;
  const originalLanguage = outcome.language;
  const source_text = outcome.transcript.slice(0, MAX_TRANSLATION_INPUT_CHARS);

  try {
    const run = await runAITask<
      { source_text: string; source_language: string | null },
      CaptionTranslateOutput
    >({
      taskType: 'caption_translate',
      input: { source_text, source_language: originalLanguage ?? null },
      ctx: { personId: ctx.personId, planId: ctx.planId ?? null },
      execute: async (_route: AIResolvedRoute) => {
        // Unreachable in practice: the only registered provider
        // (openai) handles this task inline via the runtime's
        // adapter dispatch. Callers rely on the deterministic
        // fallback below when no adapter is available.
        return { text: null, source_language: originalLanguage ?? null };
      },
      deterministicFallback: async () => ({
        text: null,
        source_language: originalLanguage ?? null,
      }),
    });

    const translated = extractTranslatedText(run.output);
    if (!translated || translated.trim().length === 0) {
      return outcome;
    }

    const cappedTranslated = translated.slice(0, MAX_TRANSLATION_INPUT_CHARS);
    return {
      ...outcome,
      transcript: cappedTranslated,
      transcript_chars: cappedTranslated.length,
      language: 'en',
      translated_from_language: originalLanguage ?? null,
    };
  } catch (err) {
    // Non-fatal: keep the original non-English transcript rather
    // than blocking the import.
    console.warn(
      '[videoTranscript/translate] translation failed (non-fatal):',
      err,
    );
    return outcome;
  }
}

function extractTranslatedText(output: CaptionTranslateOutput): string | null {
  if (!output || typeof output !== 'object') return null;
  // Provider adapter wraps JSON in `{ kind: 'ai', value: {...} }`.
  if (output.kind === 'ai' && output.value && typeof output.value === 'object') {
    const inner = output.value as CaptionTranslateOutput;
    if (typeof inner.text === 'string') return inner.text;
  }
  if (typeof output.text === 'string') return output.text;
  return null;
}

// ---------------------------------------------------------------------------
// Packet 27 — External transcript provider fallback.
// ---------------------------------------------------------------------------

/**
 * Trigger rule for the external provider fallback. Intentionally
 * conservative: runs only for YouTube (Supadata supports YouTube in
 * V1) and only when the first-party ladder did not produce usable
 * recipe text. Callers outside this service should treat this as
 * internal — the `acquireVideoTranscript` wrapper decides when to
 * invoke it.
 */
function shouldTryExternalProvider(
  outcome: TranscriptAcquisitionOutcome,
): boolean {
  if (outcome.platform !== 'youtube') return false;

  if (outcome.status === 'unavailable' || outcome.status === 'fetch_failed') {
    return true;
  }
  // `acquired` but source is title-only — treat as insufficient.
  if (
    outcome.status === 'acquired' &&
    (outcome.source === 'youtube_title_only' ||
      !outcome.transcript ||
      outcome.transcript.trim().length < EXTERNAL_PROVIDER_MIN_CHARS)
  ) {
    return true;
  }
  return false;
}

interface VideoTranscriptExternalValue {
  transcript: string | null;
  language: string | null;
  available_languages?: string[];
  provider_unavailable?: boolean;
  provider_error?: string | null;
}

interface VideoTranscriptExternalWrapper {
  kind?: 'ai';
  value?: VideoTranscriptExternalValue | null;
}

/**
 * Try the AI-runtime-backed external transcript provider. Returns
 * the original outcome unchanged when:
 *   - the first-party outcome is already good enough
 *   - no provider is routable (no key / policy disabled / stub declines)
 *   - the provider returns no usable text
 *   - anything goes wrong internally (never blocks the import)
 *
 * A successful recovery swaps the outcome to `acquired` with
 * `source='external_provider'` and stamps the provider-reported
 * language. When the recovered text replaces a title-only outcome,
 * the original title stays available via `error_text` for the audit
 * row (the primary title already lives on the imported_meals row
 * as `title`, so we don't need a second carrier).
 */
async function tryExternalProviderFallback(args: {
  outcome: TranscriptAcquisitionOutcome;
  classification: VideoUrlClassification;
  rawUrl: string;
  ctx: ExternalProviderCtx;
}): Promise<TranscriptAcquisitionOutcome> {
  const { outcome, classification, rawUrl, ctx } = args;
  if (!shouldTryExternalProvider(outcome)) return outcome;

  const videoUrl = classification.canonical_url ?? rawUrl;

  try {
    const run = await runAITask<
      {
        video_url: string;
        video_id: string | null;
        platform: 'youtube';
        lang: string;
      },
      VideoTranscriptExternalWrapper
    >({
      taskType: 'video_transcript_external',
      input: {
        video_url: videoUrl,
        video_id: classification.video_id,
        platform: 'youtube',
        lang: 'en',
      },
      ctx: { personId: ctx.personId, planId: ctx.planId ?? null },
      execute: async (_route: AIResolvedRoute) => {
        // Unreachable in practice: the only registered provider for
        // this task is Supadata which handles it inline. Deterministic
        // fallback below returns a declined wrapper so the caller
        // stays on the first-party outcome.
        return {
          kind: 'ai',
          value: {
            transcript: null,
            language: null,
            available_languages: [],
            provider_unavailable: true,
            provider_error: 'execute-fallback',
          },
        };
      },
      deterministicFallback: async () => ({
        kind: 'ai',
        value: {
          transcript: null,
          language: null,
          available_languages: [],
          provider_unavailable: true,
          provider_error: 'deterministic-decline',
        },
      }),
    });

    const recovered = extractExternalProviderValue(run.output);
    if (
      !recovered ||
      !recovered.transcript ||
      recovered.transcript.trim().length < EXTERNAL_PROVIDER_MIN_CHARS
    ) {
      return outcome;
    }

    const cleaned = recovered.transcript.trim();
    return {
      status: 'acquired',
      platform: outcome.platform,
      video_id: outcome.video_id ?? classification.video_id,
      transcript: cleaned,
      transcript_chars: cleaned.length,
      language: recovered.language ?? outcome.language ?? null,
      source: 'external_provider',
      latency_ms: outcome.latency_ms,
      error_text: null,
      translated_from_language: null,
    };
  } catch (err) {
    // Non-fatal: keep whatever the first-party path produced. A
    // failed run was already audited by the AI runtime.
    console.warn(
      '[videoTranscript/externalProvider] fallback failed (non-fatal):',
      err,
    );
    return outcome;
  }
}

function extractExternalProviderValue(
  output: VideoTranscriptExternalWrapper | null | undefined,
): VideoTranscriptExternalValue | null {
  if (!output || typeof output !== 'object') return null;
  if (output.kind === 'ai' && output.value && typeof output.value === 'object') {
    return output.value;
  }
  // Some deterministic paths may pass the value directly.
  const maybe = output as unknown as VideoTranscriptExternalValue;
  if (
    typeof maybe.transcript === 'string' ||
    maybe.transcript === null ||
    typeof maybe.language === 'string' ||
    maybe.language === null
  ) {
    return maybe;
  }
  return null;
}
