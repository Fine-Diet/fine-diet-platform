/**
 * API: /api/admin/start-pages
 *
 * GET  — list Start Pages (draft + published + archived collapsed per slug).
 * POST — create a new draft Start Page.
 *
 * Protected: editor | admin. Start Pages own PRESENTATION only — no billing,
 * trial, entitlement, or grant controls live here.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { listStartPages, getStartPageBySlug, upsertStartPage } from '@/lib/startPages/startPageApi';
import {
  DEFAULT_START_PAGE_SLUG,
  routePathForSlug,
  SLUG_PATTERN,
  START_TEMPLATE_KEYS,
  type StartPageRecord,
} from '@/lib/startPages/startPageSchema';

const DEFAULT_PRIMARY_OFFER_KEY = 'fine-diet-method';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method === 'GET') {
    const pages = await listStartPages();
    return res.status(200).json({ pages });
  }

  if (req.method === 'POST') {
    const { slug, primaryOfferKey, templateKey } = req.body ?? {};

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, error: 'slug is required' });
    }
    const normalizedSlug = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return res.status(400).json({
        success: false,
        error: 'slug must be lowercase letters, numbers, and hyphens only',
      });
    }

    // Reject if any row already exists for this slug (draft or published).
    const existingDraft = await getStartPageBySlug(normalizedSlug, 'draft');
    const existingPublished = await getStartPageBySlug(normalizedSlug, 'published');
    if (existingDraft || existingPublished) {
      return res.status(409).json({
        success: false,
        error: `A Start Page with slug "${normalizedSlug}" already exists.`,
      });
    }

    const offerKey =
      typeof primaryOfferKey === 'string' && primaryOfferKey.trim()
        ? primaryOfferKey.trim()
        : DEFAULT_PRIMARY_OFFER_KEY;
    const template =
      typeof templateKey === 'string' && (START_TEMPLATE_KEYS as readonly string[]).includes(templateKey)
        ? (templateKey as StartPageRecord['templateKey'])
        : 'start.v1';

    const record: StartPageRecord = {
      slug: normalizedSlug,
      routePath: routePathForSlug(normalizedSlug),
      templateKey: template,
      primaryOfferKey: offerKey,
      priceOptionKeys: [],
      status: 'draft',
      seoTitle: null,
      seoDescription: null,
      config: {},
    };

    const { success, error } = await upsertStartPage(record, user.id);
    if (!success) return res.status(500).json({ success: false, error });

    return res.status(201).json({
      success: true,
      slug: normalizedSlug,
      isDefault: normalizedSlug === DEFAULT_START_PAGE_SLUG,
    });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
