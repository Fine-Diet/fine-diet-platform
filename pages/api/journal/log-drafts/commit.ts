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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;
  if (!(await requireCallerJournalAccess(res, ctx))) return;

  try {
    const result = await commitLogNutritionDraft(
      ctx.personId,
      (req.body ?? {}) as LogNutritionDraftCommitInput,
    );
    return res.status(result.alreadyCommitted ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof LogNutritionDraftCommitValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[POST /api/journal/log-drafts/commit]', error);
    return res.status(500).json({ error: 'Unable to commit Log Draft.' });
  }
}
