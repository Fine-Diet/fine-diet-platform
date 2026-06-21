/**
 * API: /api/admin/start-pages/[slug]/publish
 *
 * POST body: { action: 'publish' | 'unpublish' | 'archive' }
 *
 *   publish   — validate the draft selection, then copy draft -> published.
 *               Blocks if any selected price option is unknown/inactive/mismatched.
 *   unpublish — remove the published row (public route falls back to code defaults).
 *   archive   — snapshot current live/draft into an `archived` row and remove the
 *               published row (taken offline; draft kept for future edits).
 *
 * Protected: editor | admin. Presentation only — never touches billing,
 * entitlements, or grants.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getStartPageBySlug,
  upsertStartPage,
  deleteStartPageRow,
} from '@/lib/startPages/startPageApi';
import { validateStartPageSelection } from '@/lib/startPages/startPageValidation';
import { routePathForSlug, type StartPageRecord } from '@/lib/startPages/startPageSchema';

type Action = 'publish' | 'unpublish' | 'archive';

async function revalidateRoute(res: NextApiResponse, routePath: string) {
  try {
    await res.revalidate(routePath);
  } catch {
    // Public route is SSR (getServerSideProps) — revalidate may be a no-op.
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = String(req.query.slug ?? '').trim().toLowerCase();
  const action = req.body?.action as Action | undefined;
  if (!slug) return res.status(400).json({ success: false, error: 'slug is required' });
  if (action !== 'publish' && action !== 'unpublish' && action !== 'archive') {
    return res.status(400).json({
      success: false,
      error: 'action must be "publish", "unpublish", or "archive"',
    });
  }

  const routePath = routePathForSlug(slug);

  // ── publish ──────────────────────────────────────────────────────────────
  if (action === 'publish') {
    const draft = await getStartPageBySlug(slug, 'draft');
    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'No draft to publish.',
      });
    }

    const validation = await validateStartPageSelection(
      draft.primaryOfferKey,
      draft.priceOptionKeys,
    );
    if (!validation.ok) {
      return res.status(422).json({
        success: false,
        error: 'Validation failed — resolve the issues before publishing.',
        validation,
      });
    }

    const published: StartPageRecord = { ...draft, status: 'published' };
    const { success, error } = await upsertStartPage(published, user.id);
    if (!success) return res.status(500).json({ success: false, error });

    await revalidateRoute(res, routePath);
    return res.status(200).json({ success: true, status: 'published', validation });
  }

  // ── unpublish ──────────────────────────────────────────────────────────────
  if (action === 'unpublish') {
    const published = await getStartPageBySlug(slug, 'published');
    if (!published) {
      return res.status(404).json({ success: false, error: 'No published row to unpublish.' });
    }
    const { success, error } = await deleteStartPageRow(slug, 'published');
    if (!success) return res.status(500).json({ success: false, error });

    await revalidateRoute(res, routePath);
    return res.status(200).json({ success: true, status: 'draft' });
  }

  // ── archive ──────────────────────────────────────────────────────────────
  // Snapshot the current live (or draft) record into an `archived` row, then
  // take the published row offline so the public route falls back to defaults.
  const source =
    (await getStartPageBySlug(slug, 'published')) ??
    (await getStartPageBySlug(slug, 'draft'));
  if (!source) {
    return res.status(404).json({ success: false, error: 'Nothing to archive.' });
  }

  const archived: StartPageRecord = { ...source, status: 'archived' };
  const { success, error } = await upsertStartPage(archived, user.id);
  if (!success) return res.status(500).json({ success: false, error });

  // Remove the live row if present (ignore if already absent).
  await deleteStartPageRow(slug, 'published');

  await revalidateRoute(res, routePath);
  return res.status(200).json({ success: true, status: 'archived' });
}
