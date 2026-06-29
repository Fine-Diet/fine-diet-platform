/**
 * Start Pages — schemas (SSR/client-safe; no server-only imports).
 *
 * Defines the durable record shape for a Start Page / Offer Landing Page and a
 * zod schema for `StartTemplateConfig` (presentation overrides consumed by
 * `components/offers/StartView`).
 *
 * SAFETY BOUNDARY:
 * - `config` is PRESENTATION ONLY. The schemas below intentionally describe only
 *   copy/visibility/content zones. zod object parsing STRIPS unknown keys, so no
 *   Stripe price IDs, billing models, trial-enforcement, entitlement, or grant
 *   fields can ever be persisted into `config_json` even if a payload includes
 *   them.
 * - Billing truth stays in `price_options`; access/entitlements stay in
 *   `offers`/`offer_entitlements`. A Start Page only references approved
 *   `price_option_keys` by key.
 */

import { z } from 'zod';

import { startRuntimeModuleZonesSchema } from '@/lib/startPages/startRuntimeModules';

/** Stable keys for the stacked sections (mirrors StartView `StartSectionKey`). */
export const START_SECTION_KEYS = [
  'hero',
  'heroRail',
  'systemCards',
  'trial',
  'pricing',
  'faq',
  'finalCta',
] as const;

export type StartSectionKey = (typeof START_SECTION_KEYS)[number];

/** Templates available to Start Pages. v1 ships a single template family. */
export const START_TEMPLATE_KEYS = ['start.v1'] as const;
export type StartTemplateKey = (typeof START_TEMPLATE_KEYS)[number];

export const START_PAGE_STATUSES = ['draft', 'published', 'archived'] as const;
export type StartPageStatus = (typeof START_PAGE_STATUSES)[number];

/** Default slug whose route is `/start`. */
export const DEFAULT_START_PAGE_SLUG = 'default';

const heroOverlaySchema = z.enum(['light', 'medium', 'dark']);

const systemCardSchema = z.object({
  id: z.string().min(1),
  headline: z.string(),
  description: z.string(),
  image: z.string(),
  eyebrow: z.string().optional(),
});

const processStepSchema = z.object({
  number: z.string(),
  title: z.string(),
  body: z.string(),
});

const faqItemSchema = z.object({
  id: z.string().optional(),
  question: z.string(),
  answer: z.string(),
});

/**
 * `StartTemplateConfig` — must stay structurally compatible with the interface
 * of the same name in `components/offers/StartView.tsx`. Presentation only.
 */
export const startTemplateConfigSchema = z
  .object({
    sections: z
      .record(z.enum(START_SECTION_KEYS), z.boolean())
      .optional(),
    hero: z
      .object({
        eyebrow: z.string().nullable().optional(),
        headline: z.string().optional(),
        subheadline: z.string().optional(),
        ctaNote: z.string().optional(),
        image: z.string().optional(),
        overlay: heroOverlaySchema.optional(),
      })
      .optional(),
    heroRail: z
      .object({
        items: z.array(z.string()).optional(),
      })
      .optional(),
    systemCards: z
      .object({
        heading: z.string().optional(),
        intro: z.string().optional(),
        cards: z.array(systemCardSchema).optional(),
      })
      .optional(),
    trial: z
      .object({
        eyebrow: z.string().optional(),
        heading: z.string().optional(),
        intro: z.string().optional(),
        steps: z.array(processStepSchema).optional(),
      })
      .optional(),
    pricing: z
      .object({
        heading: z.string().optional(),
        intro: z.string().optional(),
      })
      .optional(),
    faq: z
      .object({
        title: z.string().optional(),
        items: z.array(faqItemSchema).optional(),
      })
      .optional(),
    finalCta: z
      .object({
        heading: z.string().optional(),
        note: z.string().optional(),
      })
      .optional(),
    /**
     * Controlled runtime-module zones for Start/Launch pages. This is still
     * presentation-only and validates each inserted module against a Start-safe
     * runtime allowlist.
     */
    runtimeModules: startRuntimeModuleZonesSchema.optional(),
  })
  // Unknown top-level keys are stripped (default zod object behavior), keeping
  // config_json free of any non-presentation / charge-sensitive fields.
  .strip();

export type StartTemplateConfig = z.infer<typeof startTemplateConfigSchema>;

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Durable Start Page record (app-layer camelCase shape). */
export const startPageRecordSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(SLUG_PATTERN, 'slug must be lowercase letters, numbers, and hyphens only'),
  routePath: z
    .string()
    .regex(/^\/start(\/[a-z0-9-]+)?$/, 'route_path must be /start or /start/{slug}'),
  templateKey: z.enum(START_TEMPLATE_KEYS),
  primaryOfferKey: z.string().min(1),
  priceOptionKeys: z.array(z.string().min(1)).default([]),
  status: z.enum(START_PAGE_STATUSES),
  seoTitle: z.string().max(160).nullable().optional(),
  seoDescription: z.string().max(320).nullable().optional(),
  config: startTemplateConfigSchema.default({}),
});

export type StartPageRecord = z.infer<typeof startPageRecordSchema>;

/** Resolve the public route path for a slug. */
export function routePathForSlug(slug: string): string {
  return slug === DEFAULT_START_PAGE_SLUG ? '/start' : `/start/${slug}`;
}
