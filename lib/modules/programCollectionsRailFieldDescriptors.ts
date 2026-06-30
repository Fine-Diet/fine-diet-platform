import type { ModuleFieldDescriptorMap } from './fieldDescriptors';

export const PROGRAM_COLLECTIONS_RAIL_FIELD_DESCRIPTORS: ModuleFieldDescriptorMap = {
  'grid.program-collections-rail.v1': [
    {
      key: 'heading',
      label: 'Section heading',
      type: 'textarea',
      optional: true,
      placeholder: 'Begin with nutrition, then follow your signals',
      hint: 'Leave blank to use the default Programs rail heading.',
    },
    {
      key: 'intro',
      label: 'Intro copy',
      type: 'textarea',
      optional: true,
      placeholder: 'Each pathway is a public overview. Active enrollment and delivery live in the signed-in app.',
    },
    {
      key: 'collectionSlugs',
      label: 'Collection slugs',
      type: 'string-list',
      optional: true,
      placeholder: 'nutrition',
      hint: 'Optional ordered filter. Leave empty to render all published Program Collections from the catalogue.',
    },
    {
      key: 'featuredCollectionSlug',
      label: 'Featured collection slug',
      type: 'text',
      optional: true,
      placeholder: 'nutrition',
      hint: 'Controls the wide CTA beneath the rail. Defaults to nutrition.',
    },
    {
      key: 'featuredEyebrow',
      label: 'Featured card eyebrow',
      type: 'text',
      optional: true,
      placeholder: 'Start here',
      group: 'Card labels',
    },
    {
      key: 'secondaryEyebrow',
      label: 'Other card eyebrow',
      type: 'text',
      optional: true,
      placeholder: 'Coming soon',
      group: 'Card labels',
    },
    {
      key: 'ctaNote',
      label: 'Wide CTA note',
      type: 'textarea',
      optional: true,
      placeholder: 'Start with Baseline in Nutrition Foundations — the featured pathway most members begin with.',
      group: 'CTA',
    },
    {
      key: 'showFeaturedCta',
      label: 'Show wide CTA under rail',
      type: 'boolean',
      optional: true,
      group: 'CTA',
      hint: 'Defaults to on. CTA label/link resolve from the featured Program Collection.',
    },
  ],
};
