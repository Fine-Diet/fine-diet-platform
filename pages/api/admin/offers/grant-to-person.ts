/**
 * POST /api/admin/offers/grant-to-person
 *
 * Grant an offer to a person: resolves the offer's entitlement mappings
 * and creates person_entitlements for each.
 *
 * Body: { person_id: string, offer_key: string }
 *
 * Protected: editor | admin
 *
 * Grant logic lives in the shared `grantOfferToPerson` helper so the admin
 * path and the access-code claim path can never drift.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  grantOfferToPerson,
  NoActiveEntitlementMappingsError,
} from '@/lib/access/offerGrantService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { person_id, offer_key } = req.body ?? {};

  if (!person_id || typeof person_id !== 'string') {
    return res.status(400).json({ error: 'person_id is required' });
  }
  if (!offer_key || typeof offer_key !== 'string') {
    return res.status(400).json({ error: 'offer_key is required' });
  }

  try {
    const result = await grantOfferToPerson({
      personId: person_id,
      offerKey: offer_key,
      createdByUserId: user.id,
    });

    return res.status(201).json({
      offer_key: result.offerKey,
      person_id: result.personId,
      granted: result.granted,
      skipped: result.skipped,
      assignment_action: result.assignment_action,
      assignment_reason: result.assignment_reason,
    });
  } catch (err) {
    if (err instanceof NoActiveEntitlementMappingsError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[offers/grant-to-person] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}