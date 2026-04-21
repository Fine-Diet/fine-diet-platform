/**
 * POST /api/journal/plans/imports/meals/[id]/save
 *
 * Phase 4: promote an imported_meals draft into a reusable
 * journal_meal_templates record. The draft itself is preserved (not
 * deleted) so provenance remains auditable — promotion is creation of
 * a saved-meal, not a transformation.
 *
 * Body (optional): { name?: string }
 *
 * Response: { template_id: string, imported_meal_id: string }
 *
 * Auth: self-only write.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { ImportPromoteRequestSchema } from '@/lib/plans/validators';
import { promoteImportedMealToTemplate } from '@/lib/plans/importsServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing import id.' });

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;

    const parsed = ImportPromoteRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
    }

    try {
      const result = await promoteImportedMealToTemplate({
        personId: ctx.personId,
        importedMealId: id,
        name: parsed.data.name,
      });
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  } catch (err) {
    console.error('[API /journal/plans/imports/meals/:id/save POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
