/**
 * Hero Rail normalization helpers (SSR/client-safe).
 *
 * `start_pages.config_json` persists `heroRail.items` as a backward-compatible
 * union of legacy `string` items and structured `StartHeroRailItem` objects
 * (see `startPageSchema.ts`). StartView uses these helpers to normalize either
 * shape into the structured form the renderer consumes, so existing string-only
 * pages keep rendering identically while new edits enrich the data.
 *
 * Presentation only — these helpers never touch billing, checkout, Stripe,
 * entitlements, grants, or trial enforcement.
 */

import type { StartHeroRailItem } from '@/lib/startPages/startPageSchema';

export function normalizeHeroRailItem(item: string | StartHeroRailItem): StartHeroRailItem {
  if (typeof item === 'string') return { label: item };
  return item;
}

/**
 * A hero rail item href is only treated as a link target when it is a safe
 * relative path (`/...`, `#...`) or a well-formed http/https absolute URL.
 * Anything else (e.g. `javascript:`) is ignored so a stray authored value
 * cannot break the marquee or inject unsafe navigation. Presentation guard only.
 */
export function isSafeRailHref(href: string | undefined): href is string {
  if (!href) return false;
  const value = href.trim();
  if (value === '') return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (value.startsWith('#')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
