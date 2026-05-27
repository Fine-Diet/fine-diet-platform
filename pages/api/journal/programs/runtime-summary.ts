/**
 * GET /api/journal/programs/runtime-summary
 *
 * Person-scoped runtime summaries for guided programs. Supports the standard
 * staff view-as-client pattern via ?person_id=.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  listProgramRuntimeSummariesForPerson,
} from '@/lib/programs/programRuntimeServerService';
import type { ProgramRuntimeSummaryList } from '@/lib/programs/runtimeTypes';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramRuntimeSummaryList | { error: string }>,
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
    const summary = await listProgramRuntimeSummariesForPerson(personId);
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[journal/programs/runtime-summary] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
