/**
 * GET /api/journal/program-runtime/summary
 *
 * User-facing runtime summary of the signed-in person's active program
 * assignments and the inherited guidance that's currently affecting
 * their Plans experience. Read-only.
 *
 * Supports the journal auth pattern used elsewhere in `/api/journal/*`:
 *   - requireJournalAuth → authenticate + resolve the caller's person_id
 *   - resolveJournalTargetPerson → allow staff view-as-client via
 *     ?person_id=, bounded by canActOnClient and the target's own
 *     journal entitlement.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  buildProgramRuntimeSummary,
  type ProgramRuntimeSummary,
} from '@/lib/plans/programRuntimeSummaryServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramRuntimeSummary | { error: string }>,
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
    const summary = await buildProgramRuntimeSummary(personId);
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[program-runtime/summary] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
