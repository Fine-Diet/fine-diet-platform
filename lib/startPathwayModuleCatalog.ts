/**
 * Start / Launch Module Catalog
 *
 * Discovery-only entries for the hardened /start and /start/[slug] sections.
 * These are middleware/config-controlled StartView sections, not billing or
 * entitlement controls. They intentionally sit beside the public pathway runtime
 * catalog so Start/Launch modules can be selected and discussed as a bank.
 */

import type { ModuleDefinition } from '@/lib/moduleRegistry';

function startProps(options: {
  backgroundType?: ModuleDefinition['properties']['backgroundType'];
  categoryShape?: 'hero' | 'rail' | 'cards' | 'process' | 'pricing' | 'faq' | 'cta';
  headlineSize?: string;
  bodySize?: string;
  textAlignment?: 'center' | 'left';
  contentPosition?: ModuleDefinition['properties']['contentPosition'];
  height?: string;
  hasOverlay?: boolean;
  hasButtons?: boolean;
  buttonVariants?: string[];
  responsiveNotes?: string;
}): ModuleDefinition['properties'] {
  return {
    backgroundType: options.backgroundType ?? ['solid'],
    headlineSize: options.headlineSize ?? 'section-defined',
    headlineWeight: 'font-semibold (600)',
    bodySize: options.bodySize ?? 'sm/base',
    bodyWeight: 'font-light / regular depending on section',
    textAlignment: options.textAlignment ?? 'left',
    contentPosition: options.contentPosition ?? 'top-left',
    cornerRadius: 'section-defined',
    maxWidth: 'StartView container',
    height: options.height ?? 'content-driven',
    responsiveNotes:
      options.responsiveNotes ??
      'Controlled by StartTemplateConfig and rendered by components/offers/StartView.tsx.',
    hasOverlay: options.hasOverlay ?? false,
    hasButtons: options.hasButtons ?? false,
    buttonVariants: options.buttonVariants ?? [],
    isContentDriven: true,
  };
}

