/**
 * Plans Phase 20 — Vimeo transcript adapter.
 *
 * Two-stage, best-effort acquisition:
 *   1. `https://player.vimeo.com/video/<id>/config` — a public config
 *      JSON that lists any `text_tracks` (captions / subtitles) with
 *      a fetchable `.url` pointing at WebVTT. When present we fetch
 *      the first track and convert the cues into plain text.
 *   2. If no text tracks are available, fall back to
 *      `https://vimeo.com/api/oembed.json?url=<vimeo_url>` and use
 *      the video's `description` (or `title`) as the acquired text.
 *      Recipe/cooking creators on Vimeo often paste their ingredient
 *      lists directly into the description, so this is a useful
 *      pragmatic fallback.
 *
 * All failures resolve (never throw). Unsupported or empty results
 * surface as `unavailable` so the caller degrades to manual_review
 * with the URL preserved.
 */

import { registerPlatformAdapter, type PlatformTranscriptAdapter } from '../adapterRegistry';
import type {
  TranscriptAcquisitionOutcome,
  TranscriptSource,
  VideoUrlClassification,
} from '../types';

const MAX_TRANSCRIPT_CHARS = 40_000;

interface VimeoPlayerConfigResponse {
  video?: {
    title?: string | null;
    description?: string | null;
  };
  request?: {
    text_tracks?: Array<{
      id?: number;
      lang?: string | null;
      kind?: string | null;
      label?: string | null;
      url?: string | null;
    }>;
  };
}

interface VimeoOEmbedResponse {
  title?: string | null;
  description?: string | null;
  author_name?: string | null;
  html?: string | null;
}

export const vimeoAdapter: PlatformTranscriptAdapter = {
  platform: 'vimeo',

  supports(classification) {
    return classification.platform === 'vimeo' && !!classification.video_id;
  },

  async acquire(classification, opts) {
    const startedAt = Date.now();
    const videoId = classification.video_id;
    const canonicalUrl =
      classification.canonical_url ?? (videoId ? `https://vimeo.com/${videoId}` : null);

    if (!videoId) {
      return {
        status: 'unsupported_platform',
        platform: 'vimeo',
        video_id: null,
        transcript: null,
        transcript_chars: 0,
        language: null,
        source: 'unknown',
        latency_ms: Date.now() - startedAt,
        error_text: 'Vimeo URL did not contain a recognizable numeric video id.',
      };
    }

    // Attempt 1: player config + WebVTT text tracks
    const trackOutcome = await tryPlayerTextTracks(videoId, opts.timeoutMs);
    if (trackOutcome) {
      return { ...trackOutcome, latency_ms: Date.now() - startedAt };
    }

    // Attempt 2: oEmbed description fallback
    if (canonicalUrl) {
      const oembedOutcome = await tryOEmbedDescription(
        videoId,
        canonicalUrl,
        opts.timeoutMs,
      );
      if (oembedOutcome) {
        return { ...oembedOutcome, latency_ms: Date.now() - startedAt };
      }
    }

    return {
      status: 'unavailable',
      platform: 'vimeo',
      video_id: videoId,
      transcript: null,
      transcript_chars: 0,
      language: null,
      source: 'unknown',
      latency_ms: Date.now() - startedAt,
      error_text: 'Vimeo had neither captions nor a usable description for this video.',
    };
  },
};

registerPlatformAdapter(vimeoAdapter);

// ---------------------------------------------------------------------------
// Attempt 1 — WebVTT captions via player.vimeo.com config
// ---------------------------------------------------------------------------

