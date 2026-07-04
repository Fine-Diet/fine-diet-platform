/**
 * Shared SEO / Social Preview field shape.
 *
 * One canonical, editor-facing shape for social preview metadata, reused by
 * every admin/editor surface that authors a shareable marketing page
 * (Start Pages, Integrative Care product records, Programs marketing product
 * records). Persisted as an optional `seo` block on each page's config/record
 * so we avoid multiple incompatible SEO storage patterns.
 *
 * This shape is a structural subset of `SeoRouteConfig` (lib/contentTypes.ts):
 * it omits the legacy `pageTitle` / `pageDescription` / `ogImage` fields and
 * keeps only the fully-overridable social preview set. At render time it is
 * merged into `getSeoForRoute` as a `pageOverride` (highest precedence above
 * the route-level `seo:route:{path}` record), so the precedence chain is:
 *
 *   page/admin override (this block)
 *     → route-specific SEO record (seo:route:{path})
 *       → product/page record SEO fields
 *         → page/template defaults
 *           → global SEO fallback (seo:global / hard-coded defaults)
 *
 * Blank/empty fields are stripped by the editor before save and by the schema
 * (optional fields), so they never override a useful fallback.
 *
 * DISPLAY METADATA ONLY. These fields never affect checkout, billing,
 * entitlements, grants, redirects, or scriptable behavior. Canonical/OG/Twitter
 * values are treated as display metadata only.
 */

import { z } from 'zod';

export const seoSocialFieldsSchema = z
  .object({
    /** Direct SEO title override (bypasses the global title template). */
    title: z.string().max(160).optional(),
    /** Direct SEO description override. */
    description: z.string().max(320).optional(),
    /** Relative canonical path (e.g. /start/launch). Resolved against canonicalBase. */
    canonicalPath: z.string().optional(),
    /** Absolute canonical URL override (wins over canonicalPath). */
    canonical: z.string().optional(),
    /** Robots directive override (e.g. "noindex,nofollow"). */
    robots: z.string().optional(),
    /** Quick noindex flag — when true, renders "noindex,follow" unless robots is set. */
    noindex: z.boolean().optional(),
    og: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        /** Absolute or storage URL to the Open Graph image. */
        image: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
    twitter: z
      .object({
        card: z.enum(['summary', 'summary_large_image']).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        /** Absolute or storage URL to the Twitter card image. */
        image: z.string().optional(),
      })
      .optional(),
  })
  .optional();

export type SeoSocialFields = z.infer<typeof seoSocialFieldsSchema>;

/**
 * Compose a render-time `pageOverride` from a product/page record that exposes
 * an optional `seo` block plus legacy `seoTitle` / `seoDescription` columns.
 * The `seo` block is the authoritative social-preview source; the legacy
 * columns remain a fallback for title/description so existing rows keep
 * rendering a useful title without a migration.
 *
 * Returns null when neither source provides any field, so callers can skip
 * passing an override entirely.
 */
export function composePageSeoOverride(args: {
  seo?: SeoSocialFields | null;
  legacyTitle?: string | null;
  legacyDescription?: string | null;
}): SeoSocialFields | null {
  const { seo, legacyTitle, legacyDescription } = args;
  if (seo) {
    return {
      ...seo,
      title: seo.title ?? (legacyTitle ?? undefined),
      description: seo.description ?? (legacyDescription ?? undefined),
    };
  }
  if (legacyTitle || legacyDescription) {
    return {
      title: legacyTitle ?? undefined,
      description: legacyDescription ?? undefined,
    };
  }
  return null;
}

/**
 * Convert a `SeoSocialFields` block (editor/persisted shape) into the
 * `SeoRouteConfig`-compatible override expected by `getSeoForRoute`. Returns
 * `null` when the block is absent or has no set fields, so callers can skip
 * passing an override entirely.
 *
 * Structural compatibility: `SeoSocialFields` is a subset of `SeoRouteConfig`,
 * so the cast is safe. This helper exists only to keep the call sites tidy and
 * to filter out empty blocks.
 */
export function toSeoRouteOverride(
  seo: SeoSocialFields | null | undefined,
): SeoSocialFields | null {
  if (!seo) return null;
  const hasAny =
    seo.title !== undefined ||
    seo.description !== undefined ||
    seo.canonicalPath !== undefined ||
    seo.canonical !== undefined ||
    seo.robots !== undefined ||
    seo.noindex !== undefined ||
    !!seo.og ||
    !!seo.twitter;
  return hasAny ? seo : null;
}
