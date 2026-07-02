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
import { moduleChromeSchema } from './sectionChrome';

// ============================================================================
// Shared Primitives
// ============================================================================

const buttonSlotSchema = z.object({
  label: z.string(),
  href: z.string(),
  variant: z.enum(['primary', 'secondary', 'tertiary', 'quaternary', 'quinary']).optional(),
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
  // Composition-driven hero CTA (wide primary pill + secondary copy/link).
  ctaPrimaryLabel: z.string().optional(),
  ctaPrimaryHref: z.string().optional(),
  ctaSecondaryLabel: z.string().optional(),
  ctaSecondaryHref: z.string().optional(),
  images: responsiveImageSlotSchema,
  height: z.enum(['full', 'medium']).optional(),
  // Optional start-style affordances. All optional; omitted = default hero.
  eyebrow: z.string().optional(),
  ctaNote: z.string().optional(),
  heroRailEnabled: z.boolean().optional(),
  heroRailItems: z.array(z.string()).optional(),
  overlayStrength: z.enum(['light', 'medium', 'dark']).optional(),
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

export const heroOfferBlurV1Schema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
  imageDesktop: z.string(),
  imageMobile: z.string(),
  overlayStrength: z.enum(['light', 'medium', 'dark']).optional(),
});

export const processSlideStackV1Schema = z.object({
  heading: z.string(),
  defaultOpenIndex: z.number().optional(),
  steps: z.array(
    z.object({
      stepNumber: z.number(),
      label: z.string(),
      title: z.string().optional(),
      lines: z.array(z.string()),
      imageDesktop: z.string(),
      imageMobile: z.string(),
    }),
  ),
});

