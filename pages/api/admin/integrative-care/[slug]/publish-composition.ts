/**
 * API: /api/admin/integrative-care/[slug]/publish-composition
 *
 * POST — promote the draft composition to published status.
 *        Copies the draft row content into the published row (upsert).
 *        Revalidates the public product page.
 *
 * Product record status is independent — this only affects the composition.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getIntegrativeCareComposition,
  upsertIntegrativeCareComposition,
} from '@/lib/integrativeCareApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = req.query.slug as string;

  const draft = await getIntegrativeCareComposition(slug, 'draft');
  if (!draft) {
    return res.status(404).json({
      success: false,
      error: 'No draft composition found. Save a draft first.',
    });
  }

  const { success, error } = await upsertIntegrativeCareComposition(slug, draft, 'published');
  if (!success) return res.status(500).json({ success: false, error });

  try {
    await res.revalidate(`/integrative-care/${slug}`);
  } catch {
    // Not fatal — content is saved
  }

  return res.status(200).json({ success: true });
}
