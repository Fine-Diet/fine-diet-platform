/**
 * POST /api/journal/programs/items/[itemId]/progress
 *
 * Upsert the signed-in user's progress on a single Packet 12 content
 * item. Body shape (Packet 13 §5):
 *   { status: 'not_started' | 'in_progress' | 'completed',
 *     progress_percent?: number | null,
 *     notes?: string | null }
 *
 * Returns the updated row plus a fresh program progress summary so the
 * client can re-render CTA + completion counts in one round trip.
 *
 * 403 is returned when the item belongs to a program the user has no
 * access to (no active `program:<slug>` entitlement and no assignment).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  upsertItemStatus,
  getProgramProgressSummary,
} from '@/lib/programs/programProgressServerService';
import { ProgressStatusPatchSchema } from '@/lib/programs/progressValidators';
import type {
  ProgramContentProgress,
  ProgramProgressSummary,
} from '@/lib/programs/progressTypes';

interface ProgressWriteResponse {
  progress: ProgramContentProgress;
  summary: ProgramProgressSummary;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgressWriteResponse | { error: string }>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawItemId = req.query.itemId;
  const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;
  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'itemId is required' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveJournalTargetPerson(req, res, ctx);
  if (!personId) return;

  const parsed = ProgressStatusPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: `Invalid body: ${parsed.error.message}`,
    });
  }

  try {
    const progress = await upsertItemStatus({
      personId,
      contentItemId: itemId,
      status: parsed.data.status,
      progressPercent: parsed.data.progress_percent ?? null,
      notes: parsed.data.notes ?? null,
    });
    const summary = await getProgramProgressSummary(
      personId,
      progress.program_slug,
    );
    return res.status(200).json({ progress, summary });
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'PROGRAM_ACCESS_DENIED') {
      return res.status(403).json({
        error: 'Program access denied for progress write.',
      });
    }
    const message = err instanceof Error ? err.message : 'Server error';
    if (message === 'Content item not found.') {
      return res.status(404).json({ error: message });
    }
    console.error('[journal/programs/items/[itemId]/progress] error:', err);
    return res.status(500).json({ error: message });
  }
}
