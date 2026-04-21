/**
 * GET /api/journal/programs/[slug]/progress
 *
 * Returns the Packet 13 progress + resume summary for the signed-in
 * user and the given program slug. Returns 404 when the user doesn't
 * have the program (entitled or assigned) so we don't leak catalogue
 * metadata to unauthorized users.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { getLibraryDetailForPerson } from '@/lib/programs/programLibraryServerService';
import {
  getProgramProgressSummary,
} from '@/lib/programs/programProgressServerService';
import type { ProgramProgressSummary } from '@/lib/programs/progressTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramProgressSummary | { error: string }>,
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
    const summary = await getProgramProgressSummary(personId, slug);
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[journal/programs/[slug]/progress] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
