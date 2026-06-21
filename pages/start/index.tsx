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

export default function StartPage({ primaryOffer, practitionerOffers, pricingModule, planOptions }: StartPageProps) {
  return (
    <StartView
      primaryOffer={primaryOffer}
      practitionerOffers={practitionerOffers}
      pricingModule={pricingModule}
      planOptions={planOptions}
    />
  );
}

export const getServerSideProps: GetServerSideProps<StartPageProps> = async () => {
  const planOptions = START_PLAN_OFFER_KEYS
    .map((offerKey, index) => {
      const offer = getOfferConfigByOfferKey(offerKey);
      return offer
        ? toStartPlanOption(toMarketingDTO(offer), index === 1 ? 'Best value' : undefined)
        : null;
    })
    .filter((option): option is StartPlanOption => Boolean(option));

  const pricingModule = buildPricingModuleDTO({
    offerKey: START_OFFER_KEY,
    priceOptionKeys: START_PRICE_OPTION_KEYS,
  });

  return {
    props: {
      primaryOffer: toMarketingDTO(getDefaultPublicOffer()),
      practitionerOffers: getPractitionerOffers().map(toMarketingDTO),
      pricingModule,
      planOptions,
    },
  };
};
