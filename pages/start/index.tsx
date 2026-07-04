/**
 * /start — central app access / subscription surface (default public offer).
 */

import type { GetServerSideProps } from 'next';
import StartView, { type StartPlanOption } from '@/components/offers/StartView';
import {
  getDefaultPublicOffer,
  getOfferConfigByOfferKey,
  getPractitionerOffers,
} from '@/lib/access/offerConfig';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';
import { buildPricingModuleDTO } from '@/lib/access/pricingModuleAdapter';
import type { PricingModuleDTO } from '@/lib/access/pricingCardDTO';
import type { StartTemplateConfig } from '@/components/offers/StartView';
import { resolveStartIndexPresentation } from '@/lib/startPages/resolveStartPage';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import type { SeoMeta } from '@/lib/seo/getSeo';

// Durable pricing module: the marketed package + the price options shown on /start.
const START_OFFER_KEY = 'fine-diet-method';
const START_PRICE_OPTION_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'];

// Legacy fallback plan-card source (kept so /start never renders an empty
// pricing section if the pricing module yields no cards).
const START_PLAN_OFFER_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'] as const;

interface StartPageProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  pricingModule: PricingModuleDTO;
  planOptions: StartPlanOption[];
  config: StartTemplateConfig | null;
  seo: SeoMeta;
}

function toStartPlanOption(offer: OfferMarketingDTO, badge?: string): StartPlanOption {
  return {
    offerKey: offer.offerKey,
    title: offer.priceSuffix === '/yr' ? 'Annual' : 'Monthly',
    subtitle: offer.copy.subtitle,
    priceLabel: offer.priceLabel,
    priceSuffix: offer.priceSuffix,
    ctaLabel: offer.copy.ctaLabel,
    trialNote: offer.copy.trialNote,
    badge: badge ?? null,
  };
}

export default function StartPage({ primaryOffer, practitionerOffers, pricingModule, planOptions, config, seo }: StartPageProps) {
  return (
    <StartView
      primaryOffer={primaryOffer}
      practitionerOffers={practitionerOffers}
      pricingModule={pricingModule}
      planOptions={planOptions}
      config={config ?? undefined}
      seo={seo}
    />
  );
}

export const getServerSideProps: GetServerSideProps<StartPageProps> = async ({ res }) => {
  // This route's content flips with Start Page publish/unpublish/archive, so it
  // must never be served stale from a shared/browser cache. Without this, a
  // previously published campaign render could persist after unpublish.
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');

  const planOptions = START_PLAN_OFFER_KEYS
    .map((offerKey, index) => {
      const offer = getOfferConfigByOfferKey(offerKey);
      return offer
        ? toStartPlanOption(toMarketingDTO(offer), index === 1 ? 'Best value' : undefined)
        : null;
    })
    .filter((option): option is StartPlanOption => Boolean(option));

  // Additive: a published Start Page row for "/start" overrides presentation
  // (pricing module + config). With no published row, behavior is unchanged.
  const startPage = await resolveStartIndexPresentation();

  const pricingModule = startPage?.pricingModule
    ?? buildPricingModuleDTO({
      offerKey: START_OFFER_KEY,
      priceOptionKeys: START_PRICE_OPTION_KEYS,
    });

  const defaultOffer = getDefaultPublicOffer();

  // Standardize /start onto the shared SeoHead pipeline. The Start Page's
  // `seo` block (page/admin override) wins over the route-level seo:route:/start
  // record, then product/page defaults, then the global fallback.
  const seoResult = await getSeoForRoute({
    routePath: '/start',
    pageTitle: defaultOffer.copy.title,
    pageDescription: defaultOffer.copy.subtitle,
    pageOverride: startPage?.seo ?? null,
  });

  return {
    props: {
      primaryOffer: toMarketingDTO(defaultOffer),
      practitionerOffers: getPractitionerOffers().map(toMarketingDTO),
      pricingModule,
      planOptions,
      config: startPage?.config ?? null,
      seo: seoResult.seo,
    },
  };
};
