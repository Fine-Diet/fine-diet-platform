/**
 * GET /api/journal/tracking-settings
 * Returns enabled_tracking_keys for the authenticated user.
 *
 * PATCH /api/journal/tracking-settings
 * Body: { enabled_tracking_keys: string[] }
 * Updates enabled_tracking_keys in people.metadata.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import {
  getEnabledTrackingKeys,
  updateEnabledTrackingKeys,
  ALL_TRACKING_KEYS,
  type TrackingKey,
} from '@/lib/journal/trackingSettings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  if (!(await requireCallerJournalAccess(res, ctx))) return;
  const { personId } = ctx;

  try {
    if (req.method === 'GET') {
      const keys = await getEnabledTrackingKeys(personId);
      return res.status(200).json({ enabled_tracking_keys: keys });
    }

    if (req.method === 'PATCH') {
      const { enabled_tracking_keys } = req.body ?? {};
      if (!Array.isArray(enabled_tracking_keys)) {
        return res.status(400).json({ error: 'enabled_tracking_keys must be an array' });
      }
      const validKeys = enabled_tracking_keys.filter(
        (k): k is string => typeof k === 'string' && ALL_TRACKING_KEYS.includes(k as TrackingKey)
      );
      const updated = await updateEnabledTrackingKeys(personId, validKeys);
      return res.status(200).json({ enabled_tracking_keys: updated });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (error) {
    console.error('[API /journal/tracking-settings] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
