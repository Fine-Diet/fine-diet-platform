/**
 * API: /api/admin/integrative-care/[slug]
 *
 * GET    — fetch product record (draft or published)
 * PUT    — update product record fields
 * DELETE — delete product record (draft status only)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getIntegrativeCareProductRecord,
  upsertIntegrativeCareProduct,
  integrativeCareProductSchema,
} from '@/lib/integrativeCareApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const slug = req.query.slug as string;

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // Admin can view both draft and published
    const product =
      (await getIntegrativeCareProductRecord(slug, 'draft')) ??
      (await getIntegrativeCareProductRecord(slug, 'published'));
    if (!product) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ product });
  }

  // ── PUT: update ────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const validated = integrativeCareProductSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validated.error.message}`,
      });
    }

    const { success, error } = await upsertIntegrativeCareProduct(validated.data);
    if (!success) return res.status(500).json({ success: false, error });

    // Revalidate the public page if publishing
    if (validated.data.status === 'published') {
      try {
        await res.revalidate(`/integrative-care/${slug}`);
      } catch {
        // Page may not exist yet — not a failure
      }
    }

    return res.status(200).json({ success: true });
  }

  // ── DELETE: draft only ─────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    // Only admins can delete
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    const product = await getIntegrativeCareProductRecord(slug, 'draft');
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Not found or product is published (unpublish before deleting)',
      });
    }

    try {
      const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
      const { error } = await supabaseAdmin
        .from('site_content')
        .delete()
        .eq('key', `product:integrative-care:${slug}`)
        .eq('status', 'draft');

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