export const processTimedStepsV1Schema = z.object({
  heading: z.string(),
  steps: z.array(
    z.object({
      stepNumber: z.number(),
      label: z.string().optional(),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

export const processNumberedCardsV1Schema = z.object({
  eyebrow: z.string().optional(),
  heading: z.string(),
  intro: z.string().optional(),
  steps: z.array(
    z.object({
      number: z.string(),
      title: z.string(),
      body: z.string(),
    }),
  ),
  surface: z.enum(['dark', 'light']).optional(),
});

export const systemCardsScrollerV1Schema = z.object({
  heading: z.string(),
  intro: z.string().optional(),
  cards: z.array(
    z.object({
      id: z.string().optional(),
      eyebrow: z.string().optional(),
      headline: z.string(),
      description: z.string(),
      image: z.string(),
      imageAlt: z.string().optional(),
    }),
  ),
  surface: z.enum(['dark', 'light']).optional(),
});

export const persuasionSimpleCtaV1Schema = z.object({
  heading: z.string(),
  intro: z.string().optional(),
  items: z.array(z.string()).optional(),
  bodyParagraphs: z.array(z.string()).optional(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
  variant: z.enum(['list', 'paragraph']).optional(),
});

export const ambientMarqueeStripV1Schema = z.object({
  text: z.string(),
  speed: z.number().optional(),
  direction: z.enum(['left', 'right']).optional(),
  pauseOnHover: z.boolean().optional(),
});

export const caseStudyScrollCardsV1Schema = z.object({
  sectionHeading: z.string(),
  cards: z.array(
    z.object({
      id: z.string().optional(),
      imageDesktop: z.string(),
      imageMobile: z.string(),
      imageAlt: z.string().optional(),
      before: z.string().optional(),
      breakthrough: z.string().optional(),
      after: z.string().optional(),
    }),
  ),
});

export const faqAccordionV2Schema = z.object({
  title: z.string(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
  defaultOpenIndex: z.number().optional(),
});

export const featureReasonsSplitV1Schema = z.object({
  heading: z.string(),
  body: z.string().optional(),
  items: z.array(
    z.object({
      label: z.string(),
      sentence: z.string(),
    }),
  ),
  imageDesktop: z.string(),
  imageMobile: z.string(),
  imageAlt: z.string().optional(),
  // Optional large CTA inside the copy column (backward compatible).
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
  ctaTone: z.enum(['denim', 'brand']).optional(),
});

export const gridProgramCardsV1Schema = z.object({
  collectionSlug: z.string(),
  heading: z.string().optional(),
  subhead: z.string().optional(),
});

export const gridProgramCollectionsRailV1Schema = z.object({
  heading: z.string().optional(),
  intro: z.string().optional(),
  collectionSlugs: z.array(z.string()).optional(),
  featuredCollectionSlug: z.string().optional(),
  featuredEyebrow: z.string().optional(),
  secondaryEyebrow: z.string().optional(),
  ctaNote: z.string().optional(),
  showFeaturedCta: z.boolean().optional(),
  cards: z
    .array(
      z.object({
        id: z.string().optional(),
        eyebrow: z.string().optional(),
        title: z.string(),
        priceLine: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
        imageAlt: z.string().optional(),
        ctaLabel: z.string().optional(),
        ctaHref: z.string().optional(),
        note: z.string().optional(),
        showNote: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const navProgramPathwayV1Schema = z.object({
  collectionSlug: z.string(),
  programSlug: z.string(),
});

const featureIconNameSchema = z.enum([
  'insights',
  'programs',
  'notebook',
  'quadrants',
  'home',
  'save',
]);

export const featureIconTilesV1Schema = z.object({
  heading: z.string(),
  intro: z.string().optional(),
  tiles: z.array(
    z.object({
      icon: featureIconNameSchema.optional(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  surface: z.enum(['light', 'dark']).optional(),
});

export const comparisonTableV1Schema = z.object({
  heading: z.string(),
  columns: z.object({
    left: z.string(),
    right: z.string(),
  }),
  rows: z.array(
    z.object({
      label: z.string().optional(),
      left: z.string(),
      right: z.string(),
    }),
  ),
});

export const ctaProgramOfferV1Schema = z.object({
  collectionSlug: z.string(),
  programSlug: z.string().optional(),
  eyebrow: z.string().optional(),
  heading: z.string().optional(),
  body: z.string().optional(),
  align: z.enum(['left', 'center']).optional(),
  surface: z.enum(['light', 'dark']).optional(),
  ctaStyle: z.enum(['full', 'primary-only']).optional(),
});

/**
 * lead.waitlist-capture.v1 — Conversion-safe lead/waitlist capture form.
 *
 * Owns ONLY lead capture + SMS consent UX. Does NOT carry or alter billing,
 * Stripe IDs, checkout routing, entitlement grants, trial enforcement, price-
 * option truth, or offer truth. `variant` maps 1:1 to the backend `captureMode`
 * on submission. Phone/programSlug/offerKey/startPageSlug are pass-through
 * context fields handed to POST /api/people/waitlist unchanged.
 */
export const leadWaitlistCaptureV1Schema = z.object({
  variant: z.enum(['simple', 'priority', 'concierge']),
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  phonePrompt: z.string().optional(),
  nameLabel: z.string().optional(),
  emailLabel: z.string().optional(),
  phoneLabel: z.string().optional(),
  goalLabel: z.string().optional(),
  preferredChannelLabel: z.string().optional(),
  smsConsentLabel: z.string().optional(),
  smsConsentVersion: z.string().optional(),
  ctaLabel: z.string(),
  submittingLabel: z.string().optional(),
  successTitle: z.string().optional(),
  successBody: z.string().optional(),
  successSmsNote: z.string().optional(),
  errorFallback: z.string().optional(),
  campaignKey: z.string(),
  preferredChannel: z.enum(['email', 'sms', 'either']).optional().nullable(),
  source: z.string(),
  programSlug: z.string().optional().nullable(),
  offerKey: z.string().optional().nullable(),
  startPageSlug: z.string().optional().nullable(),
  redirectPath: z.string().optional().nullable(),
});

/**
 * access.code-gate.v1 — Access Code Gate.
 *
 * Frontend-safe access-code entry + verification module. Owns ONLY the entry
 * UX and submits to POST /api/access-codes/verify. Does NOT carry or alter
 * billing, Stripe IDs, checkout routing, entitlement grants, trial
 * enforcement, price-option truth, or offer truth. The success CTA must be a
 * safe relative URL; the module never calls checkout or grants access.
 */
export const accessCodeGateV1Schema = z.object({
  variant: z.enum(['simple', 'private_offer', 'cohort']),
  eyebrow: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  codeLabel: z.string().optional(),
  codePlaceholder: z.string().optional(),
  collectEmail: z.boolean(),
  emailLabel: z.string().optional(),
  emailPlaceholder: z.string().optional(),
  ctaLabel: z.string(),
  submittingLabel: z.string().optional(),
  successTitle: z.string().optional(),
  successBody: z.string().optional(),
  successCtaLabel: z.string().optional(),
  successCtaHref: z.string().optional(),
  invalidMessage: z.string().optional(),
  expiredMessage: z.string().optional(),
  helpText: z.string().optional(),
  source: z.string(),
  campaignKey: z.string(),
  startPageSlug: z.string().optional().nullable(),
  programSlug: z.string().optional().nullable(),
  productSlug: z.string().optional().nullable(),
  offerKey: z.string().optional().nullable(),
  codeKey: z.string().optional().nullable(),
});

// ============================================================================
// Schema Map
// ============================================================================

export const MODULE_CONTENT_SCHEMAS: Record<string, z.ZodSchema> = {
  'hero.standard.v1': heroStandardV1Schema,
  'feature.split-media.v1': featureSplitMediaV1Schema,
  'grid.cards.v1': gridCardsV1Schema,
  'cta.band.v1': ctaBandV1Schema,
  'faq.accordion.v1': faqAccordionV1Schema,
  'pricing.tiers.v1': pricingTiersV1Schema,
  'hero.offer-blur.v1': heroOfferBlurV1Schema,
  'process.slide-stack.v1': processSlideStackV1Schema,
  'process.timed-steps.v1': processTimedStepsV1Schema,
  'process.numbered-cards.v1': processNumberedCardsV1Schema,
  'system.cards-scroller.v1': systemCardsScrollerV1Schema,
  'persuasion.simple-cta.v1': persuasionSimpleCtaV1Schema,
  'ambient.marquee-strip.v1': ambientMarqueeStripV1Schema,
  'case-study.scroll-cards.v1': caseStudyScrollCardsV1Schema,
  'faq.accordion.v2': faqAccordionV2Schema,
  'feature.reasons-split.v1': featureReasonsSplitV1Schema,
  'cta.program-offer.v1': ctaProgramOfferV1Schema,
  'comparison.table.v1': comparisonTableV1Schema,
  'feature.icon-tiles.v1': featureIconTilesV1Schema,
  'grid.program-cards.v1': gridProgramCardsV1Schema,
  'grid.program-collections-rail.v1': gridProgramCollectionsRailV1Schema,
  'nav.program-pathway.v1': navProgramPathwayV1Schema,
  'lead.waitlist-capture.v1': leadWaitlistCaptureV1Schema,
  'access.code-gate.v1': accessCodeGateV1Schema,
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
  'hero.offer-blur.v1',
  'process.slide-stack.v1',
  'process.timed-steps.v1',
  'process.numbered-cards.v1',
  'system.cards-scroller.v1',
  'persuasion.simple-cta.v1',
  'ambient.marquee-strip.v1',
  'case-study.scroll-cards.v1',
  'faq.accordion.v2',
  'feature.reasons-split.v1',
  'cta.program-offer.v1',
  'comparison.table.v1',
  'feature.icon-tiles.v1',
  'grid.program-cards.v1',
  'grid.program-collections-rail.v1',
  'nav.program-pathway.v1',
  'lead.waitlist-capture.v1',
  'access.code-gate.v1',
]);

/**
 * Loose module instance schema — content is validated per-type in compositionApi
 * using MODULE_CONTENT_SCHEMAS after we know the type.
 */
export const moduleInstanceLooseSchema = z.object({
  id: z.string(),
  type: moduleTypeKeySchema,
  content: z.record(z.string(), z.unknown()),
  /** Optional, safe-token section chrome (validated against the allowlist). */
  chrome: moduleChromeSchema.optional(),
});

// ============================================================================
// Page Composition Schema
// ============================================================================

export const pageCompositionSchema = z.object({
  key: z.string(),
  version: z.number().optional(),
  modules: z.array(moduleInstanceLooseSchema),
});
