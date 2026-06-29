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

const STARTER_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

export function createStartRuntimeModuleStarterContent(
  type: StartRuntimeModuleTypeKey,
): Record<string, unknown> {
  switch (type) {
    case 'process.timed-steps.v1':
      return {
        heading: 'A clear sequence for getting started',
        steps: [
          {
            stepNumber: 1,
            label: 'Step 1',
            title: 'Choose your starting point',
            description: 'Pick the path that matches what the visitor is trying to accomplish.',
          },
          {
            stepNumber: 2,
            label: 'Step 2',
            title: 'Build a repeatable rhythm',
            description: 'Use the system to create logs, plans, and habits that can actually repeat.',
          },
          {
            stepNumber: 3,
            label: 'Step 3',
            title: 'Decide the next best step',
            description: 'Use patterns and progress to continue, adjust, or choose a focused program.',
          },
        ],
      };
    case 'persuasion.simple-cta.v1':
      return {
        heading: 'Make the next step feel obvious.',
        intro: 'Use this block to explain why this page is the right starting point.',
        items: ['Clarify the promise.', 'Reduce uncertainty.', 'Point toward the next action.'],
        ctaLabel: 'Continue',
        ctaHref: '#plans',
        variant: 'list',
      };
    case 'ambient.marquee-strip.v1':
      return {
        text: 'Plan better • Log with context • Learn your rhythm • Repeat what works •',
        speed: 32,
        direction: 'left',
        pauseOnHover: true,
      };
    case 'case-study.scroll-cards.v1':
      return {
        sectionHeading: 'What becomes clearer with a system',
        cards: [
          {
            id: 'proof-one',
            imageDesktop: STARTER_IMAGE,
            imageMobile: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview card',
            before: 'Before: meals and symptoms felt disconnected.',
            breakthrough: 'Breakthrough: patterns became easier to see.',
            after: 'After: the next step felt more specific.',
          },
          {
            id: 'proof-two',
            imageDesktop: STARTER_IMAGE,
            imageMobile: STARTER_IMAGE,
            imageAlt: 'Fine Diet preview card',
            before: 'Before: each week started from scratch.',
            breakthrough: 'Breakthrough: repeatable templates reduced decisions.',
            after: 'After: consistency became easier to maintain.',
          },
        ],
      };
    case 'faq.accordion.v2':
      return {
        title: 'Questions before you start',
        defaultOpenIndex: 0,
        items: [
          {
            id: 'faq-one',
            question: 'Where does this fit?',
            answer: 'Use this section to answer the most important question before the visitor chooses a next step.',
          },
          {
            id: 'faq-two',
            question: 'Can this content be edited?',
            answer: 'Yes. Edit the question and answer fields for the specific Start page.',
          },
        ],
      };
    case 'feature.reasons-split.v1':
      return {
        heading: 'Why this path works better than guessing.',
        body: 'Use this section to explain the main reasons behind the offer, program, or pathway.',
        items: [
          { label: '01', sentence: 'It starts from the visitor’s real rhythm.' },
          { label: '02', sentence: 'It turns repeated patterns into practical next steps.' },
          { label: '03', sentence: 'It keeps the decision focused instead of overwhelming.' },
        ],
        imageDesktop: STARTER_IMAGE,
        imageMobile: STARTER_IMAGE,
        imageAlt: 'Fine Diet preview image',
        ctaLabel: 'See plans',
        ctaHref: '#plans',
        ctaTone: 'denim',
      };
    case 'comparison.table.v1':
      return {
        heading: 'A clearer way to choose your nutrition path',
        columns: { left: 'Fine Diet', right: 'Generic tracking' },
        rows: [
          {
            label: 'Starting point',
            left: 'Uses your logs, rhythm, and real life.',
            right: 'Starts from a generic template.',
          },
          {
            label: 'Next step',
            left: 'Routes toward the right program or support level.',
            right: 'Leaves the next decision unclear.',
          },
        ],
      };
    case 'feature.icon-tiles.v1':
      return {
        heading: 'What users get from the system',
        intro: 'Use these tiles for benefits, pillars, or app capabilities.',
        surface: 'dark',
        tiles: [
          {
            icon: 'notebook',
            title: 'Guided logging',
            description: 'Capture meals and body signals with context.',
          },
          {
            icon: 'insights',
            title: 'Pattern clarity',
            description: 'Turn repeated logs into useful next steps.',
          },
          {
            icon: 'programs',
            title: 'Programs',
            description: 'Follow staged pathways as they become available.',
          },
        ],
      };
    case 'grid.program-cards.v1':
      return {
        collectionSlug: 'nutrition',
        heading: 'Nutrition Foundations',
        subhead: 'A resolver-driven grid that routes visitors into the program catalogue.',
      };
    default:
      return {};
  }
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
