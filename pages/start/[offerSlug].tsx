/**
 * /start/[offerSlug] — slug-targeted offer surface.
 *
 * Resolves the slug to a configured offer. Unknown or inactive/expired slugs
 * fall back to the default public offer (with a notice). Launch-event and
 * buy-now offers render their own trial length / checkout framing.
 */

import type { GetServerSideProps } from 'next';
import StartView, { type StartPlanOption } from '@/components/offers/StartView';
import { getOfferConfigByOfferKey, getPractitionerOffers } from '@/lib/access/offerConfig';
import { resolveOfferForSlug } from '@/lib/access/offerConfigResolver';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';
import { buildPricingModuleDTO } from '@/lib/access/pricingModuleAdapter';
import type { PricingModuleDTO } from '@/lib/access/pricingCardDTO';

const START_OFFER_KEY = 'fine-diet-method';
const START_PRICE_OPTION_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'];

const START_PLAN_OFFER_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'] as const;

interface OfferSlugPageProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  pricingModule: PricingModuleDTO;
  planOptions: StartPlanOption[];
  fallbackNotice: string | null;
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

export default function OfferSlugPage({
  primaryOffer,
  practitionerOffers,
  pricingModule,
  planOptions,
  fallbackNotice,
}: OfferSlugPageProps) {
  return (
    <StartView
      primaryOffer={primaryOffer}
      practitionerOffers={practitionerOffers}
      pricingModule={pricingModule}
      planOptions={planOptions}
      fallbackNotice={fallbackNotice}
    />
  );
}

export const getServerSideProps: GetServerSideProps<OfferSlugPageProps> = async (context) => {
  const slugParam = context.params?.offerSlug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam ?? null;

  const resolved = resolveOfferForSlug(slug);

  let fallbackNotice: string | null = null;
  if (resolved.usedFallback) {
    fallbackNotice =
      resolved.reason === 'fallback_inactive'
        ? 'That offer is no longer available — here is our current offer.'
        : 'We couldn’t find that offer — here is our current offer.';
  }

  // A practitioner offer targeted directly should not also list itself below.
  const practitionerOffers = getPractitionerOffers()
    .map(toMarketingDTO)
    .filter((o) => o.slug !== resolved.offer.slug);

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
      primaryOffer: toMarketingDTO(resolved.offer),
      practitionerOffers,
      pricingModule,
      planOptions,
      fallbackNotice,
    },
  };
};
