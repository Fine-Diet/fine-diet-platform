/**
 * Module Discovery Metadata
 *
 * Human-facing metadata for the module style guide. This file intentionally
 * sits next to, not inside, the runtime/page-building registries so marketing
 * discovery language can improve without changing module render contracts.
 */

import type { ModuleCategory, ModuleDefinition } from '@/lib/moduleRegistry';

export type ModulePreviewMode = 'abstract' | 'fixture' | 'live';

export type ModulePreviewPageFamily =
  | 'general'
  | 'programs'
  | 'integrative-care'
  | 'start'
  | 'offer'
  | 'assessment'
  | 'app';

export interface ModulePreviewFixture {
  id: string;
  label: string;
  pageFamily?: ModulePreviewPageFamily;
  viewport?: 'mobile' | 'tablet' | 'desktop';
  description?: string;
}

export interface ModuleDiscoveryMetadata {
  /** Short marketing/product label used as the primary card title. */
  humanNickname?: string;
  /** Plain-language discovery copy: when to use this module and why. */
  finderDescription?: string;
  /** Extra search terms humans are likely to type. */
  searchAliases?: string[];
  /** Flexible discovery tags. Keep category filtering separate and intact. */
  tags?: string[];
  /** How the mini preview should be rendered. */
  previewMode?: ModulePreviewMode;
  /** Optional fixture labels for future preview switching. */
  previewFixtures?: ModulePreviewFixture[];
  /** Optional runtime module key when this style-guide item maps to the runtime registry. */
  runtimeKey?: string;
}

export type ModuleDiscoveryMetadataMap = Record<string, ModuleDiscoveryMetadata>;

export const MODULE_DISCOVERY_SITE_CONTENT_KEY = 'module-metadata';

const SHARED_PATHWAY_TAGS = [
  'surface:public_site',
  'page-family:pathway',
  'bank:pathway',
] as const;

const HERO_TAGS = [
  ...SHARED_PATHWAY_TAGS,
  'family:hero',
  'role:orient',
] as const;

const PROGRAM_BANK_TAGS = [...SHARED_PATHWAY_TAGS, 'bank:programs'] as const;
const INTEGRATIVE_CARE_BANK_TAGS = [...SHARED_PATHWAY_TAGS, 'bank:integrative-care'] as const;
const START_BANK_TAGS = [...SHARED_PATHWAY_TAGS, 'bank:start', 'bank:offer'] as const;
const APP_REFERENCE_TAGS = ['surface:signed_in_app', 'bank:app-reference'] as const;

