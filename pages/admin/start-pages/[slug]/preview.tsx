/**
 * Admin preview: /admin/start-pages/[slug]/preview
 *
 * Renders the DRAFT Start Page through the real StartView, exactly as the public
 * surface would, but behind the admin role guard (v1 has no public preview
 * token). Falls back to the same default offer/plan scaffolding the public
 * /start route uses, then overlays the draft's pricing module + config.
 */

import type { GetServerSideProps } from 'next';
import StartView, {
  type StartPlanOption,
  type StartTemplateConfig,
} from '@/components/offers/StartView';
import {
  getDefaultPublicOffer,
  getOfferConfigByOfferKey,
  getPractitionerOffers,
} from '@/lib/access/offerConfig';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';
import { buildPricingModuleDTO } from '@/lib/access/pricingModuleAdapter';
import type { PricingModuleDTO } from '@/lib/access/pricingCardDTO';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { getStartPageBySlug } from '@/lib/startPages/startPageApi';

const FALLBACK_PLAN_OFFER_KEYS = ['fine-diet-method-monthly', 'fine-diet-method-annual'] as const;

interface Props {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  pricingModule: PricingModuleDTO;
  planOptions: StartPlanOption[];
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

export default function StartPagePreview({
  primaryOffer,
  practitionerOffers,
  pricingModule,
  planOptions,
  config,
}: Props) {
  return (
    <StartView
      primaryOffer={primaryOffer}
      practitionerOffers={practitionerOffers}
      pricingModule={pricingModule}
      planOptions={planOptions}
      config={config ?? undefined}
    />
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = String(context.params?.slug ?? '').trim().toLowerCase();
  if (!slug) return { notFound: true };

  const record =
    (await getStartPageBySlug(slug, 'draft')) ??
    (await getStartPageBySlug(slug, 'published'));
  if (!record) return { notFound: true };

  const planOptions = FALLBACK_PLAN_OFFER_KEYS
    .map((offerKey, index) => {
      const offer = getOfferConfigByOfferKey(offerKey);
      return offer
        ? toStartPlanOption(toMarketingDTO(offer), index === 1 ? 'Best value' : undefined)
        : null;
    })
    .filter((option): option is StartPlanOption => Boolean(option));

  const pricingModule = buildPricingModuleDTO({
    offerKey: record.primaryOfferKey,
    priceOptionKeys: record.priceOptionKeys,
  });

  return {
    props: {
      primaryOffer: toMarketingDTO(getDefaultPublicOffer()),
      practitionerOffers: getPractitionerOffers().map(toMarketingDTO),
      pricingModule,
      planOptions,
      config: (record.config as StartTemplateConfig) ?? null,
    },
  };
};
