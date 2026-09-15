import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import {
  commitLogNutritionDraft,
  LogNutritionDraftCommitValidationError,
  type LogNutritionDraftCommitInput,
} from '@/lib/logDraft/logNutritionDraftServerService';
import { readRequestTimeZone } from '@/lib/journal/consumedTimeZoneRequest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;
  if (!(await requireCallerJournalAccess(res, ctx))) return;

  try {
    const result = await commitLogNutritionDraft(ctx.personId, {
      ...((req.body ?? {}) as LogNutritionDraftCommitInput),
      // Overwrite unconditionally: day provenance is header-derived and
      // server-owned, so a body field of the same name must never reach the
      // write boundary.
      requestTimeZone: readRequestTimeZone(req.headers),
    });
    return res.status(result.alreadyCommitted ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof LogNutritionDraftCommitValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[POST /api/journal/log-drafts/commit]', error);
    return res.status(500).json({ error: 'Unable to commit Log Draft.' });
  }
}