export const START_PATHWAY_MODULE_STYLE_CATALOG: ModuleDefinition[] = [
  {
    slug: 'start-hero-section',
    name: 'Start Hero Section',
    description:
      'The primary /start opening section: image-backed hero, offer-aware eyebrow, headline/subheadline, CTA, and configurable overlay strength.',
    componentPath: '@/components/offers/StartView#hero',
    category: 'hero',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['image'],
      textAlignment: 'center',
      contentPosition: 'center',
      height: 'large hero',
      hasOverlay: true,
      hasButtons: true,
      buttonVariants: ['primary'],
      responsiveNotes:
        'Controlled by StartTemplateConfig.hero; renders unless sections.hero is explicitly false.',
    }),
    variants: ['light-overlay', 'medium-overlay', 'dark-overlay'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true, images: true, buttons: true },
    dataContract: {
      contentSource: 'start_pages.config_json → hero',
      requiredProps: ['primaryOffer'],
      optionalProps: ['hero.eyebrow', 'hero.headline', 'hero.subheadline', 'hero.ctaNote', 'hero.image', 'hero.overlay'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Presentation only; checkout routing remains owned by StartView and offer/billing data.'],
    },
  },
  {
    slug: 'start-hero-rail',
    name: 'Start Hero Rail',
    description:
      'The scrolling phrase rail attached to the Start hero. Useful for short brand/system promises under the opening moment.',
    componentPath: '@/components/offers/StartView#HeroBottomRail',
    category: 'ambient',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['solid'],
      headlineSize: 'marquee text',
      textAlignment: 'center',
      contentPosition: 'center',
      height: 'compact rail',
      responsiveNotes:
        'Controlled by StartTemplateConfig.heroRail.items; renders unless sections.heroRail is explicitly false.',
    }),
    variants: ['marquee-phrases'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'start_pages.config_json → heroRail.items',
      optionalProps: ['heroRail.items[]'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
  },
  {
    slug: 'start-system-cards',
    name: 'Start System Cards',
    description:
      'Horizontally scrolling cards for explaining what the Fine Diet system includes: plan, log, learn, repeat, programs, and app capabilities.',
    componentPath: '@/components/offers/StartView#SystemCardsScroller',
    category: 'card',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['image', 'solid'],
      headlineSize: 'section heading + card headlines',
      height: 'scroll card section',
      responsiveNotes:
        'Controlled by StartTemplateConfig.systemCards; cards scroll horizontally and use configurable images/copy.',
    }),
    variants: ['system-scroll-cards'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'start_pages.config_json → systemCards',
      optionalProps: ['systemCards.heading', 'systemCards.intro', 'systemCards.cards[]'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
  },
  {
    slug: 'start-trial-process',
    name: 'Start Trial Process',
    description:
      'The Start process section explaining the trial or launch sequence: choose access, create account, use the system, continue or cancel.',
    componentPath: '@/components/offers/StartView#trial',
    category: 'content',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['solid'],
      headlineSize: 'section heading + process steps',
      responsiveNotes:
        'Controlled by StartTemplateConfig.trial; step copy is editable but trial enforcement stays outside config.',
    }),
    variants: ['trial-steps', 'launch-steps'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'start_pages.config_json → trial',
      optionalProps: ['trial.eyebrow', 'trial.heading', 'trial.intro', 'trial.steps[]'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Trial enforcement, subscription timing, and billing rules are not controlled by this module.'],
    },
  },
  {
    slug: 'start-pricing-section',
    name: 'Start Pricing Section',
    description:
      'The offer-aware pricing module on Start pages. It displays approved price options but does not own Stripe IDs, billing logic, or entitlement grants.',
    componentPath: '@/components/offers/StartView#pricing',
    category: 'cta',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['solid'],
      headlineSize: 'pricing heading + card copy',
      hasButtons: true,
      buttonVariants: ['checkout'],
      responsiveNotes:
        'Copy controlled by StartTemplateConfig.pricing; cards come from approved price options and PricingModuleDTO.',
    }),
    variants: ['auto', 'two-up', 'three-up-stack', 'four-up', 'two-by-two'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true, buttons: false },
    dataContract: {
      contentSource: 'price_options / PricingModuleDTO + start_pages.config_json → pricing copy',
      requiredProps: ['primaryOffer', 'priceOptionKeys'],
      optionalProps: ['pricing.heading', 'pricing.intro', 'pricingLayout'],
      fallbackStates: ['ready', 'fallback-plan-options'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Billing truth, Stripe price IDs, trials, and entitlements must stay in Offers & Bundles.'],
    },
  },
  {
    slug: 'start-faq-section',
    name: 'Start FAQ Section',
    description:
      'The Start FAQ block for answering trial, billing, program inclusion, and access questions before checkout.',
    componentPath: '@/components/offers/StartView#faq',
    category: 'content',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['solid'],
      headlineSize: 'FAQ title + question rows',
      responsiveNotes: 'Controlled by StartTemplateConfig.faq and rendered with the approved FAQ accordion component.',
    }),
    variants: ['default-open', 'all-closed'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'start_pages.config_json → faq',
      optionalProps: ['faq.title', 'faq.items[]'],
      fallbackStates: ['ready'],
    },
    governance: { cmsEditable: true, developerOwned: true },
  },
  {
    slug: 'start-final-cta',
    name: 'Start Final CTA',
    description:
      'The closing Start CTA that restates the access promise and routes users back to plan selection or the app depending on access state.',
    componentPath: '@/components/offers/StartView#finalCta',
    category: 'cta',
    usedOn: ['/start', '/start/[slug]'],
    theme: 'dark',
    properties: startProps({
      backgroundType: ['solid'],
      headlineSize: 'large closing headline',
      textAlignment: 'center',
      contentPosition: 'center',
      hasButtons: true,
      buttonVariants: ['primary'],
      responsiveNotes: 'Controlled by StartTemplateConfig.finalCta; CTA destination remains StartView-owned.',
    }),
    variants: ['trial-close', 'launch-close', 'app-access-close'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'page_specific',
    editableFields: { copy: true, buttons: false },
    dataContract: {
      contentSource: 'start_pages.config_json → finalCta',
      optionalProps: ['finalCta.heading', 'finalCta.note'],
      fallbackStates: ['ready'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['CTA destination is derived from access state and StartView, not editable metadata.'],
    },
  },
];
