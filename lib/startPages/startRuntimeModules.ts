import { z } from 'zod';

import { MODULE_CONTENT_SCHEMAS } from '@/lib/modules/schema';
import type { ModuleTypeKey } from '@/lib/modules/types';

/**
 * Runtime module zones that Start pages may render.
 *
 * These are presentation-only insertion points inside the hardened StartView.
 * Pricing, checkout, trial logic, offer routing, and entitlements remain owned by
 * the existing Start/Offers systems.
 */
export const START_RUNTIME_MODULE_ZONE_KEYS = [
  'afterHero',
  'afterSystemCards',
  'beforePricing',
  'afterPricing',
  'beforeFinalCta',
] as const;

export type StartRuntimeModuleZoneKey = (typeof START_RUNTIME_MODULE_ZONE_KEYS)[number];

/**
 * Safe reusable runtime modules for Start/Launch pages.
 *
 * Intentionally excludes pricing.tiers.v1, hero.offer-blur.v1, and
 * cta.program-offer.v1 so /start cannot override billing-adjacent controls or
 * replace the hardened Start hero/CTA behavior through config_json.
 */
export const START_RUNTIME_MODULE_TYPE_KEYS = [
  'process.timed-steps.v1',
  'persuasion.simple-cta.v1',
  'ambient.marquee-strip.v1',
  'case-study.scroll-cards.v1',
  'faq.accordion.v2',
  'feature.reasons-split.v1',
  'comparison.table.v1',
  'feature.icon-tiles.v1',
  'grid.program-cards.v1',
] as const satisfies readonly ModuleTypeKey[];

export type StartRuntimeModuleTypeKey = (typeof START_RUNTIME_MODULE_TYPE_KEYS)[number];

export type StartRuntimeModuleBank = 'start' | 'programs' | 'integrative-care' | 'offer';

export interface StartRuntimeModuleTaxonomyItem {
  type: StartRuntimeModuleTypeKey;
  label: string;
  description: string;
  recommendedZones: StartRuntimeModuleZoneKey[];
  usefulFor: StartRuntimeModuleBank[];
}

export const START_RUNTIME_MODULE_TAXONOMY: StartRuntimeModuleTaxonomyItem[] = [
  {
    type: 'process.timed-steps.v1',
    label: 'Timed process steps',
    description: 'Compact how-it-works sequence for Start, program, or pathway education.',
    recommendedZones: ['afterHero', 'afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'persuasion.simple-cta.v1',
    label: 'Persuasion CTA block',
    description: 'Short persuasive copy block before or after a decision point.',
    recommendedZones: ['beforePricing', 'afterPricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'ambient.marquee-strip.v1',
    label: 'Ambient marquee strip',
    description: 'Lightweight brand rhythm and repeated promise strip between sections.',
    recommendedZones: ['afterHero', 'afterSystemCards'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'case-study.scroll-cards.v1',
    label: 'Proof card rail',
    description: 'Horizontal proof, case-study, or featured-pathway cards.',
    recommendedZones: ['afterSystemCards', 'afterPricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'faq.accordion.v2',
    label: 'Pathway FAQ',
    description: 'Accordion for objections, questions, or next-step clarity.',
    recommendedZones: ['afterPricing', 'beforeFinalCta'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'feature.reasons-split.v1',
    label: 'Reasons split feature',
    description: 'Image-and-reasons section for differentiators or why-it-works content.',
    recommendedZones: ['afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'comparison.table.v1',
    label: 'Pathway comparison table',
    description: 'Structured comparison for programs, support levels, app access, or choices.',
    recommendedZones: ['beforePricing', 'afterPricing'],
    usefulFor: ['start', 'programs', 'integrative-care', 'offer'],
  },
  {
    type: 'feature.icon-tiles.v1',
    label: 'Benefit icon tiles',
    description: 'Tile grid for benefits, pillars, system capabilities, or differentiators.',
    recommendedZones: ['afterSystemCards', 'beforePricing'],
    usefulFor: ['start', 'programs', 'integrative-care'],
  },
  {
    type: 'grid.program-cards.v1',
    label: 'Program card grid',
    description: 'Program catalogue grid; strongest fit for Start pages that route into Programs.',
    recommendedZones: ['afterSystemCards', 'beforeFinalCta'],
    usefulFor: ['start', 'programs'],
  },
];

export function getStartRuntimeModuleTaxonomy(
  type: StartRuntimeModuleTypeKey,
): StartRuntimeModuleTaxonomyItem | undefined {
  return START_RUNTIME_MODULE_TAXONOMY.find((item) => item.type === type);
}

export interface StartRuntimeModuleInstance {
  id: string;
  type: StartRuntimeModuleTypeKey;
  content: Record<string, unknown>;
}

export type StartRuntimeModuleZones = Partial<
  Record<StartRuntimeModuleZoneKey, StartRuntimeModuleInstance[]>
>;

const startRuntimeModuleTypeSchema = z.enum(START_RUNTIME_MODULE_TYPE_KEYS);

export const startRuntimeModuleInstanceSchema = z
  .object({
    id: z.string().min(1),
    type: startRuntimeModuleTypeSchema,
    content: z.record(z.string(), z.unknown()),
  })
  .strip()
  .superRefine((module, ctx) => {
    const schema = MODULE_CONTENT_SCHEMAS[module.type];
    const validation = schema.safeParse(module.content);
    if (!validation.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid content for ${module.type}: ${validation.error.message}`,
      });
    }
  });

export const startRuntimeModuleZonesSchema = z
  .object({
    afterHero: z.array(startRuntimeModuleInstanceSchema).optional(),
    afterSystemCards: z.array(startRuntimeModuleInstanceSchema).optional(),
    beforePricing: z.array(startRuntimeModuleInstanceSchema).optional(),
    afterPricing: z.array(startRuntimeModuleInstanceSchema).optional(),
    beforeFinalCta: z.array(startRuntimeModuleInstanceSchema).optional(),
  })
  .strip();
