/**
 * /start — central app access / subscription surface (default public offer).
 */

import type { GetServerSideProps } from 'next';
import StartView from '@/components/offers/StartView';
import { getDefaultPublicOffer, getPractitionerOffers } from '@/lib/access/offerConfig';
import { toMarketingDTO, type OfferMarketingDTO } from '@/lib/access/offerCatalogService';

interface StartPageProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
}

export default function StartPage({ primaryOffer, practitionerOffers }: StartPageProps) {
  return (
    <StartView primaryOffer={primaryOffer} practitionerOffers={practitionerOffers} />
  );
}

export const getServerSideProps: GetServerSideProps<StartPageProps> = async () => {
  return {
    props: {
      primaryOffer: toMarketingDTO(getDefaultPublicOffer()),
      practitionerOffers: getPractitionerOffers().map(toMarketingDTO),
    },
  };
};
