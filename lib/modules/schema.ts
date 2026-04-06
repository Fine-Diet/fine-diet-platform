/**
 * Module System v1 — Runtime Validation Schemas
 *
 * Zod schemas mirror the TypeScript interfaces in types.ts.
 * Used in compositionApi.ts to validate JSON loaded from disk or CMS.
 *
 * Validation policy:
 *   - Per-module validation failures skip the module (warn, don't crash).
 *   - Top-level composition structure failures return null (not found).
 */

import { z } from 'zod';
import type { ModuleTypeKey } from './types';

// ============================================================================
// Shared Primitives
// ============================================================================

const buttonSlotSchema = z.object({
  label: z.string(),
  href: z.string(),
  variant: z.enum(['primary', 'secondary', 'tertiary', 'quaternary']).optional(),
});

const responsiveImageSlotSchema = z.object({
  desktop: z.string(),
  mobile: z.string(),
  alt: z.string().optional(),
});

// ============================================================================
// Module Content Schemas
// ============================================================================

export const heroStandardV1Schema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  body: z.string().optional(),
  buttons: z.array(buttonSlotSchema).optional(),
  images: responsiveImageSlotSchema,
  height: z.enum(['full', 'medium']).optional(),
});

export const featureSplitMediaV1Schema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  buttons: z.array(buttonSlotSchema).optional(),
  images: responsiveImageSlotSchema,
  slides: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        images: z
          .object({
            desktop: z.string().optional(),
            mobile: z.string().optional(),
          })
          .optional(),
        buttons: z.array(buttonSlotSchema).optional(),
      }),
    )
    .optional(),
});

export const gridCardsV1Schema = z.object({
  title: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      image: z.string().optional(),
      button: buttonSlotSchema.optional(),
      aspect: z.string().optional(),
    }),
  ),
});

export const ctaBandV1Schema = z.object({
  headline: z.string(),
  body: z.string().optional(),
  button: buttonSlotSchema.optional(),
  images: responsiveImageSlotSchema.optional(),
});

export const faqAccordionV1Schema = z.object({
  title: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
});

export const pricingTiersV1Schema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  cards: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      subtitle: z.string().optional(),
      description: z.string().optional(),
      price: z.string().optional(),
      paymentSchedule: z.string().optional(),
      image: z.string().optional(),
      button: buttonSlotSchema,
    }),
  ),
  columns: z
    .object({
      mobile: z.literal(1).optional(),
      tablet: z.union([z.literal(2), z.literal(3)]).optional(),
      desktop: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    })
    .optional(),
});

// ============================================================================
// Schema Map
// ============================================================================

export const MODULE_CONTENT_SCHEMAS: Record<ModuleTypeKey, z.ZodSchema> = {
  'hero.standard.v1': heroStandardV1Schema,
  'feature.split-media.v1': featureSplitMediaV1Schema,
  'grid.cards.v1': gridCardsV1Schema,
  'cta.band.v1': ctaBandV1Schema,
  'faq.accordion.v1': faqAccordionV1Schema,
  'pricing.tiers.v1': pricingTiersV1Schema,
};

// ============================================================================
// Module Instance Schema
// ============================================================================

const moduleTypeKeySchema = z.enum([
  'hero.standard.v1',
  'feature.split-media.v1',
  'grid.cards.v1',
  'cta.band.v1',
  'faq.accordion.v1',
  'pricing.tiers.v1',
]);

/**
 * Loose module instance schema — content is validated per-type in compositionApi
 * using MODULE_CONTENT_SCHEMAS after we know the type.
 */
export const moduleInstanceLooseSchema = z.object({
  id: z.string(),
  type: moduleTypeKeySchema,
  content: z.record(z.unknown()),
});

// ============================================================================
// Page Composition Schema
// ============================================================================

export const pageCompositionSchema = z.object({
  key: z.string(),
  version: z.number().optional(),
  modules: z.array(moduleInstanceLooseSchema),
});