export const DEFAULT_MODULE_DISCOVERY_METADATA: ModuleDiscoveryMetadataMap = {
  hero: {
    humanNickname: 'Primary landing hero',
    finderDescription:
      'Use when a public page needs the biggest emotional opening moment: full-viewport image, centered headline, supporting copy, and one or two CTAs.',
    searchAliases: ['homepage hero', 'full screen hero', 'landing page hero', 'image hero', 'top of page'],
    tags: [...HERO_TAGS, 'page-type:home', 'page-type:campaign', 'content:cms-editable'],
    previewMode: 'live',
    previewFixtures: [
      { id: 'homepage', label: 'Homepage example', pageFamily: 'general', viewport: 'desktop' },
    ],
  },
  'hero-medium': {
    humanNickname: 'Interior landing hero',
    finderDescription:
      'Use for program category, Start, Integrative Care, and campaign pages that need an image-backed intro without taking the full viewport.',
    searchAliases: ['program intro', 'sales hero', 'campaign hero', 'category hero', 'pathway hero'],
    tags: [
      ...HERO_TAGS,
      'bank:programs',
      'bank:integrative-care',
      'bank:start',
      'bank:offer',
      'page-type:programs',
      'page-type:integrative-care',
      'page-type:start',
      'page-type:offer',
      'content:cms-editable',
    ],
    previewMode: 'live',
    previewFixtures: [
      { id: 'pathway', label: 'Pathway page example', pageFamily: 'programs', viewport: 'desktop' },
    ],
  },
  'journal-hero': {
    humanNickname: 'Signed-in app shell hero',
    finderDescription:
      'Use as an app/home reference pattern when a signed-in surface needs navigation, score/progress context, and a large app-shell hero.',
    searchAliases: ['app hero', 'journal hero', 'signed in hero', 'dashboard hero', 'score hero'],
    tags: [...APP_REFERENCE_TAGS, 'family:hero', 'role:orient', 'page-type:journal', 'preview:live'],
    previewMode: 'live',
  },
  'feature-card': {
    humanNickname: 'Editorial image feature card',
    finderDescription:
      'Use for one strong feature, service, or pathway story with image, headline, short explanation, and CTA. Can also support carousel-style storytelling.',
    searchAliases: ['feature card', 'image card', 'service card', 'editorial card', 'carousel card'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'family:content', 'role:explain-benefit', 'content:cms-editable'],
    previewMode: 'live',
  },
  'grid-2col': {
    humanNickname: 'Two-column story grid',
    finderDescription:
      'Use when comparing or pairing two related public-site cards such as offers, pathways, resources, or next-step options.',
    searchAliases: ['two column grid', 'card grid', 'two cards', 'pathway cards', 'option grid'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'family:grid', 'role:show-options', 'content:cms-editable'],
    previewMode: 'live',
  },
  'grid-2col-medium': {
    humanNickname: 'Compact two-column story grid',
    finderDescription:
      'Use for shorter paired cards when the page needs a lighter grid than the full two-column story block.',
    searchAliases: ['compact grid', 'medium grid', 'two cards', 'short cards'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'family:grid', 'role:show-options', 'content:cms-editable'],
    previewMode: 'live',
  },
  'cta-banner': {
    humanNickname: 'Image-backed CTA banner',
    finderDescription:
      'Use when a page needs a strong conversion band with background image, short copy, and one primary action.',
    searchAliases: ['cta', 'conversion banner', 'image cta', 'final cta', 'signup band'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'bank:start', 'bank:offer', 'family:cta', 'role:convert', 'content:cms-editable'],
    previewMode: 'live',
  },
  button: {
    humanNickname: 'Button system reference',
    finderDescription:
      'Use to review the reusable button variants and understand which CTA styles are approved across public pages.',
    searchAliases: ['buttons', 'cta button', 'primary button', 'secondary button'],
    tags: ['surface:shared', 'family:cta', 'role:route', 'reference'],
    previewMode: 'fixture',
  },
  'buy-offer-button': {
    humanNickname: 'Checkout offer button',
    finderDescription:
      'Use as a reference for buttons that route to an offer checkout. Billing and entitlement truth must stay outside the style-guide metadata.',
    searchAliases: ['checkout button', 'buy button', 'offer button', 'purchase cta'],
    tags: ['surface:public_site', 'bank:offer', 'bank:start', 'family:cta', 'role:convert', 'guardrail:billing-truth-external'],
    previewMode: 'fixture',
  },
  'meal-section': {
    humanNickname: 'Logged meal section',
    finderDescription:
      'Use as an app reference for grouping meal entries and nutrition context inside the signed-in journal experience.',
    searchAliases: ['meal', 'food log', 'journal section', 'logged food'],
    tags: [...APP_REFERENCE_TAGS, 'family:card', 'role:present-user-truth', 'preview:live'],
    previewMode: 'live',
  },
  'aurora-background': {
    humanNickname: 'Aurora app background',
    finderDescription:
      'Use as a visual reference for ambient app backgrounds and branded atmosphere, not as a standalone public-site module.',
    searchAliases: ['aurora', 'ambient background', 'gradient background', 'app background'],
    tags: [...APP_REFERENCE_TAGS, 'family:ambient', 'role:atmosphere', 'reference'],
    previewMode: 'fixture',
  },

  /* ── Public pathway runtime modules ─────────────────────────────── */
  'hero-offer-blur-v1': {
    humanNickname: 'Blurred offer hero',
    finderDescription:
      'Use for public pathway and offer pages that need a strong image-backed hero with blur/overlay treatment and a primary CTA.',
    searchAliases: ['offer hero', 'integrative care hero', 'program hero', 'start hero', 'blur hero'],
    tags: [...HERO_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'bank:offer', 'page-type:integrative-care', 'page-type:programs', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'hero.offer-blur.v1',
  },
  'process-slide-stack-v1': {
    humanNickname: 'Practitioner process stack',
    finderDescription:
      'Use when explaining a multi-step guided or practitioner-supported pathway with images and step-by-step copy.',
    searchAliases: ['how it works', 'process stack', 'guided support', 'integrative care process'],
    tags: [...INTEGRATIVE_CARE_BANK_TAGS, 'family:content', 'role:explain-process', 'page-type:integrative-care'],
    previewMode: 'fixture',
    runtimeKey: 'process.slide-stack.v1',
  },
  'process-timed-steps-v1': {
    humanNickname: 'Timed how-it-works steps',
    finderDescription:
      'Use for Programs, Integrative Care, or Start pages that need a compact sequential explanation with timed or clickable steps.',
    searchAliases: ['timed steps', 'program process', 'integrative care process', 'start process', 'how it works'],
    tags: [...PROGRAM_BANK_TAGS, 'bank:integrative-care', 'bank:start', 'family:content', 'role:explain-process', 'page-type:programs', 'page-type:integrative-care', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'process.timed-steps.v1',
  },
  'process-numbered-cards-v1': {
    humanNickname: 'Numbered process cards',
    finderDescription:
      'Use for Start, Programs, or Integrative Care pages that need the promoted Start trial/process card pattern as a reusable rendered module.',
    searchAliases: ['trial process', 'numbered process', 'process cards', 'start process', 'onboarding cards', 'how it works'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'bank:start', 'bank:offer', 'family:content', 'role:explain-process', 'page-type:start', 'page-type:programs', 'page-type:integrative-care'],
    previewMode: 'fixture',
    runtimeKey: 'process.numbered-cards.v1',
  },
  'system-cards-scroller-v1': {
    humanNickname: 'System cards scroller',
    finderDescription:
      'Use for Start, Programs, or Integrative Care pages that need the promoted Start system-card rail as a reusable rendered module.',
    searchAliases: ['system cards', 'start system cards', 'card scroller', 'feature rail', 'capability cards', 'horizontal cards'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'bank:start', 'family:card', 'role:show-benefits', 'page-type:start', 'page-type:programs', 'page-type:integrative-care'],
    previewMode: 'fixture',
    runtimeKey: 'system.cards-scroller.v1',
  },
  'persuasion-simple-cta-v1': {
    humanNickname: 'Persuasion copy CTA',
    finderDescription:
      'Use for a persuasive list or paragraph CTA section that helps users understand why to choose a pathway or what to do next.',
    searchAliases: ['simple cta', 'persuasion block', 'list cta', 'paragraph cta'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'bank:offer', 'family:cta', 'role:convert'],
    previewMode: 'fixture',
    runtimeKey: 'persuasion.simple-cta.v1',
  },
  'ambient-marquee-strip-v1': {
    humanNickname: 'Pathway marquee strip',
    finderDescription:
      'Use as an ambient message strip between larger public pathway sections for brand rhythm and emphasis.',
    searchAliases: ['marquee', 'ticker', 'ambient strip', 'message strip'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'family:ambient', 'role:atmosphere', 'page-type:programs', 'page-type:integrative-care', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'ambient.marquee-strip.v1',
  },
  'case-study-scroll-cards-v1': {
    humanNickname: 'Proof / pathway card rail',
    finderDescription:
      'Use for case studies, featured pathways, proof cards, or Start-page proof rails that should scroll horizontally.',
    searchAliases: ['case studies', 'scroll cards', 'featured pathways', 'proof cards', 'card rail', 'start proof'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'family:card', 'role:show-proof', 'page-type:programs', 'page-type:integrative-care', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'case-study.scroll-cards.v1',
  },
  'faq-accordion-v2': {
    humanNickname: 'Pathway FAQ accordion',
    finderDescription:
      'Use for common questions on Programs, Integrative Care, Start, or offer pages. This is the preferred public-pathway FAQ pattern.',
    searchAliases: ['faq', 'questions', 'accordion', 'objections', 'pathway faq'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'bank:offer', 'family:content', 'role:answer-objections'],
    previewMode: 'fixture',
    runtimeKey: 'faq.accordion.v2',
  },
  'feature-reasons-split-v1': {
    humanNickname: 'Reasons split feature',
    finderDescription:
      'Use when a pathway needs to explain differentiators or numbered reasons beside an image.',
    searchAliases: ['reasons', 'differentiators', 'split feature', 'why it works'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:integrative-care', 'bank:programs', 'bank:start', 'family:content', 'role:explain-difference', 'page-type:programs', 'page-type:integrative-care', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'feature.reasons-split.v1',
  },
  'cta-program-offer-v1': {
    humanNickname: 'Program conversion CTA',
    finderDescription:
      'Use for Programs pages when the user should move toward a program offer, account creation, or next step.',
    searchAliases: ['program cta', 'program offer', 'get started', 'program conversion'],
    tags: [...PROGRAM_BANK_TAGS, 'family:cta', 'role:convert', 'page-type:programs'],
    previewMode: 'fixture',
    runtimeKey: 'cta.program-offer.v1',
  },
  'comparison-table-v1': {
    humanNickname: 'Pathway comparison table',
    finderDescription:
      'Use to compare programs, support levels, app access, care pathways, or offer options in a structured table/card format.',
    searchAliases: ['comparison', 'table', 'support levels', 'program comparison', 'care comparison', 'compare options'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'bank:start', 'bank:offer', 'family:grid', 'role:compare-options', 'page-type:programs', 'page-type:integrative-care', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'comparison.table.v1',
  },
  'feature-icon-tiles-v1': {
    humanNickname: 'Benefit icon tile grid',
    finderDescription:
      'Use for benefits, pillars, app capabilities, care-pathway features, or differentiators that should appear as a tile grid.',
    searchAliases: ['icon tiles', 'benefits', 'pillars', 'app features', 'care features', 'tiles'],
    tags: [...SHARED_PATHWAY_TAGS, 'bank:programs', 'bank:integrative-care', 'bank:start', 'family:grid', 'role:show-benefits', 'page-type:programs', 'page-type:integrative-care', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'feature.icon-tiles.v1',
  },
  'grid-program-cards-v1': {
    humanNickname: 'Program card grid',
    finderDescription:
      'Use for Programs index/category pages or Start pages that need to present available and coming-soon programs with centralized CTA behavior.',
    searchAliases: ['program cards', 'program grid', 'nutrition programs', 'category cards', 'available soon', 'start programs'],
    tags: [...PROGRAM_BANK_TAGS, 'bank:start', 'family:grid', 'role:show-options', 'page-type:programs', 'page-type:start'],
    previewMode: 'fixture',
    runtimeKey: 'grid.program-cards.v1',
  },
  'nav-program-pathway-v1': {
    humanNickname: 'Program pathway navigation',
    finderDescription:
      'Use for Programs/pathway pages that need navigation across categories, series, or page sections.',
    searchAliases: ['program nav', 'pathway nav', 'category nav', 'section nav'],
    tags: [...PROGRAM_BANK_TAGS, 'family:navigation', 'role:route', 'page-type:programs'],
    previewMode: 'fixture',
    runtimeKey: 'nav.program-pathway.v1',
  },
  'pricing-tiers-v1': {
    humanNickname: 'Offer pricing selector',
    finderDescription:
      'Use for Start, offer, or purchase pages that need pricing cards. Presentation only; billing truth stays outside metadata.',
    searchAliases: ['pricing', 'tiers', 'offer options', 'start pricing', 'plans'],
    tags: [...START_BANK_TAGS, 'family:cta', 'role:choose-access', 'guardrail:billing-truth-external'],
    previewMode: 'fixture',
    runtimeKey: 'pricing.tiers.v1',
  },
};

export function getCanonicalRuntimeModuleKey(mod: ModuleDefinition): string | undefined {
  return getDefaultMetadataForSlug(mod.slug)?.runtimeKey;
}

export function mergeModuleDiscoveryMetadata(
  base: ModuleDiscoveryMetadata,
  override?: ModuleDiscoveryMetadata,
): ModuleDiscoveryMetadata {
  if (!override) return base;

  return {
    ...base,
    ...stripEmptyMetadata(override),
    searchAliases: override.searchAliases ?? base.searchAliases,
    tags: override.tags ?? base.tags,
    previewFixtures: override.previewFixtures ?? base.previewFixtures,
  };
}

export function getModuleDiscoveryMetadata(
  mod: ModuleDefinition,
  overrides?: ModuleDiscoveryMetadataMap,
): ModuleDiscoveryMetadata {
  const base = getDefaultMetadataForSlug(mod.slug) ?? inferModuleDiscoveryMetadata(mod);
  return mergeModuleDiscoveryMetadata(base, getOverrideMetadataForSlug(mod.slug, overrides));
}

export function getModuleDisplayName(
  mod: ModuleDefinition,
  overrides?: ModuleDiscoveryMetadataMap,
): string {
  return getModuleDiscoveryMetadata(mod, overrides).humanNickname ?? mod.name;
}

export function getModuleFinderDescription(
  mod: ModuleDefinition,
  overrides?: ModuleDiscoveryMetadataMap,
): string {
  return getModuleDiscoveryMetadata(mod, overrides).finderDescription ?? mod.description;
}

export function getModuleSearchTokens(
  mod: ModuleDefinition,
  overrides?: ModuleDiscoveryMetadataMap,
): string[] {
  const metadata = getModuleDiscoveryMetadata(mod, overrides);
  const legacySlug = getLegacyRuntimeSlug(mod.slug);
  return [
    mod.slug,
    legacySlug,
    mod.name,
    mod.description,
    mod.componentPath,
    mod.category,
    mod.theme,
    metadata.humanNickname,
    metadata.finderDescription,
    metadata.runtimeKey,
    ...(metadata.searchAliases ?? []),
    ...(metadata.tags ?? []),
    ...mod.usedOn,
    ...mod.variants,
  ].filter((value): value is string => Boolean(value));
}

function getDefaultMetadataForSlug(slug: string): ModuleDiscoveryMetadata | undefined {
  return DEFAULT_MODULE_DISCOVERY_METADATA[slug] ?? DEFAULT_MODULE_DISCOVERY_METADATA[getLegacyRuntimeSlug(slug) ?? ''];
}

function getOverrideMetadataForSlug(
  slug: string,
  overrides?: ModuleDiscoveryMetadataMap,
): ModuleDiscoveryMetadata | undefined {
  if (!overrides) return undefined;
  return overrides[slug] ?? overrides[getLegacyRuntimeSlug(slug) ?? ''];
}

function getLegacyRuntimeSlug(slug: string): string | undefined {
  if (!slug.includes('.')) return undefined;
  return slug.replace(/\./g, '-');
}

function stripEmptyMetadata(metadata: ModuleDiscoveryMetadata): ModuleDiscoveryMetadata {
  const cleaned: ModuleDiscoveryMetadata = {};

  if (metadata.humanNickname?.trim()) cleaned.humanNickname = metadata.humanNickname.trim();
  if (metadata.finderDescription?.trim()) cleaned.finderDescription = metadata.finderDescription.trim();
  if (metadata.runtimeKey?.trim()) cleaned.runtimeKey = metadata.runtimeKey.trim();
  if (metadata.previewMode) cleaned.previewMode = metadata.previewMode;
  if (metadata.searchAliases) cleaned.searchAliases = metadata.searchAliases.filter(Boolean);
  if (metadata.tags) cleaned.tags = metadata.tags.filter(Boolean);
  if (metadata.previewFixtures) cleaned.previewFixtures = metadata.previewFixtures;

  return cleaned;
}

function inferModuleDiscoveryMetadata(mod: ModuleDefinition): ModuleDiscoveryMetadata {
  const categoryTags = getCategoryTags(mod.category);
  return {
    humanNickname: mod.name,
    finderDescription: mod.description,
    searchAliases: [mod.name, mod.slug, mod.category],
    tags: categoryTags,
    previewMode: 'abstract',
  };
}

function getCategoryTags(category: ModuleCategory): string[] {
  switch (category) {
    case 'hero':
      return ['family:hero', 'role:orient'];
    case 'content':
      return ['family:content', 'role:explain'];
    case 'grid':
      return ['family:grid', 'role:show-options'];
    case 'cta':
      return ['family:cta', 'role:convert'];
    case 'card':
      return ['family:card', 'role:present'];
    case 'form':
      return ['family:form', 'role:capture'];
    case 'ambient':
      return ['family:ambient', 'role:atmosphere'];
    case 'layout':
      return ['family:layout', 'role:structure'];
    case 'navigation':
      return ['family:navigation', 'role:route'];
    default:
      return [];
  }
}
