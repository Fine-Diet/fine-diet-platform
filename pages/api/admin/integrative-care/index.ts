/**
 * API: /api/admin/integrative-care
 *
 * GET  — list all products (draft + published) for admin UI
 * POST — create a new product record + scaffold composition
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  listIntegrativeCareProducts,
  upsertIntegrativeCareProduct,
  upsertIntegrativeCareComposition,
  getIntegrativeCareComposition,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  // ── GET: list ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const products = await listIntegrativeCareProducts(false);
    return res.status(200).json({ products });
  }

  // ── POST: create ───────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { productSlug, title, seoTitle, seoDescription, sortOrder } = req.body ?? {};

    if (!productSlug || typeof productSlug !== 'string') {
      return res.status(400).json({ success: false, error: 'productSlug is required' });
    }
    if (!/^[a-z0-9-]+$/.test(productSlug)) {
      return res.status(400).json({
        success: false,
        error: 'productSlug must be lowercase letters, numbers, and hyphens only',
      });
    }

    const record: IntegrativeCareProduct = {
      productSlug,
      category: 'integrative-care',
      templateFamily: 'integrative-care',
      status: 'draft',
      title: title ?? '',
      seoTitle: seoTitle ?? title ?? '',
      seoDescription: seoDescription ?? '',
      sortOrder: typeof sortOrder === 'number' ? sortOrder : 99,
    };

    const { success, error } = await upsertIntegrativeCareProduct(record);
    if (!success) return res.status(500).json({ success: false, error });

    // Scaffold composition — copy the 21-day product's composition as a
    // starting template so the new product has a usable module structure
    const scaffold = await getIntegrativeCareComposition('21-day-nutrition-intensive', 'published');
    if (scaffold) {
      // Re-key the composition for the new slug
      const newComposition = {
        ...scaffold,
        key: `page:site:integrative-care:${productSlug}`,
      };
      // Write as both draft and published so the public route resolves immediately
      await upsertIntegrativeCareComposition(productSlug, newComposition, 'published');
      await upsertIntegrativeCareComposition(productSlug, newComposition, 'draft');
    }

    return res.status(201).json({ success: true, productSlug });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
