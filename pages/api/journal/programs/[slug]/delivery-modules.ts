/**
 * GET /api/journal/programs/[slug]/delivery-modules
 *
 * Person-scoped delivery module definitions for the app renderer. Published
 * admin-authored modules are preferred; Baseline falls back to code config.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { getLibraryDetailForPerson } from '@/lib/programs/programLibraryServerService';
import {
  getDeliveryModulesForProgramWithFallback,
  type DeliveryModulesResult,
} from '@/lib/programs/deliveryModuleDeliveryServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeliveryModulesResult | { error: string }>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug is required' });
  }

  const rawVersionId = req.query.version_id;
  const versionId = Array.isArray(rawVersionId) ? rawVersionId[0] : rawVersionId;

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return;

  try {
    const detail = await getLibraryDetailForPerson(personId, slug);
    if (!detail) {
      return res.status(404).json({ error: 'Program not found for user' });
    }

    const result = await getDeliveryModulesForProgramWithFallback({
      programSlug: slug,
      programVersionId: versionId || undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[journal/programs/[slug]/delivery-modules] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
