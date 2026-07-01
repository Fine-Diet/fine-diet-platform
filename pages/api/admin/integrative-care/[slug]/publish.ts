/**
 * API: /api/admin/integrative-care/[slug]/publish
 *
 * POST — toggle product status between 'draft' and 'published'
 *        Body: { action: 'publish' | 'unpublish' }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getIntegrativeCareProductRecord,
  upsertIntegrativeCareProduct,
} from '@/lib/integrativeCareApi';

const INTEGRATIVE_CARE_INDEX_SLUG = 'integrative-care-landing';
const ROOT_LANDING_SLUGS = new Set([INTEGRATIVE_CARE_INDEX_SLUG, 'index']);

function publicPathForSlug(slug: string): string {
  return ROOT_LANDING_SLUGS.has(slug) ? '/integrative-care' : `/integrative-care/${slug}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
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

  const targetStatus = action === 'publish' ? 'draft' : 'published';
  const newStatus = action === 'publish' ? 'published' : 'draft';

  const product = await getIntegrativeCareProductRecord(slug, targetStatus);
  if (!product) {
    return res.status(404).json({
      success: false,
      error: `No ${targetStatus} record found for "${slug}"`,
    });
  }

  const { success, error } = await upsertIntegrativeCareProduct({
    ...product,
    status: newStatus,
  });

  if (!success) return res.status(500).json({ success: false, error });

  const publicPath = publicPathForSlug(slug);

  try {
    await res.revalidate(publicPath);
  } catch {
    // Not fatal
  }

  return res.status(200).json({ success: true, status: newStatus, publicPath });
}
