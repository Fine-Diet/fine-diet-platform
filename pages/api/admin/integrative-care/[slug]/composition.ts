/**
 * API: /api/admin/integrative-care/[slug]/composition
 *
 * GET — fetch the composition (draft preferred, falls back to published)
 * PUT — save composition as draft
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getIntegrativeCareComposition,
  upsertIntegrativeCareComposition,
} from '@/lib/integrativeCareApi';
import { pageCompositionSchema } from '@/lib/modules/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const slug = req.query.slug as string;

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const composition =
      (await getIntegrativeCareComposition(slug, 'draft')) ??
      (await getIntegrativeCareComposition(slug, 'published'));

    if (!composition) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ composition });
  }

  // ── PUT: save draft ────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const validated = pageCompositionSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validated.error.message}`,
      });
    }

    const { success, error } = await upsertIntegrativeCareComposition(
      slug,
      validated.data as any,
      'draft',
    );

    if (!success) return res.status(500).json({ success: false, error });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
