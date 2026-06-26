/**
 * API: /api/admin/programs-marketing/[slug]/publish-composition
 *
 * POST — promote the draft composition to published status.
 *        Copies the draft row content into the published row (upsert).
 *        Revalidates the public page.
 *
 * Admin-only. Product record status is independent — this only affects the
 * composition. The page renders the composition-driven template only when the
 * product record is ALSO published (publish gate). Service-role writes via the
 * programsMarketingApi adapter.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getProgramsMarketingComposition,
  upsertProgramsMarketingComposition,
  programMarketingPublicPath,
} from '@/lib/programs/programsMarketingApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = req.query.slug as string;

  const draft = await getProgramsMarketingComposition(slug, 'draft');
  if (!draft) {
    return res.status(404).json({
      success: false,
      error: 'No draft composition found. Save a draft first.',
    });
  }

  const { success, error } = await upsertProgramsMarketingComposition(slug, draft, 'published');
  if (!success) return res.status(500).json({ success: false, error });

  try {
    await res.revalidate(programMarketingPublicPath(slug));
  } catch {
    // Not fatal — content is saved.
  }

  return res.status(200).json({ success: true });
}
