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
  /**
   * Composition-driven primary CTA — rendered as a wide pill button. When both
   * label and href are present this takes precedence over `buttons` and produces
   * the wide-primary + secondary-link hero treatment. Authored/edited from the
   * composition input model (not resolved from the catalogue).
   */
  ctaPrimaryLabel?: string;
  ctaPrimaryHref?: string;
  /** Secondary copy/link rendered as a plain link beneath the primary CTA. */
  ctaSecondaryLabel?: string;
  ctaSecondaryHref?: string;
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

/**
 * process.timed-steps.v1 — Table-style "how it works" process section.
 *
 * Renders the code-owned `TimedProcessSteps` visual: a rounded, bordered list of
 * rows (step number · title · description) with an auto-advancing highlight.
 * This is the table-style process pattern used by the static
 * `/programs/[category-slug]` page — distinct from the image-driven
 * `process.slide-stack.v1` slideshow.
 */
export interface ProcessTimedStepsV1Content {
  heading: string;
  steps: Array<{
    stepNumber: number;
    /** Optional timing label (e.g. "Days 1–21"); not shown in the row body. */
    label?: string;
    title: string;
    description: string;
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

/** feature.reasons-split.v1 — 50/50 split panel: copy + reasons left, full-height image right */
export interface FeatureReasonsSplitV1Content {
  heading: string;
  /** Optional lead paragraph beneath the heading, above the reasons list. */
  body?: string;
  items: Array<{
    label: string;
    sentence: string;
  }>;
  imageDesktop: string;
  imageMobile: string;
  imageAlt?: string;
  /**
   * Optional large CTA rendered INSIDE the copy column, below the reasons stack —
   * mirroring the code-owned `CategoryAppIntegration` CTA. Authored as a plain
   * label + url (NOT resolved from the catalogue, NOT a media field). The CTA
   * renders only when BOTH `ctaLabel` and `ctaHref` are present, so existing
   * compositions without a CTA stay valid and visually unchanged.
   */
  ctaLabel?: string;
  ctaHref?: string;
  /** Visual fill for the CTA pill. Defaults to 'denim' (wide denim-gradient pill). */
  ctaTone?: 'denim' | 'brand';
}

/**
 * Allowlisted icon keys for icon-tile modules. These map to the code-owned icon
 * set in `components/icons`; the renderer ignores anything outside this union, so
 * composition content can never request an arbitrary/unknown glyph.
 */
export type FeatureIconName =
  | 'insights'
  | 'programs'
  | 'notebook'
  | 'quadrants'
  | 'home'
  | 'save';

/**
 * feature.icon-tiles.v1 — Heading + supporting intro + a row of icon tiles.
 *
 * Author-driven editorial content with an ALLOWLISTED `icon` enum (no arbitrary
 * glyphs). Mirrors the code-owned CategoryDifferentiators section.
 */
export interface FeatureIconTilesV1Content {
  heading: string;
  intro?: string;
  tiles: Array<{
    /** Allowlisted icon key; omit to render the tile without a glyph. */
    icon?: FeatureIconName;
    title: string;
    description: string;
  }>;
  /** Surface treatment. Defaults to 'dark' (mirrors CategoryDifferentiators). */
  surface?: 'light' | 'dark';
}

/**
 * grid.program-cards.v1 — Resolver-driven grid of program cards for a collection.
 *
 * Authored content owns ONLY the target collection slug and the presentational
 * heading/subhead. The program list, sequence/order, internal links, length
 * labels, card detail, status, and any offer/availability truth all come from the
 * code catalogue (programSeriesCatalogue) — never from composition content.
 */
export interface GridProgramCardsV1Content {
  /** Program collection to render (storage: program_series). */
  collectionSlug: string;
  heading?: string;
  subhead?: string;
}

/**
 * grid.program-collections-rail.v1 — Resolver-driven horizontal rail of Program Collections.
 *
 * Authored content owns only section copy and optional collection filtering. The
 * card titles, descriptions, images, order, CTA label/link/disabled state, and
 * access truth resolve from the published Programs catalogue.
 *
 * Optional authored `cards`: when present and non-empty, the rail renders these
 * authored cards instead of the resolver catalogue. This lets Integrative Care
 * authors own card copy/images/pricing/CTA/note without touching the Programs
 * catalogue. When `cards` is absent or empty, the resolver fallback is unchanged.
 */
export interface GridProgramCollectionsRailV1Card {
  id?: string;
  eyebrow?: string;
  title: string;
  /** Rendered directly under the title using the same visual treatment as the headline. */
  priceLine?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Center-aligned xs note rendered below the CTA only when showNote is true and note is non-empty. */
  note?: string;
  showNote?: boolean;
}

export interface GridProgramCollectionsRailV1Content {
  heading?: string;
  intro?: string;
  /** Optional ordered set of collection slugs. Empty/omitted = all published collections. */
  collectionSlugs?: string[];
  /** Featured collection used for the wide CTA below the rail. Defaults to nutrition. */
  featuredCollectionSlug?: string;
  featuredEyebrow?: string;
  secondaryEyebrow?: string;
  ctaNote?: string;
  /** Defaults to true. Set false to hide the wide CTA below the rail. */
  showFeaturedCta?: boolean;
  /**
   * Optional authored cards. When present and non-empty, the rail renders these
   * instead of the resolver catalogue. Resolver-driven fields (collectionSlugs,
   * featuredCollectionSlug, eyebrows) are ignored in authored mode.
   */
  cards?: GridProgramCollectionsRailV1Card[];
}

/**
 * nav.program-pathway.v1 — Resolver-driven pathway navigation for one program.
 *
 * Authored content owns ONLY the collection + program slugs. The breadcrumb,
 * step position ("Step N of M"), and previous/next links are all resolved from
 * the code catalogue via `getProgramSeriesProgramBySlugs`. First, last, single-
 * program, and unknown-slug cases are handled by the resolver/component — authors
 * never hand-author sequence, links, titles, or status.
 */
export interface NavProgramPathwayV1Content {
  /** Program collection slug (storage: program_series). */
  collectionSlug: string;
  /** Program slug within the collection (storage: program). */
  programSlug: string;
}

/**
 * comparison.table.v1 — Two-column "us vs. them" comparison table.
 *
 * Author-driven editorial content (no catalogue/offer coupling). Mirrors the
 * code-owned CategoryComparison section.
 */
export interface ComparisonTableV1Content {
  heading: string;
  /** Column header labels. */
  columns: {
    left: string;
    right: string;
  };
  rows: Array<{
    /** Optional row caption; rendered only when present. */
    label?: string;
    left: string;
    right: string;
  }>;
}

/**
 * cta.program-offer.v1 — Program-aware CTA band.
 *
 * Authorable content only references a program by slug plus surrounding copy.
 * The button label, link, availability (coming_soon / planned -> disabled),
 * checkout offer routing, and secondary CTA are resolved centrally via
 * `resolveProgramMarketingCta` — they are NOT authored here, preserving
 * offer/entitlement truth.
 */
export interface CtaProgramOfferV1Content {
  /** Public program collection slug (storage: program_series). */
  collectionSlug: string;
  /** Optional specific program slug; omit for the collection-level CTA. */
  programSlug?: string;
  eyebrow?: string;
  heading?: string;
  body?: string;
  /** Text alignment. Defaults to 'center'. */
  align?: 'left' | 'center';
  /** Surface treatment. Defaults to 'light'. */
  surface?: 'light' | 'dark';
  /**
   * CTA presentation. `'full'` (default) renders the primary pill, the secondary
   * link, and any resolved helper text — the original behavior. `'primary-only'`
   * renders just the single primary CTA, matching the preview-era `CategoryIntro`
   * section (heading + body + one primary CTA). Defaults to `'full'` so existing
   * modules are unchanged.
   */
  ctaStyle?: 'full' | 'primary-only';
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
  'process.timed-steps.v1': ProcessTimedStepsV1Content;
  'persuasion.simple-cta.v1': PersuasionSimpleCtaV1Content;
  'ambient.marquee-strip.v1': AmbientMarqueeStripV1Content;
  'case-study.scroll-cards.v1': CaseStudyScrollCardsV1Content;
  'faq.accordion.v2': FaqAccordionV2Content;
  'feature.reasons-split.v1': FeatureReasonsSplitV1Content;
  'cta.program-offer.v1': CtaProgramOfferV1Content;
  'comparison.table.v1': ComparisonTableV1Content;
  'feature.icon-tiles.v1': FeatureIconTilesV1Content;
  'grid.program-cards.v1': GridProgramCardsV1Content;
  'grid.program-collections-rail.v1': GridProgramCollectionsRailV1Content;
  'nav.program-pathway.v1': NavProgramPathwayV1Content;
}

export type ModuleTypeKey = keyof ModuleContentMap;

// Re-export the section chrome type so module instances can reference it without
// a circular import (the chrome token maps live in sectionChrome.ts).
export type { ModuleChrome } from './sectionChrome';
import type { ModuleChrome } from './sectionChrome';

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
    /**
     * Optional, instance-level section chrome (wrapper rounding/overlap/surface/
     * borders/text tone). Safe enum/token only — see lib/modules/sectionChrome.ts.
     * Omitted on existing compositions, which keep their order-derived rendering.
     */
    chrome?: ModuleChrome;
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
