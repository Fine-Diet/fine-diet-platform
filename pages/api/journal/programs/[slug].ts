/**
 * GET /api/journal/programs/[slug]
 *
 * User-facing detail for a single program the signed-in user has access
 * to (either entitled or assigned). Returns 404 when neither applies so
 * we don't leak catalogue metadata to unauthorized users.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  getLibraryDetailForPerson,
  type ProgramLibraryDetail,
} from '@/lib/programs/programLibraryServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramLibraryDetail | { error: string }>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawSlug = req.query.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug is required' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return;

  try {
    const detail = await getLibraryDetailForPerson(personId, slug);
    if (!detail) {
      return res.status(404).json({ error: 'Program not found for user' });
    }
    return res.status(200).json(detail);
  } catch (err) {
    console.error('[journal/programs/[slug]] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
