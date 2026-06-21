/**
 * API: /api/admin/start-pages/[slug]
 *
 * GET    — fetch the Start Page record (draft preferred, else published) plus
 *          the safe (non-billing) price options available for its parent offer
 *          and a validation report for the current selection.
 * PUT     — update the DRAFT record (metadata + price option selection + config).
 *          Validation issues are returned but do not block saving a draft.
 * DELETE  — delete the draft row (admin only).
 *
 * Protected: editor | admin. No Stripe price IDs are ever read or returned.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getStartPageBySlug,
  upsertStartPage,
  deleteStartPageRow,
} from '@/lib/startPages/startPageApi';
import {
  listSafePriceOptionsForOffer,
  validateStartPageSelection,
} from '@/lib/startPages/startPageValidation';
import {
  startPageRecordSchema,
  routePathForSlug,
  type StartPageRecord,
} from '@/lib/startPages/startPageSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  const slug = String(req.query.slug ?? '').trim().toLowerCase();
  if (!slug) return res.status(400).json({ success: false, error: 'slug is required' });

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const record =
      (await getStartPageBySlug(slug, 'draft')) ??
      (await getStartPageBySlug(slug, 'published'));
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });

    const hasPublished = Boolean(await getStartPageBySlug(slug, 'published'));
    const priceOptions = await listSafePriceOptionsForOffer(record.primaryOfferKey);
    const validation = await validateStartPageSelection(
      record.primaryOfferKey,
      record.priceOptionKeys,
    );

    return res.status(200).json({ record, priceOptions, validation, hasPublished });
  }

  // ── PUT: update draft ────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    // Force the draft status + slug-derived route_path; presentation only.
    const candidate = {
      ...(req.body ?? {}),
      slug,
      routePath: routePathForSlug(slug),
      status: 'draft' as const,
    };

    const parsed = startPageRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${parsed.error.message}`,
      });
    }
    const record: StartPageRecord = parsed.data;

    const { success, error, record: saved } = await upsertStartPage(record, user.id);
    if (!success) return res.status(500).json({ success: false, error });

    // Non-blocking selection validation (warnings shown in the editor).
    const validation = await validateStartPageSelection(
      record.primaryOfferKey,
      record.priceOptionKeys,
    );
    const priceOptions = await listSafePriceOptionsForOffer(record.primaryOfferKey);

    return res.status(200).json({ success: true, record: saved, validation, priceOptions });
  }

  // ── DELETE: draft only (admin) ─────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }
    const draft = await getStartPageBySlug(slug, 'draft');
    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'No draft to delete (unpublish/archive first).',
      });
    }
    const { success, error } = await deleteStartPageRow(slug, 'draft');
    if (!success) return res.status(500).json({ success: false, error });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
