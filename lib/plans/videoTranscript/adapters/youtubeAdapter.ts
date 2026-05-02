/**
 * Plans Phase 20 / 25 / 27 — YouTube + Shorts transcript adapter.
 *
 * Acquisition hierarchy:
 *   1. English caption tracks via `timedtext?lang=en` / `lang=en-US`.
 *   2. Auto-generated captions via `timedtext?lang=en&kind=asr` —
 *      covers most YouTube Shorts where only ASR tracks exist.
 *   3. Timedtext list discovery (`type=list`) to pick up any
 *      available language track when English is missing.
 *   4. Description fallback — scrape `videoDetails.shortDescription`
 *      (and `title`) from the watch/shorts HTML and surface that
 *      text as acquired. For many cooking Shorts, the description
 *      is the recipe.
 *   5. Packet 27 — Title-only fallback. Empirically, YouTube's
 *      anti-bot posture in 2026 returns HTTP 200 / 0 bytes for the
 *      unsigned timedtext endpoints, and signed `baseUrl`s pulled
 *      from the watch HTML return 0 bytes because the signature is
 *      bound to `ip=0.0.0.0`. Many Shorts also have an empty
 *      `shortDescription`. Rather than hard-failing the import in
 *      that case, we surface the video title (when present) as a
 *      distinct `youtube_title_only` acquisition so the user sees
 *      a seeded draft and an explicit prompt to paste the recipe
 *      body via the user-assist path (Packet 21).
 *
 * Every layer resolves rather than throws; a hard fetch failure
 * short-circuits to a `fetch_failed` outcome only after all layers
 * have been tried. An empty final outcome is `unavailable`.
 *
 * No API key is required. Requests use a desktop User-Agent and an
 * `AbortController` timeout per attempt so a stuck upstream cannot
 * stall the import route.
 */

import { registerPlatformAdapter, type PlatformTranscriptAdapter } from '../adapterRegistry';
import type {
  TranscriptAcquisitionOutcome,
  TranscriptSource,
} from '../types';

