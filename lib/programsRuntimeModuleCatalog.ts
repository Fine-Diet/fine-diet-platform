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
    headlineSize: options.headlineSize ?? '3xl–4xl section heading + card titles',
    headlineWeight: 'font-semibold (600)',
    bodySize: options.bodySize ?? 'sm/base',
    bodyWeight: 'font-light / regular depending on module',
    textAlignment: options.textAlignment ?? 'left',
    contentPosition: options.contentPosition ?? 'top-left',
    cornerRadius: options.cornerRadius ?? 'rounded-2xl pathway cards',
    maxWidth: options.maxWidth ?? 'content column + overflow rail',
    height: options.height ?? 'content-driven',
    responsiveNotes:
      options.responsiveNotes ??
      'Horizontally scrolling Collection rail with dot navigation and reduced-motion-safe auto-scroll.',
    hasOverlay: options.hasOverlay ?? false,
    hasButtons: options.hasButtons ?? true,
    buttonVariants: options.buttonVariants ?? ['quinary', 'primary'],
    isContentDriven: true,
  };
}

export const PROGRAMS_RUNTIME_MODULE_STYLE_CATALOG: ModuleDefinition[] = [
  {
    slug: 'grid.program-collections-rail.v1',
    name: 'Program Collections Rail V1',
    description:
      'Resolver-driven horizontal rail of Program Collection cards for the Programs index or pathway overview pages.',
    componentPath: '@/components/modules/GridProgramCollectionsRailV1',
    category: 'card',
    usedOn: ['/programs', '/programs/[categorySlug]'],
    theme: 'dark',
    properties: moduleProps({}),
    variants: ['programs-index-featured-pathways', 'collection-card-rail'],
    status: 'stable',
    lifecycle: 'approved',
    surface: 'public_site',
    reusability: 'needs_data',
    editableFields: { copy: true, buttons: false, images: false },
    dataContract: {
      contentSource: 'runtime composition JSON + Programs catalogue → grid.program-collections-rail.v1',
      requiredProps: [],
      optionalProps: [
        'heading',
        'intro',
        'collectionSlugs[]',
        'featuredCollectionSlug',
        'featuredEyebrow',
        'secondaryEyebrow',
        'ctaNote',
        'showFeaturedCta',
      ],
      fallbackStates: ['ready', 'empty'],
    },
    governance: {
      cmsEditable: true,
      developerOwned: true,
      safetyNotes: [
        'Collection cards, images, order, and CTA behavior resolve from the Programs catalogue.',
        'Module content should not invent Program access or availability truth.',
      ],
    },
  },
];
