/**
 * Zod Validators for Content Types
 * 
 * Validates content fetched from Supabase against TypeScript interfaces.
 */

import { z } from 'zod';

// ============================================================================
// Shared Validators
// ============================================================================

const buttonVariantSchema = z.enum(['primary', 'secondary', 'tertiary', 'quaternary']);

const buttonConfigSchema = z.object({
  label: z.string(),
  variant: buttonVariantSchema,
  href: z.string(),
});

const responsiveImagesSchema = z.object({
  desktop: z.string(),
  mobile: z.string(),
});

const waitlistConfigSchema = z.object({
  enabled: z.boolean(),
  title: z.string().optional(),
  description: z.string().optional(),
  buttonLabel: z.string().optional(),
});

// ============================================================================
// Navigation Content Validators
// ============================================================================

const navigationTopLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const navigationTopLinksSchema = z.object({
  journal: navigationTopLinkSchema,
  account: navigationTopLinkSchema,
});

const navigationItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.string(),
  href: z.string(),
  available: z.boolean(),
  waitlist: waitlistConfigSchema.optional(),
  buttons: z.array(buttonConfigSchema),
});

const navigationSubcategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(navigationItemSchema),
});

const navigationProspectProductSchema = z.object({
  subcategoryLabel: z.string(),
  id: z.string(),
  title: z.string(),
  description: z.string(),
  badge: z.string(),
  image: z.string(),
  href: z.string(),
  available: z.boolean(),
  waitlist: waitlistConfigSchema,
  buttons: z.array(buttonConfigSchema),
});

const navigationLayoutSchema = z.object({
  showHero: z.boolean(),
  showGrid: z.boolean(),
  showCTA: z.boolean(),
});

const pricingCardSchema = z.object({
  id: z.string(),
  image: z.string(),
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  price: z.string(),
  paymentSchedule: z.string(),
  button: buttonConfigSchema,
});

const pricingSectionColumnsSchema = z.object({
  mobile: z.number(),
  tablet: z.number(),
  desktop: z.number(),
});

const navigationPricingSectionSchema = z.object({
  type: z.literal('pricing'),
  id: z.string(),
  enabled: z.boolean(),
  title: z.string(),
  description: z.string(),
  columns: pricingSectionColumnsSchema,
  cards: z.array(pricingCardSchema),
});

const navigationSectionSchema = navigationPricingSectionSchema; // Can be extended later

const navigationCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  headline: z.string(),
  subtitle: z.string(),
  layout: navigationLayoutSchema,
  subcategories: z.array(navigationSubcategorySchema),
  prospectProduct: navigationProspectProductSchema,
  sections: z.array(navigationSectionSchema).optional(),
});

export const navigationContentSchema = z.object({
  topLinks: navigationTopLinksSchema,
  categories: z.array(navigationCategorySchema),
});

// ============================================================================
// Home Content Validators
// ============================================================================

const heroContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  buttons: z.array(buttonConfigSchema),
  images: responsiveImagesSchema,
});

const featureSlideSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  images: responsiveImagesSchema.optional(),
  buttons: z.array(buttonConfigSchema).optional(),
});

const featureSectionSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  buttons: z.array(buttonConfigSchema).optional(),
  images: responsiveImagesSchema,
  slides: z.array(featureSlideSchema).optional(),
});

const gridItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  button: buttonConfigSchema.optional(),
});

const gridSectionSchema = z.object({
  items: z.array(gridItemSchema),
});

const ctaSectionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  button: buttonConfigSchema.optional(),
  images: responsiveImagesSchema.optional(),
});

export const homeContentSchema = z.object({
  hero: heroContentSchema,
  featureSections: z.array(featureSectionSchema),
  gridSections: z.array(gridSectionSchema),
  ctaSection: ctaSectionSchema,
});

// ============================================================================
// Footer Content Validators
// ============================================================================

const footerLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const footerNewsletterSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
});

const footerLinkSectionSchema = z.object({
  title: z.string(),
  links: z.array(footerLinkSchema),
});

const footerLegalSchema = z.object({
  links: z.array(footerLinkSchema),
  copyright: z.string(),
});