const MAX_TRANSCRIPT_CHARS = 40_000;
const MIN_DESCRIPTION_CHARS = 40;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export const youtubeAdapter: PlatformTranscriptAdapter = {
  platform: 'youtube',

  supports(classification) {
    return classification.platform === 'youtube' && !!classification.video_id;
  },

  async acquire(classification, opts) {
    const startedAt = Date.now();
    const videoId = classification.video_id;
    if (!videoId) {
      return {
        status: 'unsupported_platform',
        platform: 'youtube',
        video_id: null,
        transcript: null,
        transcript_chars: 0,
        language: null,
        source: 'youtube_timedtext',
        latency_ms: Date.now() - startedAt,
        error_text: 'YouTube URL did not contain a recognizable video id.',
      };
    }

    let fetchError: string | null = null;

    // --- Layer 1 & 2: English + ASR caption tracks ---
    const captionAttempts: Array<{
      url: string;
      lang: string;
      source: TranscriptSource;
    }> = [
      {
        url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
        lang: 'en',
        source: 'youtube_timedtext',
      },
      {
        url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US`,
        lang: 'en-US',
        source: 'youtube_timedtext',
      },
      {
        url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`,
        lang: 'en',
        source: 'youtube_timedtext_asr',
      },
      {
        url: `https://video.google.com/timedtext?v=${videoId}&lang=en`,
        lang: 'en',
        source: 'youtube_timedtext',
      },
    ];

    for (const attempt of captionAttempts) {
      const res = await safeFetchText(attempt.url, opts.timeoutMs);
      if (res.error) {
        fetchError = res.error;
        continue;
      }
      const body = res.body ?? '';
      if (!body || body.trim().length === 0) continue;

      const transcript = parseTimedtextXml(body).slice(0, MAX_TRANSCRIPT_CHARS);
      if (!transcript || transcript.trim().length === 0) continue;

      return {
        status: 'acquired',
        platform: 'youtube',
        video_id: videoId,
        transcript,
        transcript_chars: transcript.length,
        language: attempt.lang,
        source: attempt.source,
        latency_ms: Date.now() - startedAt,
        error_text: null,
      };
    }

    // --- Layer 3: timedtext list discovery ---
    const listOutcome = await tryTimedtextList(videoId, opts.timeoutMs);
    if (listOutcome.error) fetchError = listOutcome.error;
    if (listOutcome.transcript) {
      return {
        status: 'acquired',
        platform: 'youtube',
        video_id: videoId,
        transcript: listOutcome.transcript.slice(0, MAX_TRANSCRIPT_CHARS),
        transcript_chars: Math.min(
          listOutcome.transcript.length,
          MAX_TRANSCRIPT_CHARS,
        ),
        language: listOutcome.lang,
        source: 'youtube_timedtext',
        latency_ms: Date.now() - startedAt,
        error_text: null,
      };
    }

    // --- Layer 4: description fallback ---
    const desc = await tryWatchPageDescription(videoId, opts.timeoutMs);
    if (desc.error) fetchError = desc.error;
    if (desc.text && desc.text.trim().length >= MIN_DESCRIPTION_CHARS) {
      return {
        status: 'acquired',
        platform: 'youtube',
        video_id: videoId,
        transcript: desc.text.slice(0, MAX_TRANSCRIPT_CHARS),
        transcript_chars: Math.min(desc.text.length, MAX_TRANSCRIPT_CHARS),
        language: null,
        source: 'youtube_description',
        latency_ms: Date.now() - startedAt,
        error_text: null,
      };
    }

    // --- Layer 5 (Packet 27): title-only fallback. When YouTube
    // refuses captions and the description is empty — a common
    // pattern for Shorts in 2026 — a bare title still beats a
    // hard failure. We mark it as a distinct source so the UI can
    // explicitly prompt the user to paste the recipe body.
    if (desc.title && desc.title.trim().length > 0) {
      const titleText = desc.title.trim();
      return {
        status: 'acquired',
        platform: 'youtube',
        video_id: videoId,
        transcript: titleText.slice(0, MAX_TRANSCRIPT_CHARS),
        transcript_chars: Math.min(titleText.length, MAX_TRANSCRIPT_CHARS),
        language: null,
        source: 'youtube_title_only',
        latency_ms: Date.now() - startedAt,
        error_text: null,
      };
    }

    // Nothing worked. Prefer `unavailable` over `fetch_failed` unless
    // every attempt actually errored out — callers treat `unavailable`
    // as a graceful fallback and only escalate on real infra failures.
    if (fetchError && !desc.text && !desc.title && !listOutcome.transcript) {
      return {
        status: 'fetch_failed',
        platform: 'youtube',
        video_id: videoId,
        transcript: null,
        transcript_chars: 0,
        language: null,
        source: 'youtube_timedtext',
        latency_ms: Date.now() - startedAt,
        error_text: `youtube: ${fetchError}`,
      };
    }

    return {
      status: 'unavailable',
      platform: 'youtube',
      video_id: videoId,
      transcript: null,
      transcript_chars: 0,
      language: null,
      source: 'youtube_timedtext',
      latency_ms: Date.now() - startedAt,
      error_text:
        'No captions, ASR track, or description text could be acquired for this video.',
    };
  },
};

registerPlatformAdapter(youtubeAdapter);

/**
 * Social evidence importer — fetch public watch/shorts page metadata as
 * structured title + description (no caption ladder). Never throws.
 * Used to store creator/description evidence separately from transcript rows.
 */
export async function fetchYouTubePublicPageMetadata(
  videoId: string,
  timeoutMs = 15_000,
): Promise<{
  title: string | null;
  description: string | null;
  error: string | null;
}> {
  return fetchYouTubePublicPageMetadataRaw(videoId, timeoutMs);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function safeFetchText(
  url: string,
  timeoutMs: number,
): Promise<{ body: string | null; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { body: null, error: `HTTP ${resp.status}` };
    }
    const body = await resp.text();
    return { body, error: null };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { body: null, error: msg };
  }
}

/**
 * Query the timedtext list endpoint to discover available caption
 * tracks, then fetch the first available track. Prefers English
 * tracks when present and falls back to the first returned track
 * otherwise.
 */