async function tryPlayerTextTracks(
  videoId: string,
  timeoutMs: number,
): Promise<Omit<TranscriptAcquisitionOutcome, 'latency_ms'> | null> {
  const configUrl = `https://player.vimeo.com/video/${encodeURIComponent(videoId)}/config`;

  let config: VimeoPlayerConfigResponse | null = null;
  try {
    const resp = await timedFetch(configUrl, timeoutMs, {
      Accept: 'application/json, */*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (compatible; FineDiet/1.0; +https://finediet.app)',
    });
    if (!resp.ok) return null;
    config = (await resp.json()) as VimeoPlayerConfigResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'fetch_failed',
      platform: 'vimeo',
      video_id: videoId,
      transcript: null,
      transcript_chars: 0,
      language: null,
      source: 'vimeo_text_track',
      error_text: `vimeo_player_config: ${msg}`,
    };
  }

  const tracks = config?.request?.text_tracks ?? [];
  if (tracks.length === 0) return null;

  const preferred =
    tracks.find((t) => (t.lang ?? '').toLowerCase().startsWith('en')) ?? tracks[0];
  const trackUrl = preferred?.url ? absolutizeVimeoUrl(preferred.url) : null;
  if (!trackUrl) return null;

  try {
    const resp = await timedFetch(trackUrl, timeoutMs, {
      Accept: 'text/vtt, text/plain, */*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (compatible; FineDiet/1.0; +https://finediet.app)',
    });
    if (!resp.ok) return null;
    const body = await resp.text();
    if (!body || body.trim().length === 0) return null;

    const transcript = parseWebVtt(body).slice(0, MAX_TRANSCRIPT_CHARS);
    if (!transcript || transcript.trim().length === 0) return null;

    return {
      status: 'acquired',
      platform: 'vimeo',
      video_id: videoId,
      transcript,
      transcript_chars: transcript.length,
      language: preferred?.lang ?? null,
      source: 'vimeo_text_track',
      error_text: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'fetch_failed',
      platform: 'vimeo',
      video_id: videoId,
      transcript: null,
      transcript_chars: 0,
      language: null,
      source: 'vimeo_text_track',
      error_text: `vimeo_text_track: ${msg}`,
    };
  }
}

function absolutizeVimeoUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://player.vimeo.com${url}`;
  return url;
}

// ---------------------------------------------------------------------------
// Attempt 2 — oEmbed description fallback
// ---------------------------------------------------------------------------

async function tryOEmbedDescription(
  videoId: string,
  canonicalUrl: string,
  timeoutMs: number,
): Promise<Omit<TranscriptAcquisitionOutcome, 'latency_ms'> | null> {
  const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonicalUrl)}`;
  let data: VimeoOEmbedResponse | null = null;
  try {
    const resp = await timedFetch(oembedUrl, timeoutMs, {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (compatible; FineDiet/1.0; +https://finediet.app)',
    });
    if (!resp.ok) return null;
    data = (await resp.json()) as VimeoOEmbedResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'fetch_failed',
      platform: 'vimeo',
      video_id: videoId,
      transcript: null,
      transcript_chars: 0,
      language: null,
      source: 'vimeo_oembed_description',
      error_text: `vimeo_oembed: ${msg}`,
    };
  }

  const description = (data?.description ?? '').trim();
  const title = (data?.title ?? '').trim();

  const composed = composeOEmbedText(title, description, data?.author_name ?? null);
  if (!composed || composed.trim().length === 0) return null;

  return {
    status: 'acquired',
    platform: 'vimeo',
    video_id: videoId,
    transcript: composed.slice(0, MAX_TRANSCRIPT_CHARS),
    transcript_chars: Math.min(composed.length, MAX_TRANSCRIPT_CHARS),
    language: null,
    source: 'vimeo_oembed_description',
    error_text: null,
  };
}

function composeOEmbedText(
  title: string,
  description: string,
  authorName: string | null,
): string {
  const lines: string[] = [];
  if (title.length > 0) lines.push(title);
  if (authorName && authorName.length > 0) lines.push(`by ${authorName}`);
  if (description.length > 0) {
    lines.push('');
    lines.push(description);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// WebVTT → plain text
// ---------------------------------------------------------------------------

/**
 * Parse a WebVTT file into newline-joined cue text. Strips cue
 * numbering, timestamps, and inline tags; collapses whitespace.
 */
function parseWebVtt(vtt: string): string {
  const normalized = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\n+/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // Skip WEBVTT header and NOTE / STYLE blocks.
    if (/^WEBVTT/i.test(trimmed)) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(trimmed)) continue;

    const lines = trimmed.split('\n');
    const cueLines: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // Timestamp line or cue identifier — skip.
      if (/-->/.test(line)) continue;
      if (/^\d+$/.test(line)) continue;
      cueLines.push(stripCueTags(line));
    }
    const joined = cueLines.join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 0) out.push(joined);
  }

  return dedupeConsecutive(out).join('\n');
}

function stripCueTags(line: string): string {
  return line.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ');
}

/**
 * WebVTT cues often overlap when captions fade — strip trivially
 * duplicated consecutive lines so the transcript reads cleanly.
 */
function dedupeConsecutive(lines: string[]): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (const line of lines) {
    if (line === prev) continue;
    out.push(line);
    prev = line;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function timedFetch(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method: 'GET', headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
