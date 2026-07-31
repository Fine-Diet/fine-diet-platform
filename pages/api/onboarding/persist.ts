/**
 * POST /api/onboarding/persist
 *
 * Package 2 single writer for onboarding progress / skip / completion.
 * Profile POST must not independently complete onboarding.
 *
 * Body: {
 *   mode: 'progress' | 'complete' | 'skip' | 'started',
 *   answers?: OnboardingAnswers,
 *   lastStep?: number,
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { buildProfilePatch } from '@/lib/onboarding/buildProfilePatch';
import {
  INITIAL_ANSWERS,
  type OnboardingAnswers,
} from '@/lib/onboarding/defaultOnboardingFlow';

const COLUMN_FIELDS = ['first_name', 'last_name'] as const;

function coerceAnswers(raw: unknown): OnboardingAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return INITIAL_ANSWERS;
  return { ...INITIAL_ANSWERS, ...(raw as Partial<OnboardingAnswers>) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;
  if (!(await requireCallerJournalAccess(res, ctx))) return;

  const mode = req.body?.mode as string | undefined;
  if (mode !== 'progress' && mode !== 'complete' && mode !== 'skip' && mode !== 'started') {
    return res.status(400).json({ error: 'Invalid mode' });
  }

  const { personId } = ctx;

  try {
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('people')
      .select('metadata')
      .eq('id', personId)
      .single();

    if (fetchErr || !current) {
      return res.status(500).json({ error: 'Failed to read current profile' });
    }

    const currentMeta = (current.metadata ?? {}) as Record<string, unknown>;

    if (mode === 'started') {
      if (!currentMeta.onboarding_started_at) {
        const updatedMeta = {
          ...currentMeta,
          onboarding_started_at: new Date().toISOString(),
        };
        const { error } = await supabaseAdmin
          .from('people')
          .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
          .eq('id', personId);
        if (error) {
          return res.status(500).json({ error: 'Failed to mark onboarding started' });
        }
      }
      return res.status(200).json({ ok: true, mode });
    }

    const answers = coerceAnswers(req.body?.answers);
    const lastStep =
      typeof req.body?.lastStep === 'number' ? req.body.lastStep : undefined;
    const patch = buildProfilePatch(answers, {
      mode: mode === 'progress' ? 'progress' : mode === 'skip' ? 'skip' : 'complete',
      lastStep,
    });

    if (mode === 'complete' || mode === 'skip') {
      if (!currentMeta.onboarding_started_at) {
        patch.onboarding_started_at = new Date().toISOString();
      }
    }

    const metaUpdates: Record<string, unknown> = {};
    const columnUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(patch)) {
      if ((COLUMN_FIELDS as readonly string[]).includes(key)) {
        columnUpdates[key] = value;
      } else {
        metaUpdates[key] = value;
      }
    }

    // Explicit null clears (e.g. clearing skip on complete).
    const updatedMeta = { ...currentMeta, ...metaUpdates };
    for (const [key, value] of Object.entries(metaUpdates)) {
      if (value === null) delete updatedMeta[key];
    }

    const { error: updateErr } = await supabaseAdmin
      .from('people')
      .update({ ...columnUpdates, metadata: updatedMeta, updated_at: new Date().toISOString() })
      .eq('id', personId);

    if (updateErr) {
      console.error('[API /onboarding/persist] Update error:', updateErr);
      return res.status(500).json({ error: 'Failed to persist onboarding' });
    }

    return res.status(200).json({ ok: true, mode });
  } catch (err) {
    console.error('[API /onboarding/persist] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
