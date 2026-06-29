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
