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
] as const;

const HERO_TAGS = [
  ...SHARED_PATHWAY_TAGS,
  'family:hero',
  'role:orient',
] as const;

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
    tags: ['surface:signed_in_app', 'family:hero', 'role:orient', 'page-type:journal', 'preview:live'],
    previewMode: 'live',
  },
  'feature-card': {
    humanNickname: 'Editorial image feature card',
    finderDescription:
      'Use for one strong feature, service, or pathway story with image, headline, short explanation, and CTA. Can also support carousel-style storytelling.',
    searchAliases: ['feature card', 'image card', 'service card', 'editorial card', 'carousel card'],
    tags: [...SHARED_PATHWAY_TAGS, 'family:content', 'role:explain-benefit', 'content:cms-editable'],
    previewMode: 'live',
  },
  'grid-2col': {
    humanNickname: 'Two-column story grid',
    finderDescription:
      'Use when comparing or pairing two related public-site cards such as offers, pathways, resources, or next-step options.',
    searchAliases: ['two column grid', 'card grid', 'two cards', 'pathway cards', 'option grid'],
    tags: [...SHARED_PATHWAY_TAGS, 'family:grid', 'role:show-options', 'content:cms-editable'],
    previewMode: 'live',
  },
  'grid-2col-medium': {
    humanNickname: 'Compact two-column story grid',
    finderDescription:
      'Use for shorter paired cards when the page needs a lighter grid than the full two-column story block.',
    searchAliases: ['compact grid', 'medium grid', 'two cards', 'short cards'],
    tags: [...SHARED_PATHWAY_TAGS, 'family:grid', 'role:show-options', 'content:cms-editable'],
    previewMode: 'live',
  },
  'cta-banner': {
    humanNickname: 'Image-backed CTA banner',
    finderDescription:
      'Use when a page needs a strong conversion band with background image, short copy, and one primary action.',
    searchAliases: ['cta', 'conversion banner', 'image cta', 'final cta', 'signup band'],
    tags: [...SHARED_PATHWAY_TAGS, 'family:cta', 'role:convert', 'content:cms-editable'],
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
    tags: ['surface:public_site', 'family:cta', 'role:convert', 'guardrail:billing-truth-external'],
    previewMode: 'fixture',
  },
  'meal-section': {
    humanNickname: 'Logged meal section',
    finderDescription:
      'Use as an app reference for grouping meal entries and nutrition context inside the signed-in journal experience.',
    searchAliases: ['meal', 'food log', 'journal section', 'logged food'],
    tags: ['surface:signed_in_app', 'family:card', 'role:present-user-truth', 'preview:live'],
    previewMode: 'live',
  },
  'aurora-background': {
    humanNickname: 'Aurora app background',
    finderDescription:
      'Use as a visual reference for ambient app backgrounds and branded atmosphere, not as a standalone public-site module.',
    searchAliases: ['aurora', 'ambient background', 'gradient background', 'app background'],
    tags: ['surface:signed_in_app', 'family:ambient', 'role:atmosphere', 'reference'],
    previewMode: 'fixture',
  },
};

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
  const base = DEFAULT_MODULE_DISCOVERY_METADATA[mod.slug] ?? inferModuleDiscoveryMetadata(mod);
  return mergeModuleDiscoveryMetadata(base, overrides?.[mod.slug]);
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
  return [
    mod.slug,
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
