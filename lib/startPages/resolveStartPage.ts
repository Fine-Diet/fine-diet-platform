/**
 * Start Pages — public route resolution.
 *
 * Loads a published Start Page row and projects it into the props the public
 * `/start` surface needs: a frontend-safe `StartTemplateConfig` and a
 * `PricingModuleDTO` (no Stripe price IDs). Returns `null` when no published row
 * exists so callers fall back to the existing code-default behavior unchanged.
 *
 * Server-only (the adapter it calls imports the service-role client).
 */

import { buildPricingModuleDTO } from '@/lib/access/pricingModuleAdapter';
import type { PricingModuleDTO } from '@/lib/access/pricingCardDTO';
import type { StartTemplateConfig } from '@/components/offers/StartView';
import {
  getPublishedStartPageByRoute,
  getStartPageBySlug,
} from './startPageApi';
import type { StartPageRecord } from './startPageSchema';

export interface ResolvedStartPagePresentation {
  config: StartTemplateConfig;
  pricingModule: PricingModuleDTO;
  seoTitle: string | null;
  seoDescription: string | null;
  primaryOfferKey: string;
}

function toPresentation(record: StartPageRecord): ResolvedStartPagePresentation {
  const pricingModule = buildPricingModuleDTO({
    offerKey: record.primaryOfferKey,
    priceOptionKeys: record.priceOptionKeys,
  });

  return {
    // `config` is schema-validated and structurally compatible with the
    // StartTemplateConfig interface StartView consumes.
    config: record.config as StartTemplateConfig,
    pricingModule,
    seoTitle: record.seoTitle ?? null,
    seoDescription: record.seoDescription ?? null,
    primaryOfferKey: record.primaryOfferKey,
  };
}

/** Resolve the published presentation for `/start`, or null to use defaults. */
export async function resolveStartIndexPresentation(): Promise<ResolvedStartPagePresentation | null> {
  const record = await getPublishedStartPageByRoute('/start');
  if (!record) return null;
  return toPresentation(record);
}

/**
 * Resolve the published presentation for `/start/{slug}`, or null to fall back
 * to the existing offerConfig/default behavior. A published `start_pages` row
 * wins over offerConfig (per the approved precedence).
 */
export async function resolveStartSlugPresentation(
  slug: string,
): Promise<ResolvedStartPagePresentation | null> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return null;
  const record = await getStartPageBySlug(normalized, 'published');
  if (!record) return null;
  return toPresentation(record);
}
