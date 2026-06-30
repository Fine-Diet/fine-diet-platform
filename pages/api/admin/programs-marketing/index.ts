/**
 * API: /api/admin/programs-marketing
 *
 * GET  — list all Programs marketing product records (draft + published)
 * POST — create a new draft product record
 *
 * Admin-only. Writes go through the programsMarketingApi adapter, which uses
 * supabaseAdmin (service role) exclusively. There is no authenticated-client
 * write path. Creating a record does NOT publish anything: new records are
 * always 'draft', and the publish gate requires BOTH a published product record
 * and a published composition before a public page renders the composition.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  listProgramsMarketingProducts,
  upsertProgramsMarketingProduct,
  parseProgramMarketingSlug,
  PROGRAMS_INDEX_MARKETING_SLUG,
  type ProgramsMarketingProduct,
} from '@/lib/programs/programsMarketingApi';

// Reserved index slug, collection slug (`nutrition`), or program slug (`nutrition--baseline`).
const MARKETING_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  // ── GET: list ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const products = await listProgramsMarketingProducts(false);
    return res.status(200).json({ products });
  }

  // ── POST: create draft ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { slug, title, seoTitle, seoDescription, sortOrder } = req.body ?? {};

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, error: 'slug is required' });
    }
    if (!MARKETING_SLUG_RE.test(slug)) {
      return res.status(400).json({
        success: false,
        error:
          'slug must be lowercase letters, numbers, and hyphens, optionally with a "--" collection/program separator',
      });
    }

    const isIndex = slug === PROGRAMS_INDEX_MARKETING_SLUG;
    const { collectionSlug, programSlug } = parseProgramMarketingSlug(slug);
    const kind = isIndex ? 'index' : programSlug ? 'program' : 'collection';

    const record: ProgramsMarketingProduct = {
      slug,
      category: 'programs',
      templateFamily: 'programs',
      kind,
      collectionSlug,
      ...(programSlug ? { programSlug } : {}),
      status: 'draft',
      title: typeof title === 'string' ? title : '',
      seoTitle: typeof seoTitle === 'string' ? seoTitle : (typeof title === 'string' ? title : ''),
      seoDescription: typeof seoDescription === 'string' ? seoDescription : '',
      sortOrder: typeof sortOrder === 'number' ? sortOrder : isIndex ? 0 : 99,
    };

    const { success, error } = await upsertProgramsMarketingProduct(record);
    if (!success) return res.status(500).json({ success: false, error });

    return res.status(201).json({ success: true, slug });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
