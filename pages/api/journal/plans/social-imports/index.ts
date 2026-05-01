/**
 * POST /api/journal/plans/social-imports
 *
 * Social Recipe Evidence Importer v1. New-build route for social video/post
 * evidence recovery; it does not call the deterministic recipe paste parser
 * as the extraction core.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import { SocialImportCreateRequestSchema } from '@/lib/plans/socialEvidenceImport/schemas';
import { createSocialImport } from '@/lib/plans/socialEvidenceImport/socialImportService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const parsed = SocialImportCreateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    const detail = await createSocialImport({
      personId: ctx.personId,
      input: parsed.data,
    });
    return res.status(201).json({ social_import: detail });
  } catch (err) {
    console.error('[API /journal/plans/social-imports POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
