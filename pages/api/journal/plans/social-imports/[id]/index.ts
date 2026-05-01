/**
 * GET /api/journal/plans/social-imports/[id]
 *
 * Read a Social Recipe Evidence Importer v1 job, separated evidence,
 * latest extraction, and linked editable draft when present.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { getSocialImportDetail } from '@/lib/plans/socialEvidenceImport/socialImportService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing social import id.' });

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    const target = await resolveJournalTargetPerson(req, res, ctx);
    if (!target) return;

    const detail = await getSocialImportDetail(target, id);
    if (!detail) return res.status(404).json({ error: 'Social import not found.' });
    return res.status(200).json({ social_import: detail });
  } catch (err) {
    console.error('[API /journal/plans/social-imports/:id GET] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
