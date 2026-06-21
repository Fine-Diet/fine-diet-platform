/**
 * /start/[offerSlug] — slug-targeted offer surface.
 *
 * Resolves the slug to a configured offer. Unknown or inactive/expired slugs
 * fall back to the default public offer (with a notice). Launch-event and
 * buy-now offers render their own trial length / checkout framing.
 */

import type { GetServerSideProps } from 'next';
import StartView, {
  type StartPlanOption,
  type StartTemplateConfig,
} from '@/components/offers/StartView';
import { getOfferConfigByOfferKey, getPractitionerOffers } from '@/lib/access/offerConfig';
import { resolveOfferForSlug } from '@/lib/access/offerConfigResolver';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';
import { buildPricingModuleDTO } from '@/lib/access/pricingModuleAdapter';
import type { PricingModuleDTO } from '@/lib/access/pricingCardDTO';

const START_OFFER_KEY = 'fine-diet-method';

// Default slug surface mirrors /start: monthly + annual.
const DEFAULT_PRICE_OPTION_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'];

// Launch surface (slug -> launch-event offer) leads with the founder annual
// price option so /start/launch's pricing actually matches its Founder's Launch
// hero framing, then keeps monthly as the flexible alternative. All options buy
// the same parent offer (fine-diet-method); only the billing differs.
const LAUNCH_PRICE_OPTION_KEYS = [
  'fine-diet-method-founder-annual',
  'fine-diet-method-monthly',
];

// Founder's Launch pricing copy. Presentation-only: the launch surface keeps
// this framing while /start and fallback pages use the neutral module default.
const LAUNCH_PRICING_CONFIG: StartTemplateConfig = {
  pricing: {
    heading: 'Choose your Founder’s Launch access',
    intro:
      'Start with a trial, then lock in the full year of Fine Diet at the best value. Either way, you get the app, guided journaling, insights, recipes, meal scheduling, and every Fine Diet program as it runs.',
  },
};

const START_PLAN_OFFER_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'] as const;

interface OfferSlugPageProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  pricingModule: PricingModuleDTO;
  planOptions: StartPlanOption[];
  fallbackNotice: string | null;
  config: StartTemplateConfig | null;
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
  config,
}: OfferSlugPageProps) {
  return (
    <StartView
      primaryOffer={primaryOffer}
      practitionerOffers={practitionerOffers}
      pricingModule={pricingModule}
      planOptions={planOptions}
      fallbackNotice={fallbackNotice}
      config={config ?? undefined}
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

  // Surface the founder annual price option only when the slug genuinely
  // resolved to the launch-event offer (not a fallback). Otherwise mirror
  // /start with monthly + annual.
  const isLaunchSurface =
    !resolved.usedFallback && resolved.offer.role === 'launch-event';

  const pricingModule = buildPricingModuleDTO({
    offerKey: START_OFFER_KEY,
    priceOptionKeys: isLaunchSurface
      ? LAUNCH_PRICE_OPTION_KEYS
      : DEFAULT_PRICE_OPTION_KEYS,
    presentationOverrides: isLaunchSurface
      ? { 'fine-diet-method-founder-annual': { behavior: { isFeatured: true } } }
      : undefined,
  });

  return {
    props: {
      primaryOffer: toMarketingDTO(resolved.offer),
      practitionerOffers,
      pricingModule,
      planOptions,
      fallbackNotice,
      // Founder's Launch pricing copy only on the genuine launch surface;
      // fallback and other slugs use the neutral default in StartView.
      config: isLaunchSurface ? LAUNCH_PRICING_CONFIG : null,
    },
  };
};
