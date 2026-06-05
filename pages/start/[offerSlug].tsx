/**
 * /start/[offerSlug] — slug-targeted offer surface.
 *
 * Resolves the slug to a configured offer. Unknown or inactive/expired slugs
 * fall back to the default public offer (with a notice). Launch-event and
 * buy-now offers render their own trial length / checkout framing.
 */

import type { GetServerSideProps } from 'next';
import StartView from '@/components/offers/StartView';
import { getPractitionerOffers } from '@/lib/access/offerConfig';
import { resolveOfferForSlug } from '@/lib/access/offerConfigResolver';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';

interface OfferSlugPageProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  fallbackNotice: string | null;
}

export default function OfferSlugPage({
  primaryOffer,
  practitionerOffers,
  fallbackNotice,
}: OfferSlugPageProps) {
  return (
    <StartView
      primaryOffer={primaryOffer}
      practitionerOffers={practitionerOffers}
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

  return {
    props: {
      primaryOffer: toMarketingDTO(resolved.offer),
      practitionerOffers,
      fallbackNotice,
    },
  };
};
