/**
 * API: /api/admin/programs-marketing/[slug]/publish
 *
 * POST — toggle PRODUCT record status between 'draft' and 'published'
 *        Body: { action: 'publish' | 'unpublish' }
 *
 * Admin-only. The product record is the explicit publish switch: per the publish
 * gate, a public page renders the composition-driven template only when BOTH this
 * product record AND the composition are published. Publishing the product alone
 * does not flip the page unless a published composition also exists; unpublishing
 * the product reverts the page to the code catalogue. Service-role writes via the
 * programsMarketingApi adapter.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getProgramsMarketingProductRecord,
  upsertProgramsMarketingProduct,
  programMarketingPublicPath,
} from '@/lib/programs/programsMarketingApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const slug = req.query.slug as string;
  const action = req.body?.action as 'publish' | 'unpublish' | undefined;

  if (action !== 'publish' && action !== 'unpublish') {
    return res.status(400).json({
      success: false,
      error: 'action must be "publish" or "unpublish"',
    });
  }

  const sourceStatus = action === 'publish' ? 'draft' : 'published';
  const newStatus = action === 'publish' ? 'published' : 'draft';

  const product = await getProgramsMarketingProductRecord(slug, sourceStatus);
  if (!product) {
    return res.status(404).json({
      success: false,
      error: `No ${sourceStatus} record found for "${slug}"`,
    });
  }

  const { success, error } = await upsertProgramsMarketingProduct({
    ...product,
    status: newStatus,
  });

  if (!success) return res.status(500).json({ success: false, error });

  // Revalidate the public page so the publish-gate result is reflected.
  try {
    await res.revalidate(programMarketingPublicPath(slug));
  } catch {
    // Page may not exist yet (slug not in static paths) — not fatal.
  }

  return res.status(200).json({ success: true, status: newStatus });
}
