import type { ModuleDefinition } from '@/lib/moduleRegistry';

function moduleProps(options: {
  backgroundType?: ModuleDefinition['properties']['backgroundType'];
  headlineSize?: string;
  bodySize?: string;
  textAlignment?: 'center' | 'left';
  contentPosition?: ModuleDefinition['properties']['contentPosition'];
  cornerRadius?: string;
  maxWidth?: string;
  height?: string;
  hasOverlay?: boolean;
  hasButtons?: boolean;
  buttonVariants?: string[];
  responsiveNotes?: string;
}): ModuleDefinition['properties'] {
  return {
    backgroundType: options.backgroundType ?? ['solid'],
    headlineSize: options.headlineSize ?? '2xl–4xl',
    headlineWeight: 'font-semibold (600)',
    bodySize: options.bodySize ?? 'sm/base',
    bodyWeight: 'font-light / regular depending on module',
    textAlignment: options.textAlignment ?? 'left',
    contentPosition: options.contentPosition ?? 'top-left',
    cornerRadius: options.cornerRadius ?? 'rounded cards / module-defined shell',
    maxWidth: options.maxWidth ?? 'section container',
    height: options.height ?? 'content-driven',
    responsiveNotes: options.responsiveNotes ?? 'Responsive public pathway module; exact behavior owned by runtime component.',
    hasOverlay: options.hasOverlay ?? false,
    hasButtons: options.hasButtons ?? false,
    buttonVariants: options.buttonVariants,
    isContentDriven: true,
  };
}

export const PUBLIC_PATHWAY_SHARED_SECTION_MODULE_STYLE_CATALOG: ModuleDefinition[] = [
  {
    slug: 'system.cards-scroller.v1',
    name: 'System Cards Scroller V1',
    description:
      'Start-style horizontal card scroller for app/system capabilities, pathway benefits, proof points, or feature education.',
    componentPath: '@/components/modules/SystemCardsScrollerV1',
    category: 'card',
    usedOn: ['/start/[slug]', '/programs', '/programs/[categorySlug]', '/integrative-care/[productSlug]'],
    theme: 'both',
    properties: moduleProps({
      backgroundType: ['solid', 'image'],
      headlineSize: '3xl–4xl section heading + card headlines',
      cornerRadius: 'rounded-2xl cards',
      responsiveNotes: 'Horizontal snap scroller with optional auto-advance and responsive card widths.',
    }),
    variants: ['dark-surface', 'light-surface', 'three-card-rail'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, images: true },
    dataContract: {
      contentSource: 'runtime composition JSON → system.cards-scroller.v1',
      requiredProps: ['heading', 'cards[]'],
      optionalProps: ['intro', 'surface', 'cards[].eyebrow', 'cards[].imageAlt'],
      fallbackStates: ['ready', 'empty'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Presentation-only. Do not use card content to define pricing, trial enforcement, grants, or entitlement truth.'],
    },
  },
  {
    slug: 'process.numbered-cards.v1',
    name: 'Process Numbered Cards V1',
    description:
      'Start-style numbered process cards for trial education, onboarding, method steps, or pathway explanation.',
    componentPath: '@/components/modules/ProcessNumberedCardsV1',
    category: 'content',
    usedOn: ['/start/[slug]', '/programs', '/programs/[categorySlug]', '/integrative-care/[productSlug]'],
    theme: 'both',
    properties: moduleProps({
      backgroundType: ['solid'],
      headlineSize: '3xl–4xl section heading + small card headings',
      cornerRadius: 'rounded-2xl cards',
      responsiveNotes: 'Two-column process cards on larger screens; single column on mobile.',
    }),
    variants: ['dark-surface', 'light-surface', 'four-step-process'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true },
    dataContract: {
      contentSource: 'runtime composition JSON → process.numbered-cards.v1',
      requiredProps: ['heading', 'steps[]'],
      optionalProps: ['eyebrow', 'intro', 'surface'],
      fallbackStates: ['ready', 'empty'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: ['Presentation-only. Trial, billing, checkout, and entitlement behavior must remain outside this module.'],
    },
  },
];
