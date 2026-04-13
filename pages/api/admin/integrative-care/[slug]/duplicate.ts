/**
 * API: /api/admin/integrative-care/[slug]/duplicate
 *
 * POST — clone a product record + composition under a new slug
 *        Body: { newSlug: string }
 *        New product always starts as 'draft'.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  getIntegrativeCareProductRecord,
  getIntegrativeCareComposition,
  upsertIntegrativeCareProduct,
  upsertIntegrativeCareComposition,
} from '@/lib/integrativeCareApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const sourceSlug = req.query.slug as string;
  const { newSlug } = req.body ?? {};

  if (!newSlug || typeof newSlug !== 'string') {
    return res.status(400).json({ success: false, error: 'newSlug is required' });
  }
  if (!/^[a-z0-9-]+$/.test(newSlug)) {
    return res.status(400).json({
      success: false,
      error: 'newSlug must be lowercase letters, numbers, and hyphens only',
    });
  }
  if (newSlug === sourceSlug) {
    return res.status(400).json({ success: false, error: 'newSlug must differ from source slug' });
  }

  // Load source record (draft preferred, fall back to published)
  const sourceProduct =
    (await getIntegrativeCareProductRecord(sourceSlug, 'draft')) ??
    (await getIntegrativeCareProductRecord(sourceSlug, 'published'));

  if (!sourceProduct) {
    return res.status(404).json({ success: false, error: `Source product "${sourceSlug}" not found` });
  }

  // Clone product record as draft
  const { success: recSuccess, error: recError } = await upsertIntegrativeCareProduct({
    ...sourceProduct,
    productSlug: newSlug,
    status: 'draft',
    title: `${sourceProduct.title} (copy)`,
  });

  if (!recSuccess) return res.status(500).json({ success: false, error: recError });

  // Clone composition as draft
  const sourceComposition =
    (await getIntegrativeCareComposition(sourceSlug, 'draft')) ??
    (await getIntegrativeCareComposition(sourceSlug, 'published'));

  if (sourceComposition) {
    const newComposition = {
      ...sourceComposition,
      key: `page:site:integrative-care:${newSlug}`,
    };
    await upsertIntegrativeCareComposition(newSlug, newComposition, 'draft');
  }

  return res.status(201).json({ success: true, productSlug: newSlug });
}
