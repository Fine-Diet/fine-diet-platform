/**
 * API: /api/admin/programs-marketing/[slug]
 *
 * GET    — fetch product record (draft preferred, falls back to published)
 * PUT    — update product record fields (writes to record.status)
 * DELETE — delete product record (draft status only)
 *
 * Admin-only. All writes route through the programsMarketingApi adapter using
 * supabaseAdmin (service role). Revalidates the public page when publishing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getProgramsMarketingProductRecord,
  upsertProgramsMarketingProduct,
  deleteProgramsMarketingProduct,
  programMarketingPublicPath,
  programsMarketingProductSchema,
} from '@/lib/programs/programsMarketingApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  const slug = req.query.slug as string;

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const product =
      (await getProgramsMarketingProductRecord(slug, 'draft')) ??
      (await getProgramsMarketingProductRecord(slug, 'published'));
    if (!product) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ product });
  }

  // ── PUT: update ────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const validated = programsMarketingProductSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validated.error.message}`,
      });
    }
    // The body slug must match the route slug to avoid cross-writing records.
    if (validated.data.slug !== slug) {
      return res.status(400).json({
        success: false,
        error: 'Body slug must match the route slug',
      });
    }

    const { success, error } = await upsertProgramsMarketingProduct(validated.data);
    if (!success) return res.status(500).json({ success: false, error });

    // Revalidate the public page only when this record is published.
    if (validated.data.status === 'published') {
      try {
        await res.revalidate(programMarketingPublicPath(slug));
      } catch {
        // Page may not exist yet (slug not in static paths) — not a failure.
      }
    }

    return res.status(200).json({ success: true });
  }

  // ── DELETE: draft only ─────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const product = await getProgramsMarketingProductRecord(slug, 'draft');
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Not found or product is published (unpublish before deleting)',
      });
    }

    const { success, error } = await deleteProgramsMarketingProduct(slug, 'draft');
    if (!success) return res.status(500).json({ success: false, error });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
