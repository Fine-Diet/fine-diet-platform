/**
 * GET /api/journal/programs/library
 *
 * User-facing program library for the signed-in person. Returns every
 * program that is entitled AND/OR assigned to them, with enough state
 * to drive the library UI (title, tagline, runtime state, primary
 * assignment, headline impact sentence).
 *
 * Supports staff view-as-client via `?person_id=` using the standard
 * `resolveJournalTargetPerson` pattern.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  listLibraryForPerson,
  type ProgramLibrary,
} from '@/lib/programs/programLibraryServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramLibrary | { error: string }>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return;

  try {
    const library = await listLibraryForPerson(personId);
    return res.status(200).json(library);
  } catch (err) {
    console.error('[journal/programs/library] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
