/**
 * API Route: Public offer catalog (marketing-safe)
 *
 * GET /api/offers?kind=all|baseline|practitioner
 *
 * Returns marketing-safe offer DTOs (NO Stripe price IDs). Used by the /start
 * surface and OfferGrid for owned-state cross-referencing on the client.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  listMarketingOffers,
  type OfferMarketingDTO,
  type ListOffersParams,
} from '@/lib/access/offerCatalogService';

interface OffersResponse {
  offers: OfferMarketingDTO[];
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<OffersResponse | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const kindParam = (req.query.kind as string) || 'all';
  const kind: ListOffersParams['kind'] =
    kindParam === 'baseline' || kindParam === 'practitioner' ? kindParam : 'all';

  const offers = listMarketingOffers({ kind });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ offers });
}
