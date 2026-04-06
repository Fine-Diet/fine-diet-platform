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
} from './schema';
import type { ModuleTypeKey } from './types';

import { HeroStandardV1 } from '@/components/modules/HeroStandardV1';
import { FeatureSplitMediaV1 } from '@/components/modules/FeatureSplitMediaV1';
import { GridCardsV1 } from '@/components/modules/GridCardsV1';
import { CtaBandV1 } from '@/components/modules/CtaBandV1';
import { FaqAccordionV1 } from '@/components/modules/FaqAccordionV1';
import { PricingTiersV1 } from '@/components/modules/PricingTiersV1';

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
};