async function tryTimedtextList(
  videoId: string,
  timeoutMs: number,
): Promise<{ transcript: string | null; lang: string | null; error: string | null }> {
  const listUrl = `https://video.google.com/timedtext?type=list&v=${videoId}`;
  const res = await safeFetchText(listUrl, timeoutMs);
  if (!res.body) return { transcript: null, lang: null, error: res.error };

  const tracks: Array<{ lang_code: string; kind: string | null }> = [];
  const trackRe = /<track\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = trackRe.exec(res.body)) !== null) {
    const tag = m[0];
    const langMatch = /lang_code="([^"]+)"/.exec(tag);
    const kindMatch = /kind="([^"]+)"/.exec(tag);
    if (langMatch) {
      tracks.push({
        lang_code: langMatch[1],
        kind: kindMatch ? kindMatch[1] : null,
      });
    }
  }
  if (tracks.length === 0) return { transcript: null, lang: null, error: null };

  // Pick English when available, otherwise take the first track.
  const english = tracks.find((t) => /^en(-|_|$)/i.test(t.lang_code));
  const pick = english ?? tracks[0];

  const kindQuery = pick.kind ? `&kind=${encodeURIComponent(pick.kind)}` : '';
  const fetchUrl = `https://video.google.com/timedtext?v=${videoId}&lang=${encodeURIComponent(
    pick.lang_code,
  )}${kindQuery}`;
  const fetched = await safeFetchText(fetchUrl, timeoutMs);
  if (!fetched.body) {
    return { transcript: null, lang: pick.lang_code, error: fetched.error };
  }
  const transcript = parseTimedtextXml(fetched.body);
  if (!transcript || transcript.trim().length === 0) {
    return { transcript: null, lang: pick.lang_code, error: null };
  }
  return { transcript, lang: pick.lang_code, error: null };
}

async function fetchYouTubePublicPageMetadataRaw(
  videoId: string,
  timeoutMs: number,
): Promise<{
  title: string | null;
  description: string | null;
  error: string | null;
}> {
  const attempts = [
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
  let lastError: string | null = null;
  let title: string | null = null;
  let description: string | null = null;
  for (const url of attempts) {
    const res = await safeFetchText(url, timeoutMs);
    if (!res.body) {
      lastError = res.error;
      continue;
    }
    const meta = extractVideoMetadata(res.body);
    if (!meta) continue;
    if (!title && meta.title?.trim()) title = meta.title.trim();
    if (!description && meta.description?.trim()) {
      description = meta.description.trim();
    }
    if (title && description) break;
  }
  if (!title && !description) {
    return { title: null, description: null, error: lastError };
  }
  return { title, description, error: null };
}

/**
 * Scrape the YouTube watch/shorts HTML for `videoDetails.title` +
 * `videoDetails.shortDescription` from the embedded
 * `ytInitialPlayerResponse` JSON. Returns the combined text for the
 * description fallback path AND the title separately so callers can
 * use the title alone as a Packet 27 last-resort signal when the
 * description is empty.
 */
async function tryWatchPageDescription(
  videoId: string,
  timeoutMs: number,
): Promise<{
  text: string | null;
  title: string | null;
  error: string | null;
}> {
  const meta = await fetchYouTubePublicPageMetadataRaw(videoId, timeoutMs);
  const bestTitle = meta.title;
  const descText = meta.description;
  if (descText && descText.trim().length >= MIN_DESCRIPTION_CHARS) {
    const parts: string[] = [];
    if (bestTitle) parts.push(bestTitle);
    parts.push(descText.trim());
    const text = parts.join('\n\n').trim();
    return { text, title: bestTitle, error: null };
  }
  return { text: null, title: bestTitle, error: meta.error };
}

/**
 * Pull `{title, shortDescription}` out of a YouTube watch/shorts
 * HTML document. The metadata lives in the `ytInitialPlayerResponse`
 * JSON literal; we locate the object by balanced-brace scanning
 * rather than regex so nested JSON braces don't truncate the match.
 */
export function extractVideoMetadata(
  html: string,
): { title: string | null; description: string | null } | null {
  const marker = 'ytInitialPlayerResponse';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const braceIdx = html.indexOf('{', markerIdx);
  if (braceIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = braceIdx; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  const jsonText = html.slice(braceIdx, end);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const videoDetails = (parsed as { videoDetails?: unknown } | null)
    ?.videoDetails;
  if (!videoDetails || typeof videoDetails !== 'object') return null;
  const vd = videoDetails as { title?: unknown; shortDescription?: unknown };
  const title = typeof vd.title === 'string' ? vd.title : null;
  const description =
    typeof vd.shortDescription === 'string' ? vd.shortDescription : null;
  if (!title && !description) return null;
  return { title, description };
}

function parseTimedtextXml(xml: string): string {
  const lines: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1] ?? '';
    const cleaned = decodeEntities(raw)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length > 0) lines.push(cleaned);
  }
  return lines.join('\n');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

export { parseTimedtextXml as _parseTimedtextXml, decodeEntities as _decodeEntities };
