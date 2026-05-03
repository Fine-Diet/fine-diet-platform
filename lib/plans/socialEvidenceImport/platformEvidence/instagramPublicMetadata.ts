/**
 * Instagram — conservative public metadata attempt.
 *
 * This intentionally avoids oEmbed, authenticated browser state, cookies,
 * private GraphQL endpoints, and aggressive scraping. It performs one public
 * HTML fetch and extracts standard metadata tags when Instagram exposes them.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export type InstagramPublicMetadataStatus =
  | 'ok'
  | 'blocked'
  | 'http_error'
  | 'invalid_json'
  | 'network'
  | 'empty'
  | 'unavailable'
  | 'invalid_url';

export interface InstagramPublicMetadataResult {
  caption: string | null;
  title: string | null;
  author_name: string | null;
  status: InstagramPublicMetadataStatus;
  http_status: number | null;
  error: string | null;
  url_used: string | null;
}

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function normalizeInstagramPageUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!isHostOrSubdomain(host, 'instagram.com')) return null;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export async function fetchInstagramPublicMetadata(
  pageUrl: string,
  timeoutMs = 15_000,
): Promise<InstagramPublicMetadataResult> {
  const normalized = normalizeInstagramPageUrl(pageUrl);
  if (!normalized) {
    return {
      caption: null,
      title: null,
      author_name: null,
      status: 'invalid_url',
      http_status: null,
      error: 'Instagram URL could not be normalized.',
      url_used: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(normalized, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const httpStatus = resp.status;
    if (resp.status === 401 || resp.status === 403 || resp.status === 429 || resp.status === 451) {
      return {
        caption: null,
        title: null,
        author_name: null,
        status: 'blocked',
        http_status: httpStatus,
        error: `Instagram public metadata fetch returned HTTP ${resp.status}.`,
        url_used: normalized,
      };
    }
    if (!resp.ok) {
      return {
        caption: null,
        title: null,
        author_name: null,
        status: 'http_error',
        http_status: httpStatus,
        error: `Instagram public metadata fetch HTTP ${resp.status}`,
        url_used: normalized,
      };
    }

    const html = await resp.text();
    if (!html.trim()) {
      return {
        caption: null,
        title: null,
        author_name: null,
        status: 'empty',
        http_status: httpStatus,
        error: 'Instagram public page returned an empty HTML response.',
        url_used: normalized,
      };
    }

    const meta = extractInstagramMetadata(html);
    if (!meta.caption && !meta.title) {
      return {
        caption: null,
        title: null,
        author_name: meta.author_name,
        status: 'unavailable',
        http_status: httpStatus,
        error: 'Instagram public page did not expose caption metadata.',
        url_used: normalized,
      };
    }

    return {
      caption: meta.caption,
      title: meta.title,
      author_name: meta.author_name,
      status: 'ok',
      http_status: httpStatus,
      error: null,
      url_used: normalized,
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      caption: null,
      title: null,
      author_name: null,
      status: 'network',
      http_status: null,
      error: msg,
      url_used: normalized,
    };
  }
}

export function extractInstagramMetadata(html: string): {
  caption: string | null;
  title: string | null;
  author_name: string | null;
} {
  const description =
    metaContent(html, 'property', 'og:description') ??
    metaContent(html, 'name', 'description') ??
    metaContent(html, 'property', 'twitter:description');
  const title =
    metaContent(html, 'property', 'og:title') ??
    metaContent(html, 'name', 'title') ??
    metaContent(html, 'property', 'twitter:title') ??
    titleTagContent(html);
  const author =
    metaContent(html, 'name', 'author') ??
    metaContent(html, 'property', 'instapp:owner_user_name') ??
    authorFromText(title) ??
    authorFromText(description);

  const caption = cleanInstagramDescription(description) ?? cleanInstagramDescription(title);
  return {
    caption,
    title: cleanTitle(title),
    author_name: author,
  };
}

function metaContent(html: string, attrName: 'property' | 'name', attrValue: string): string | null {
  const tagPattern = /<meta\b[^>]*>/gi;
  const tags = html.match(tagPattern) ?? [];
  for (const tag of tags) {
    const key = attr(tag, attrName);
    if (key?.toLowerCase() !== attrValue.toLowerCase()) continue;
    const content = attr(tag, 'content');
    if (content?.trim()) return decodeHtmlEntities(content).trim();
  }
  return null;
}

function attr(tag: string, name: string): string | null {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return tag.match(pattern)?.[2] ?? null;
}

function titleTagContent(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return decodeHtmlEntities(stripTags(match[1])).trim() || null;
}

function cleanInstagramDescription(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = normalizeWhitespace(value);
  const quoted = text.match(/[\"“]([^\"”]{1,5000})[\"”]/)?.[1]?.trim();
  if (quoted) return normalizeWhitespace(quoted);

  const afterColon = text.match(/(?:on Instagram|Instagram):\s*(.+)$/i)?.[1]?.trim();
  if (afterColon) return normalizeWhitespace(afterColon.replace(/^["“]|["”]$/g, ''));

  const afterStats = text.replace(
    /^[\d,.]+\s+likes?,\s*[\d,.]+\s+comments?\s*-\s*/i,
    '',
  );
  return afterStats === text ? null : normalizeWhitespace(afterStats);
}

function cleanTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = normalizeWhitespace(value.replace(/\s*•\s*Instagram\s*$/i, ''));
  return isGenericInstagramTitle(cleaned) ? null : cleaned;
}

function isGenericInstagramTitle(value: string): boolean {
  return /^(instagram|login\s*•\s*instagram|instagram\s*•\s*photos and videos)$/i.test(
    value,
  );
}

function authorFromText(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^([^:@\n]{1,80})\s+(?:on Instagram|on\s+\w+\s*:\s*)/i);
  return match?.[1]?.trim() || null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
