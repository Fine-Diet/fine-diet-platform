/**
 * GET  /api/journal/plans           — list current person's plans
 * POST /api/journal/plans           — manual plan stub (empty plan, no meals)
 *
 * Auth: three-step pattern.
 *   - requireJournalAuth
 *   - resolveJournalTargetPerson (GET, supports view-as-client)
 *   - requireCallerJournalAccess (POST, self-only)
 *
 * AI-driven plan generation is handled by /ai/generate, not this route.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  listPlansForPerson,
  buildPlanInputSnapshot,
} from '@/lib/plans/planServerService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const targetPersonId = await resolveJournalTargetPerson(req, res, ctx);
      if (!targetPersonId) return;
      const plans = await listPlansForPerson(targetPersonId);
      return res.status(200).json({ plans });
    }

    if (req.method === 'POST') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;
      const body = (req.body ?? {}) as {
        title?: string | null;
        plan_shape?: 'day' | 'week' | 'multi_day';
        start_date?: string;
        end_date?: string | null;
      };

      if (!body.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
        return res.status(400).json({ error: 'start_date (YYYY-MM-DD) is required' });
      }
      const plan_shape = body.plan_shape ?? 'week';
      const snapshot = await buildPlanInputSnapshot(personId);

      const { data, error } = await supabaseAdmin
        .from('plans')
        .insert({
          person_id: personId,
          title: body.title ?? null,
          plan_shape,
          source: 'user_manual',
          status: 'draft',
          start_date: body.start_date,
          end_date: body.end_date ?? null,
          input_snapshot_json: snapshot,
          nds_version: NDS_VERSION,
          classifier_version: CLASSIFIER_VERSION,
        })
        .select('*')
        .single();

      if (error) {
        console.error('[API /journal/plans] create error:', error);
        return res.status(500).json({ error: 'Failed to create plan' });
      }

      return res.status(201).json({ plan: data });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
