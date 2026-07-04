# SEO & Social Preview Layer

## Purpose

A reusable SEO / social preview layer so every key Fine Diet marketing page can
be configured with **title, description, canonical, robots/noindex, Open Graph
image/context, and Twitter image/context** from the admin/editor surface where
the page is authored, then rendered consistently through the shared `SeoHead`
pipeline.

This is **not** a `/start`-only patch. The same layer applies to:

- `/start`
- `/start/[offerSlug]`
- `/integrative-care`
- `/programs`
- `/programs/[series]`
- `/assessments`
- `/assessments/[slug]`
- `/[category]` category routes (already on the pipeline; unchanged)

## Architecture

### Shared config shape

One canonical editor/persisted shape: **`SeoSocialFields`**
(`lib/seo/seoSocialFields.ts`), a zod-validated subset of `SeoRouteConfig`
(`lib/contentTypes.ts`). Fields:

- `title`, `description`
- `canonicalPath` (relative, resolved against the global canonical base),
  `canonical` (absolute override)
- `robots`, `noindex`
- `og`: `{ title, description, image, type }`
- `twitter`: `{ card, title, description, image }`

All fields optional. Unknown keys are stripped by zod, so the block stays
**display-metadata only** — no checkout, billing, entitlement, grant, redirect,
or scriptable values can sneak in.

### Shared admin component

`components/admin/SeoSocialFields.tsx` — `SeoSocialFieldsEditor` renders the
full field cluster once and is reused by every authoring surface (Start Pages,
Integrative Care, Programs Marketing). OG/Twitter images use the existing
`ImageFieldWithPicker` pattern. Empty fields are reduced to `undefined` on save
so they never shadow a useful fallback.

### Render pipeline

`getSeoForRoute` (`lib/seo/getSeo.ts`) loads `seo:global`, `seo:route:{path}`,
and `seo:assets` from `site_content`, merges them with a per-route
`pageOverride`, and returns a normalized `SeoMeta` that `SeoHead`
(`components/seo/SeoHead.tsx`) renders into all primary + OG + Twitter + browser
asset tags.

`pageOverride` is the page/admin-authored `seo` block, threaded from the
resolved page record.

## Precedence (highest → lowest)

1. **Page/admin override** — the `seo` block authored in the page's editor
   (Start Page config, Integrative Care / Programs Marketing product record).
2. **Route-specific SEO record** — `seo:route:{path}` in `site_content`.
3. **Product/page record SEO fields** — legacy `seoTitle` / `seoDescription`
   columns on the product record (fallback for title/description only).
4. **Page/template defaults** — the route's `pageTitle` / `pageDescription`
   passed into `getSeoForRoute` (e.g. the offer copy, the collection title).
5. **Global SEO fallback** — `seo:global` (`/admin/seo`), then hard-coded
   `FALLBACK_DEFAULTS` if the CMS is unavailable.

Blank fields do not override useful fallbacks: the editor strips empty values
to `undefined` before save, and the merger only reads present fields. Legacy
`seoTitle` / `seoDescription` are composed into the override as a fallback for
title/description only when the `seo` block omits them
(`composePageSeoOverride` in `lib/seo/seoSocialFields.ts`).

## Where metadata is persisted

| Page family | Storage | Key / table | Editor surface |
|---|---|---|---|
| `/start`, `/start/[offerSlug]` | `start_pages.config_json` (`seo` block) + legacy `seo_title` / `seo_description` columns | `public.start_pages` | `/admin/start-pages/[slug]` |
| `/integrative-care` | `site_content` product record (`seo` block) + legacy `seoTitle` / `seoDescription` | `product:integrative-care:{slug}` | `/admin/integrative-care/[productSlug]` |
| `/programs`, `/programs/[series]` | `site_content` product record (`seo` block) + legacy `seoTitle` / `seoDescription` | `product:programs:{slug}` | `/admin/programs-marketing/[slug]` |
| `/assessments`, `/assessments/[slug]` | Route-level `site_content` record + registry title/description | `seo:route:/assessments[/{slug}]` | SEO admin / `site_content` (no per-assessment editor yet) |
| `/[category]` | Route-level `site_content` record | `seo:route:/{category}` | SEO admin / navigation editor |

No DB migration was required. The `seo` block lives in existing JSONB columns
(`start_pages.config_json`, `site_content.data`), and the schema extension is
additive/optional, so existing rows remain valid.

## Admin workflow

1. Open the page's editor (e.g. `/admin/start-pages/launch`).
2. Edit **Metadata & SEO → SEO & social preview** (Start Pages) or the
   **SEO & social preview** section (Integrative Care / Programs Marketing).
3. Set title, description, canonical path/URL, robots/noindex, OG image/context,
   and Twitter image/context. Leave any field blank to fall back to the next
   precedence layer.
4. Save draft, then **Save & publish** (Start Pages) or **Publish** (Integrative
   Care / Programs Marketing). ISR revalidates the public page.
5. Edit global defaults (site name, title template, canonical base, default OG
   image, default Twitter card) at `/admin/seo`.

## Fallback behavior when fields are blank

- No `seo` block at all → legacy `seoTitle` / `seoDescription` (if present) feed
  title/description; everything else falls back to the route record then global.
- `seo` block present but a field blank → that field falls back to the route
  record, then template defaults, then global.
- Twitter image blank → falls back to the OG image.
- OG/Twitter title/description blank → fall back to the SEO title/description.
- No canonical override → built from `canonicalBase` + the normalized route
  path.
- CMS unavailable → hard-coded `FALLBACK_DEFAULTS` still render a valid title,
  description, and absolute canonical.

## Boundaries

- Display metadata only. No redirects, no scriptable values, no billing /
  entitlement / grant fields.
- Canonical/OG/Twitter values are treated as display metadata only.
- Image fields use the existing `ImageFieldWithPicker` (storage picker) — no
  arbitrary scriptable URLs.
- Stripe, checkout, Offers, Entitlements, Supabase migrations, Campaign Moments,
  AccessCodeGate, and LeadWaitlist behavior are untouched.

## Routes intentionally deferred

- **Individual assessment social-preview editor**: `/assessments/[slug]` renders
  through `SeoHead` with route-level `seo:route:/assessments/{slug}` records
  supplying social image/context, and the registry title/description as
  fallback. A per-assessment admin editor for the social preview block is
  deferred — the registry model does not currently carry per-assessment image
  fields, and adding them is a separate scope. Route-level `site_content`
  records remain the configuration surface today.
