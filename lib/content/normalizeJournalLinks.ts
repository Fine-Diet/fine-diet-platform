import { APP_ROUTES, getCanonicalAppRouteForLegacyJournalPath } from '@/lib/routes/appRoutes';

const CONTENT_ORIGIN = 'https://myfinediet.com';
const LEGACY_JOURNAL_HOST = 'journal.myfinediet.com';

/**
 * Rewrites old Journal-host and `/journal` links into first-party app paths.
 * Auth, entitlement, and onboarding decisions remain with the `/app` middleware.
 */
export function normalizeJournalHref(href: string): string {
  let parsed: URL;
  try {
    parsed = new URL(href, CONTENT_ORIGIN);
  } catch {
    return href;
  }

  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//');
  const isLegacyHost = parsed.hostname.toLowerCase() === LEGACY_JOURNAL_HOST;
  const isLegacyPath =
    !isAbsolute &&
    (parsed.pathname === '/journal' || parsed.pathname.startsWith('/journal/'));

  if (!isLegacyHost && !isLegacyPath) return href;

  const legacyPath = parsed.pathname || '/';
  const normalizedLegacyPath = legacyPath.replace(/\/+$/, '') || '/';
  const path =
    isLegacyHost && (normalizedLegacyPath === '/' || normalizedLegacyPath === '/login')
      ? APP_ROUTES.log
      : getCanonicalAppRouteForLegacyJournalPath(normalizedLegacyPath) ?? normalizedLegacyPath;

  // Login on the retired host is replaced by the normal protected app entry.
  // Its old redirect query is intentionally dropped; app middleware derives a
  // safe return path from the selected `/app/log` route itself.
  const search = isLegacyHost && normalizedLegacyPath === '/login' ? '' : parsed.search;
  return `${path}${search}${parsed.hash}`;
}

/** Recursively normalizes href properties without changing unrelated content. */
export function normalizeJournalLinks<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJournalLinks(item)) as T;
  }
  if (!value || typeof value !== 'object') return value;

  const normalized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      key === 'href' && typeof child === 'string'
        ? normalizeJournalHref(child)
        : normalizeJournalLinks(child),
    ]),
  );
  return normalized as T;
}
