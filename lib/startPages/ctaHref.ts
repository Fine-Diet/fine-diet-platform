/**
 * CTA href safety helper (SSR/client-safe).
 *
 * Reuses the same safety policy as `isSafeRailHref` in `./heroRail.ts`:
 * a CTA href is treated as a link target only when it is a safe relative
 * path (`/...`, not `//`), a hash anchor (`#...`), or a well-formed
 * `http:`/`https:` absolute URL. Anything else (e.g. `javascript:`) is
 * rejected so an editor-controlled value cannot inject unsafe navigation,
 * open redirects, or break out of the in-page anchor pattern.
 *
 * This is a PRESENTATION GUARD ONLY. It never touches checkout routing,
 * billing, Stripe, entitlements, grants, or trial enforcement. When an
 * override is present but unsafe, the consuming CTA falls back to its
 * default (checkout / product-selection / app-home) behavior.
 */

export function isSafeCtaHref(href: string | null | undefined): href is string {
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
