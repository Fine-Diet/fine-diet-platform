/**
 * Module System v1 — Module Registry
 *
 * Maps each module type key to its runtime Zod schema and React component.
 *
 * This is distinct from lib/moduleRegistry.ts (style-guide metadata catalog).
 * Import path: @/lib/modules/registry  (note the /modules/ sub-path)
 */

import type { z } from 'zod';
import type React from 'react';

import {
  heroStandardV1Schema,
  featureSplitMediaV1Schema,
  gridCardsV1Schema,
  ctaBandV1Schema,
  faqAccordionV1Schema,
  pricingTiersV1Schema,
  heroOfferBlurV1Schema,
  processSlideStackV1Schema,
  persuasionSimpleCtaV1Schema,
  ambientMarqueeStripV1Schema,
  caseStudyScrollCardsV1Schema,
  faqAccordionV2Schema,
  featureReasonsSplitV1Schema,
  ctaProgramOfferV1Schema,
  comparisonTableV1Schema,
  featureIconTilesV1Schema,
  gridProgramCardsV1Schema,
  navProgramPathwayV1Schema,
} from './schema';
import type { ModuleTypeKey } from './types';

import { HeroStandardV1 } from '@/components/modules/HeroStandardV1';
import { FeatureSplitMediaV1 } from '@/components/modules/FeatureSplitMediaV1';
import { GridCardsV1 } from '@/components/modules/GridCardsV1';
import { CtaBandV1 } from '@/components/modules/CtaBandV1';
import { FaqAccordionV1 } from '@/components/modules/FaqAccordionV1';
import { PricingTiersV1 } from '@/components/modules/PricingTiersV1';
import { HeroOfferBlurV1 } from '@/components/modules/HeroOfferBlurV1';
import { ProcessSlideStackV1 } from '@/components/modules/ProcessSlideStackV1';
import { PersuasionSimpleCtaV1 } from '@/components/modules/PersuasionSimpleCtaV1';
import { AmbientMarqueeStripV1 } from '@/components/modules/AmbientMarqueeStripV1';
import { CaseStudyScrollCardsV1 } from '@/components/modules/CaseStudyScrollCardsV1';
import { FaqAccordionV2 } from '@/components/modules/FaqAccordionV2';
import { FeatureReasonsSplitV1 } from '@/components/modules/FeatureReasonsSplitV1';
import { CtaProgramOfferV1 } from '@/components/modules/CtaProgramOfferV1';
import { ComparisonTableV1 } from '@/components/modules/ComparisonTableV1';
import { FeatureIconTilesV1 } from '@/components/modules/FeatureIconTilesV1';
import { GridProgramCardsV1 } from '@/components/modules/GridProgramCardsV1';
import { NavProgramPathwayV1 } from '@/components/modules/NavProgramPathwayV1';

export interface ModuleRegistryEntry {
  /** Zod schema for the module's content object. */
  schema: z.ZodSchema;
  /** React component that renders the module given its typed content. */
  component: React.ComponentType<{ content: unknown }>;
}

export const MODULE_REGISTRY: Record<ModuleTypeKey, ModuleRegistryEntry> = {
  'hero.standard.v1': {
    schema: heroStandardV1Schema,
    component: HeroStandardV1 as React.ComponentType<{ content: unknown }>,
  },
  'feature.split-media.v1': {
    schema: featureSplitMediaV1Schema,
    component: FeatureSplitMediaV1 as React.ComponentType<{ content: unknown }>,
  },
  'grid.cards.v1': {
    schema: gridCardsV1Schema,
    component: GridCardsV1 as React.ComponentType<{ content: unknown }>,
  },
  'cta.band.v1': {
    schema: ctaBandV1Schema,
    component: CtaBandV1 as React.ComponentType<{ content: unknown }>,
  },
  'faq.accordion.v1': {
    schema: faqAccordionV1Schema,
    component: FaqAccordionV1 as React.ComponentType<{ content: unknown }>,
  },
  'pricing.tiers.v1': {
    schema: pricingTiersV1Schema,
    component: PricingTiersV1 as React.ComponentType<{ content: unknown }>,
  },
  'hero.offer-blur.v1': {
    schema: heroOfferBlurV1Schema,
    component: HeroOfferBlurV1 as React.ComponentType<{ content: unknown }>,
  },
  'process.slide-stack.v1': {
    schema: processSlideStackV1Schema,
    component: ProcessSlideStackV1 as React.ComponentType<{ content: unknown }>,
  },
  'persuasion.simple-cta.v1': {
    schema: persuasionSimpleCtaV1Schema,
    component: PersuasionSimpleCtaV1 as React.ComponentType<{ content: unknown }>,
  },
  'ambient.marquee-strip.v1': {
    schema: ambientMarqueeStripV1Schema,
    component: AmbientMarqueeStripV1 as React.ComponentType<{ content: unknown }>,
  },
  'case-study.scroll-cards.v1': {
    schema: caseStudyScrollCardsV1Schema,
    component: CaseStudyScrollCardsV1 as React.ComponentType<{ content: unknown }>,
  },
  'faq.accordion.v2': {
    schema: faqAccordionV2Schema,
    component: FaqAccordionV2 as React.ComponentType<{ content: unknown }>,
  },
  'feature.reasons-split.v1': {
    schema: featureReasonsSplitV1Schema,
    component: FeatureReasonsSplitV1 as React.ComponentType<{ content: unknown }>,
  },
  'cta.program-offer.v1': {
    schema: ctaProgramOfferV1Schema,
    component: CtaProgramOfferV1 as React.ComponentType<{ content: unknown }>,
  },
  'comparison.table.v1': {
    schema: comparisonTableV1Schema,
    component: ComparisonTableV1 as React.ComponentType<{ content: unknown }>,
  },
  'feature.icon-tiles.v1': {
    schema: featureIconTilesV1Schema,
    component: FeatureIconTilesV1 as React.ComponentType<{ content: unknown }>,
  },
  'grid.program-cards.v1': {
    schema: gridProgramCardsV1Schema,
    component: GridProgramCardsV1 as React.ComponentType<{ content: unknown }>,
  },
  'nav.program-pathway.v1': {
    schema: navProgramPathwayV1Schema,
    component: NavProgramPathwayV1 as React.ComponentType<{ content: unknown }>,
  },
};
