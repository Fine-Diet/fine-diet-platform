/**
 * API: /api/admin/programs-marketing/[slug]/composition
 *
 * GET — fetch the composition (draft preferred, falls back to published)
 * PUT — save composition as draft
 *
 * Admin-only. Saving writes a DRAFT composition only; promoting it to published
 * is a separate explicit step (publish-composition). Service-role writes via
 * the programsMarketingApi adapter.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getProgramsMarketingComposition,
  upsertProgramsMarketingComposition,
} from '@/lib/programs/programsMarketingApi';
import { pageCompositionSchema } from '@/lib/modules/schema';
import type { PageComposition } from '@/lib/modules/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  const slug = req.query.slug as string;

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const composition =
      (await getProgramsMarketingComposition(slug, 'draft')) ??
      (await getProgramsMarketingComposition(slug, 'published'));

    if (!composition) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ composition });
  }

  // ── PUT: save draft ─────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const validated = pageCompositionSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validated.error.message}`,
      });
    }

    const { success, error } = await upsertProgramsMarketingComposition(
      slug,
      validated.data as unknown as PageComposition,
      'draft',
    );

    if (!success) return res.status(500).json({ success: false, error });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
