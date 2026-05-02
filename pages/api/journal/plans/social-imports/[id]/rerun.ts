/**
 * POST /api/journal/plans/social-imports/[id]/rerun
 *
 * Rerun social evidence extraction after the user adds assisted text,
 * on-screen text, or a hint. Prior evidence is retained for provenance.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import { SocialImportRerunRequestSchema } from '@/lib/plans/socialEvidenceImport/schemas';
import { rerunSocialImport } from '@/lib/plans/socialEvidenceImport/socialImportService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing social import id.' });

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const parsed = SocialImportRerunRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    const detail = await rerunSocialImport({
      personId: ctx.personId,
      jobId: id,
      input: parsed.data,
    });
    if (!detail) return res.status(404).json({ error: 'Social import not found.' });
    return res.status(200).json({ social_import: detail });
  } catch (err) {
    console.error('[API /journal/plans/social-imports/:id/rerun POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
