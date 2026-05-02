/**
 * TikTok — best-effort public caption via the documented oEmbed endpoint.
 * No API key. Does not scrape logged-in pages. Never throws.
 *
 * @see https://developers.tiktok.com/doc/embed-videos/
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const OEMBED_BASE = 'https://www.tiktok.com/oembed';

export type TikTokOEmbedFetchStatus =
  | 'ok'
  | 'blocked'
  | 'http_error'
  | 'invalid_json'
  | 'network';

export interface TikTokOEmbedCaptionResult {
  caption: string | null;
  author_name: string | null;
  status: TikTokOEmbedFetchStatus;
  http_status: number | null;
  error: string | null;
}

/** Strip tracking query/hash; keep path (video identity). */
export function normalizeTikTokPageUrlForOembed(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('tiktok.com')) return null;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/**
 * vm.tiktok.com short links often work with oEmbed; if not, expand
 * redirects to a canonical www URL and retry once.
 */
async function expandVmTikTokIfNeeded(pageUrl: string, timeoutMs: number): Promise<string> {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return pageUrl;
  }
  if (!host.startsWith('vm.')) return pageUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(pageUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    const finalUrl =
      typeof res.url === 'string' && res.url.length > 0 ? res.url : pageUrl;
    const normalized = normalizeTikTokPageUrlForOembed(finalUrl);
    return normalized ?? pageUrl;
  } catch {
    return pageUrl;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTikTokCaptionViaOembed(
  pageUrl: string,
  timeoutMs = 15_000,
): Promise<TikTokOEmbedCaptionResult> {
  const ready = await expandVmTikTokIfNeeded(pageUrl, Math.min(timeoutMs, 10_000));
  const endpoint = `${OEMBED_BASE}?url=${encodeURIComponent(ready)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const httpStatus = resp.status;
    if (resp.status === 403 || resp.status === 451) {
      return {
        caption: null,
        author_name: null,
        status: 'blocked',
        http_status: httpStatus,
        error: `TikTok oEmbed returned HTTP ${resp.status} (likely blocked or region-restricted).`,
      };
    }
    if (resp.status === 429) {
      return {
        caption: null,
        author_name: null,
        status: 'blocked',
        http_status: httpStatus,
        error: 'TikTok oEmbed rate-limited this request (HTTP 429).',
      };
    }
    if (!resp.ok) {
      return {
        caption: null,
        author_name: null,
        status: 'http_error',
        http_status: httpStatus,
        error: `TikTok oEmbed HTTP ${resp.status}`,
      };
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      return {
        caption: null,
        author_name: null,
        status: 'invalid_json',
        http_status: httpStatus,
        error: 'TikTok oEmbed response was not valid JSON.',
      };
    }
    if (!body || typeof body !== 'object') {
      return {
        caption: null,
        author_name: null,
        status: 'invalid_json',
        http_status: httpStatus,
        error: 'TikTok oEmbed returned an unexpected payload.',
      };
    }
    const o = body as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const author = typeof o.author_name === 'string' ? o.author_name.trim() : null;

    if (!title) {
      return {
        caption: null,
        author_name: author,
        status: 'ok',
        http_status: httpStatus,
        error: null,
      };
    }
    return {
      caption: title,
      author_name: author,
      status: 'ok',
      http_status: httpStatus,
      error: null,
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      caption: null,
      author_name: null,
      status: 'network',
      http_status: null,
      error: msg,
    };
  }
}
