/**
 * Module System v1 — Type Contracts
 *
 * Defines the content interfaces for all Phase 1 module types and the
 * PageComposition contract used to express a page as an ordered list
 * of typed module instances.
 *
 * Naming convention:
 *   Module type keys:  {category}.{variant}.v{n}   e.g. "hero.standard.v1"
 *   Page keys:         page:site:{area}:{slug}      e.g. "page:site:lp:integrative-care-preview"
 */

// ============================================================================
// Shared Primitives
// ============================================================================

export interface ButtonSlot {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'quinary';
}

export interface ResponsiveImageSlot {
  desktop: string;
  mobile: string;
  alt?: string;
}

// ============================================================================
// Module Content Interfaces
// ============================================================================

/** hero.standard.v1 — Full or medium-height hero with background image and CTAs */
export interface HeroStandardV1Content {
  headline: string;
  subheadline?: string;
  /** Long-form body paragraph (optional). Sits below subheadline. */
  body?: string;
  buttons?: ButtonSlot[];
  images: ResponsiveImageSlot;
  /** 'full' = 99vh (default). 'medium' = 66vh. */
  height?: 'full' | 'medium';
}

/** feature.split-media.v1 — Rounded content card with optional Swiper carousel */
export interface FeatureSplitMediaV1Content {
  title?: string;
  description?: string;
  buttons?: ButtonSlot[];
  images: ResponsiveImageSlot;
  slides?: Array<{
    id?: string;
    title?: string;
    description?: string;
    images?: { desktop?: string; mobile?: string };
    buttons?: ButtonSlot[];
  }>;
}

/** grid.cards.v1 — Responsive 2-column grid of image cards */
export interface GridCardsV1Content {
  title?: string;
  items: Array<{
    id?: string;
    title: string;
    description?: string;
    image?: string;
    button?: ButtonSlot;
    /** 'form-4-3' uses 4:3 aspect on mobile, fixed height desktop. */
    aspect?: 'form-4-3' | string;
  }>;
}

/** cta.band.v1 — Full-width centered call-to-action band */
export interface CtaBandV1Content {
  headline: string;
  body?: string;
  button?: ButtonSlot;
  images?: ResponsiveImageSlot;
}

/** faq.accordion.v1 — Expandable question/answer list */
export interface FaqAccordionV1Content {
  title?: string;
  items: Array<{
    id?: string;
    question: string;
    answer: string;
  }>;
}

/** pricing.tiers.v1 — Grid of pricing tier cards */
export interface PricingTiersV1Content {
  title?: string;
  description?: string;
  cards: Array<{
    id: string;
    title: string;
    subtitle?: string;
    description?: string;
    price?: string;
    paymentSchedule?: string;
    image?: string;
    button: ButtonSlot;
  }>;
  columns?: {
    mobile?: 1;
    tablet?: 2 | 3;
    desktop?: 2 | 3 | 4;
  };
}

/** hero.offer-blur.v1 — Immersive blurred editorial hero with centered single CTA */
export interface HeroOfferBlurV1Content {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  imageDesktop: string;
  imageMobile: string;
  overlayStrength?: 'light' | 'medium' | 'dark';
}

/** process.slide-stack.v1 — Interactive stacked panel process slideshow */
export interface ProcessSlideStackV1Content {
  heading: string;
  defaultOpenIndex?: number;
  steps: Array<{
    stepNumber: number;
    label: string;
    title?: string;
    lines: string[];
    imageDesktop: string;
    imageMobile: string;
  }>;
}

/** persuasion.simple-cta.v1 — Standalone persuasion block with structured list or paragraphs + CTA */
export interface PersuasionSimpleCtaV1Content {
  heading: string;
  intro?: string;
  items?: string[];
  bodyParagraphs?: string[];
  ctaLabel: string;
  ctaHref: string;
  /** 'list' = bullet list layout. 'paragraph' = body paragraphs layout. */
  variant?: 'list' | 'paragraph';
}

/** ambient.marquee-strip.v1 — Auto-scrolling repeating text strip */
export interface AmbientMarqueeStripV1Content {
  text: string;
  speed?: number;
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
}

/** case-study.scroll-cards.v1 — Horizontal scroll storytelling cards */
export interface CaseStudyScrollCardsV1Content {
  sectionHeading: string;
  cards: Array<{
    id?: string;
    imageDesktop: string;
    imageMobile: string;
    imageAlt?: string;
    before?: string;
    breakthrough?: string;
    after?: string;
  }>;
}

/** faq.accordion.v2 — Premium styled FAQ with dark cap header, bordered shell */
export interface FaqAccordionV2Content {
  title: string;
  items: Array<{
    id?: string;
    question: string;
    answer: string;
  }>;
  defaultOpenIndex?: number;
}

/** feature.reasons-split.v1 — 50/50 split panel: text reasons left, full-height image right */
export interface FeatureReasonsSplitV1Content {
  heading: string;
  items: Array<{
    label: string;
    sentence: string;
  }>;
  imageDesktop: string;
  imageMobile: string;
  imageAlt?: string;
}

// ============================================================================
// Content Map — discriminated union by type key
// ============================================================================

export interface ModuleContentMap {
  'hero.standard.v1': HeroStandardV1Content;
  'feature.split-media.v1': FeatureSplitMediaV1Content;
  'grid.cards.v1': GridCardsV1Content;
  'cta.band.v1': CtaBandV1Content;
  'faq.accordion.v1': FaqAccordionV1Content;
  'pricing.tiers.v1': PricingTiersV1Content;
  'hero.offer-blur.v1': HeroOfferBlurV1Content;
  'process.slide-stack.v1': ProcessSlideStackV1Content;
  'persuasion.simple-cta.v1': PersuasionSimpleCtaV1Content;
  'ambient.marquee-strip.v1': AmbientMarqueeStripV1Content;
  'case-study.scroll-cards.v1': CaseStudyScrollCardsV1Content;
  'faq.accordion.v2': FaqAccordionV2Content;
  'feature.reasons-split.v1': FeatureReasonsSplitV1Content;
}

export type ModuleTypeKey = keyof ModuleContentMap;

// ============================================================================
// Composition Types
// ============================================================================

/**
 * A single positioned module inside a page composition.
 * The discriminated union ensures `content` is typed to `type`.
 */
export type ModuleInstance = {
  [K in ModuleTypeKey]: {
    /** Stable identifier within this composition (used as React key). */
    id: string;
    type: K;
    content: ModuleContentMap[K];
  };
}[ModuleTypeKey];

/**
 * A page expressed as an ordered sequence of module instances.
 *
 * Keys follow the convention: page:site:{area}:{slug}
 * e.g. "page:site:lp:integrative-care-preview"
 *
 * Stored in:
 *   Phase 1 — data/compositions/{slug}.json
 *   Phase 2 — site_content table, key = composition.key
 */
export interface PageComposition {
  /** Stable identifier. Used as site_content.key in Phase 2. */
  key: string;
  /** Schema version for future migrations. */
  version?: number;
  modules: ModuleInstance[];
}