export const footerContentSchema = z.object({
  newsletter: footerNewsletterSchema,
  explore: footerLinkSectionSchema,
  resources: footerLinkSectionSchema,
  connect: footerLinkSectionSchema,
  legal: footerLegalSchema,
});

// ============================================================================
// Waitlist Content Validators
// ============================================================================

export const waitlistContentSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  formHeadline: z.string().optional(),
  formSubheadline: z.string().optional(),
  successMessage: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  successTitle: z.string().optional(),
  submitButtonLabel: z.string().optional(),
  submitButtonLoadingLabel: z.string().optional(),
  goalPlaceholder: z.string().optional(),
  privacyNote: z.string().optional(),
  // Form field labels
  emailLabel: z.string().optional(),
  nameLabel: z.string().optional(),
  goalLabel: z.string().optional(),
  requiredLabel: z.string().optional(),
  optionalLabel: z.string().optional(),
  // Form field placeholders
  emailPlaceholder: z.string().optional(),
  namePlaceholder: z.string().optional(),
  // Logo
  logoPath: z.string().optional(),
  logoAlt: z.string().optional(),
});

// ============================================================================
// Product Page Content Validators
// ============================================================================

const productHeroSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  imageDesktop: z.string().optional(),
  imageMobile: z.string().optional(),
  buttons: z.array(buttonConfigSchema).optional(),
});

const productValuePropSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const productSectionSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'cta', 'pricing', 'faq']),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  items: z.array(z.any()).optional(),
});

const productFAQSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const productSEOSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

export const productPageContentSchema = z.object({
  hero: productHeroSchema,
  valueProps: z.array(productValuePropSchema).optional(),
  sections: z.array(productSectionSchema).optional(),
  faq: z.array(productFAQSchema).optional(),
  seo: productSEOSchema.optional(),
});

// ============================================================================
// Global Content Validators
// ============================================================================

const announcementBarSchema = z.object({
  enabled: z.boolean(),
  message: z.string(),
  href: z.string().optional(),
});

export const globalContentSchema = z.object({
  siteName: z.string().optional(),
  metaDefaultTitle: z.string().optional(),
  metaDefaultDescription: z.string().optional(),
  announcementBar: announcementBarSchema.optional(),
});


// ============================================================================
// SEO Validators
// ============================================================================

export const seoGlobalConfigSchema = z.object({
  siteName: z.string(),
  titleTemplate: z.string(),
  defaultTitle: z.string(),
  defaultDescription: z.string(),
  canonicalBase: z.string(),
  ogImage: z.string().optional(),
  twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
  robots: z.string().optional(),
});

export const seoRouteConfigSchema = z.object({
  pageTitle: z.string().optional(),
  pageDescription: z.string().optional(),
  canonicalPath: z.string().optional(),
  ogImage: z.string().optional(),
  robots: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  canonical: z.string().optional(),
  noindex: z.boolean().optional(),
  og: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    type: z.string().optional(),
  }).optional(),
  twitter: z.object({
    card: z.enum(['summary', 'summary_large_image']).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
  }).optional(),
});

export const browserAssetsSchema = z.object({
  favicon: z.string().optional(),
  appleTouchIcon: z.string().optional(),
  themeColor: z.string().optional(),
  manifestName: z.string().optional(),
  manifestShortName: z.string().optional(),
});

export const robotsContentSchema = z.object({
  content: z.string(),
});

// ============================================================================
// Configuration Validators
// ============================================================================

export const featureFlagsSchema = z.object({
  enableN8nWebhook: z.boolean(),
  enableNewResultsFlow: z.boolean().optional(),
  allowUnlistedYoutubeEmbeds: z.boolean().optional(),
});

export const assessmentConfigSchema = z.object({
  scoring: z.object({
    thresholds: z.object({
      axisBandHigh: z.number().optional(),
      axisBandModerate: z.number().optional(),
      confidenceThresholds: z.object({
        high: z.number(),
        medium: z.number(),
      }).optional(),
      secondaryAvatarThreshold: z.number().optional(),
    }),
  }),
});

export const avatarMappingSchema = z.object({
  defaultAvatarKey: z.string(),
  mappings: z.record(z.string(), z.string()),
});
