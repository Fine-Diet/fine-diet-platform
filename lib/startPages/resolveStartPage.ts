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
import type { SeoSocialFields } from '@/lib/seo/seoSocialFields';
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
  /**
   * Resolved SEO/social preview override for the route render. Composed from the
   * config `seo` block (full social preview set) with the legacy top-level
   * `seoTitle` / `seoDescription` columns as fallback for title/description.
   * Null when neither source provides any field.
   */
  seo: SeoSocialFields | null;
  primaryOfferKey: string;
}

function toPresentation(record: StartPageRecord): ResolvedStartPagePresentation {
  const pricingModule = buildPricingModuleDTO({
    offerKey: record.primaryOfferKey,
    priceOptionKeys: record.priceOptionKeys,
  });

  // Compose the render-time SEO override. The config `seo` block is the
  // authoritative social-preview source; the legacy top-level columns remain
  // a fallback for title/description so existing rows keep working without a
  // migration.
  const configSeo = record.config?.seo ?? null;
  const legacyTitle = record.seoTitle ?? null;
  const legacyDescription = record.seoDescription ?? null;
  const seo: SeoSocialFields | null = configSeo
    ? {
        ...configSeo,
        title: configSeo.title ?? (legacyTitle ?? undefined),
        description: configSeo.description ?? (legacyDescription ?? undefined),
      }
    : legacyTitle || legacyDescription
      ? {
          title: legacyTitle ?? undefined,
          description: legacyDescription ?? undefined,
        }
      : null;

  return {
    // `config` is schema-validated and structurally compatible with the
    // StartTemplateConfig interface StartView consumes.
    config: record.config as StartTemplateConfig,
    pricingModule,
    seoTitle: legacyTitle,
    seoDescription: legacyDescription,
    seo,
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
