/**
 * GET /api/journal/plans/snapshot
 *
 * Returns the *live* PlanInputSnapshot (rebuilt from current
 * people.metadata + goals) plus the user's display-unit preferences.
 *
 * Why this exists:
 *   Plan.input_snapshot_json is a frozen audit record stamped at plan
 *   generation time. If the user later updates their DOB, height, or
 *   weight, the stored snapshot still shows the old values, which
 *   surfaces as stale age / wrong unit bugs in the Plans banner.
 *   The banner should always reflect current profile truth — this
 *   endpoint provides that view without mutating the stored plan.
 *
 * The shipped plan contract (nds_version, input_snapshot_json,
 * policy gate) is unchanged.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { buildPlanInputSnapshot } from '@/lib/plans/planServerService';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

function readDisplayUnit<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value !== 'string') return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const snapshot = await buildPlanInputSnapshot(personId);

    // Display units live in people.metadata and never enter the
    // structural snapshot (canonical cm/kg is the Zod contract).
    // Read them separately so the banner can format accurately.
    const { data: personRow } = await supabaseAdmin
      .from('people')
      .select('metadata')
      .eq('id', personId)
      .single();

    const md = (personRow?.metadata ?? {}) as Record<string, unknown>;
    const display = {
      height_display_unit: readDisplayUnit(
        md.height_display_unit,
        ['in', 'cm'] as const,
        'in',
      ),
      weight_display_unit: readDisplayUnit(
        md.weight_display_unit,
        ['lb', 'kg'] as const,
        'lb',
      ),
    };

    return res.status(200).json({ snapshot, display });
  } catch (err) {
    console.error('[API /journal/plans/snapshot] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
