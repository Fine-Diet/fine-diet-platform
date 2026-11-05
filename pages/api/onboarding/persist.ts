/**
 * POST /api/onboarding/persist
 *
 * Package 2 single writer for onboarding progress / skip / completion.
 * Profile POST must not independently complete onboarding.
 *
 * Body: {
 *   mode: 'progress' | 'complete' | 'skip' | 'started' | 'resume',
 *   answers?: OnboardingAnswers,
 *   lastStep?: number,
 *   resumeToken?: string, // issued by authenticated resume mode; progress only
 * }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { requireJournalAuth, requireCallerJournalAccess } from '@/lib/access/requireJournalAccess';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { buildProfilePatch } from '@/lib/onboarding/buildProfilePatch';
import { deriveOnboardingState } from '@/lib/onboarding/onboardingState';
import {
  coerceOnboardingAnswersForPermissiveMode,
  parseOnboardingAnswersPayload,
  validateRequiredOnboardingAnswers,
} from '@/lib/onboarding/requiredAnswersValidator';

const COLUMN_FIELDS = ['first_name', 'last_name'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;
  if (!(await requireCallerJournalAccess(res, ctx))) return;

  const mode = req.body?.mode as string | undefined;
  if (mode !== 'progress' && mode !== 'complete' && mode !== 'skip' && mode !== 'started' && mode !== 'resume') {
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
    const lifecycle = deriveOnboardingState(currentMeta);

    if (mode === 'skip' && lifecycle.phase === 'completed') {
      return res.status(409).json({ error: 'onboarding_already_completed' });
    }

    if (mode === 'resume') {
      if (lifecycle.phase !== 'skipped' || !lifecycle.skippedAt) {
        return res.status(409).json({ error: 'onboarding_not_resumable' });
      }

      if (typeof currentMeta.onboarding_resume_token === 'string') {
        return res.status(200).json({
          ok: true,
          mode,
          resumeToken: currentMeta.onboarding_resume_token,
        });
      }

      const resumeToken = randomUUID();
      const restartedAt = new Date().toISOString();
      const resumedMeta = {
        ...currentMeta,
        onboarding_resume_token: resumeToken,
        onboarding_restarted_at: restartedAt,
      };
      const { data: resumed, error: resumeErr } = await supabaseAdmin
        .from('people')
        .update({ metadata: resumedMeta, updated_at: restartedAt })
        .eq('id', personId)
        .is('metadata->>onboarding_completed_at', null)
        .eq('metadata->>onboarding_skipped_at', lifecycle.skippedAt)
        .select('id')
        .maybeSingle();

      if (resumeErr) {
        console.error('[API /onboarding/persist] Resume error:', resumeErr);
        return res.status(500).json({ error: 'Failed to resume onboarding' });
      }
      if (!resumed) {
        return res.status(409).json({ error: 'onboarding_resume_conflict' });
      }
      return res.status(200).json({ ok: true, mode, resumeToken });
    }

    if (mode === 'started') {
      if (lifecycle.phase === 'completed' || lifecycle.phase === 'skipped') {
        return res.status(200).json({ ok: true, mode });
      }
      if (!currentMeta.onboarding_started_at) {
        const updatedMeta = {
          ...currentMeta,
          onboarding_started_at: new Date().toISOString(),
        };
        const { error } = await supabaseAdmin
          .from('people')
          .update({ metadata: updatedMeta, updated_at: new Date().toISOString() })
          .eq('id', personId)
          .is('metadata->>onboarding_completed_at', null)
          .is('metadata->>onboarding_skipped_at', null);
        if (error) {
          return res.status(500).json({ error: 'Failed to mark onboarding started' });
        }
      }
      return res.status(200).json({ ok: true, mode });
    }

    const resumeToken = typeof req.body?.resumeToken === 'string' ? req.body.resumeToken : null;
    if (mode === 'progress') {
      if (lifecycle.phase === 'completed') {
        return res.status(200).json({ ok: true, mode });
      }
      if (
        lifecycle.phase === 'skipped' &&
        (!resumeToken || resumeToken !== currentMeta.onboarding_resume_token)
      ) {
        return res.status(200).json({ ok: true, mode });
      }
    }

    let answers;
    if (mode === 'complete') {
      // Fail closed: never coerce absence to INITIAL_ANSWERS for completion.
      const parsed = parseOnboardingAnswersPayload(req.body?.answers);
      if (!parsed.ok || !parsed.answers) {
        return res.status(400).json({
          error: 'invalid_onboarding_answers',
          reason: parsed.error ?? 'missing_answers',
          message: 'Completion requires a valid answers payload with all required fields.',
        });
      }
      const validation = validateRequiredOnboardingAnswers(parsed.answers);
      if (!validation.ok) {
        return res.status(400).json({
          error: 'incomplete_required_onboarding_answers',
          missingRequiredKeys: validation.missingRequiredKeys,
          message: 'Completion requires all required onboarding answers.',
        });
      }
      answers = parsed.answers;
    } else {
      // progress / skip remain permissive and never write completion truth.
      answers = coerceOnboardingAnswersForPermissiveMode(req.body?.answers);
    }

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
    if (mode === 'complete' || mode === 'skip') {
      // A new final state invalidates any token issued for an earlier skip.
      delete updatedMeta.onboarding_resume_token;
    }

    let updateQuery = supabaseAdmin
      .from('people')
      .update({ ...columnUpdates, metadata: updatedMeta, updated_at: new Date().toISOString() })
      .eq('id', personId);

    if (mode === 'skip') {
      // A stale Skip must not replace a completion written after this request
      // read metadata. PostgREST applies this predicate atomically with UPDATE.
      const { data: skipped, error: skipErr } = await updateQuery
        .is('metadata->>onboarding_completed_at', null)
        .select('id')
        .maybeSingle();

      if (skipErr) {
        console.error('[API /onboarding/persist] Update error:', skipErr);
        return res.status(500).json({ error: 'Failed to persist onboarding' });
      }
      if (!skipped) {
        return res.status(409).json({ error: 'onboarding_finalization_conflict' });
      }
      return res.status(200).json({ ok: true, mode });
    }

    if (mode === 'progress') {
      // Make a late, in-flight progress request re-check final state when its
      // UPDATE acquires the row lock. This also covers client request aborts
      // where the server may still finish processing the request.
      updateQuery = updateQuery.is('metadata->>onboarding_completed_at', null);
      if (lifecycle.phase === 'skipped' && lifecycle.skippedAt && resumeToken) {
        updateQuery = updateQuery
          .eq('metadata->>onboarding_skipped_at', lifecycle.skippedAt)
          .eq('metadata->>onboarding_resume_token', resumeToken);
      } else {
        updateQuery = updateQuery.is('metadata->>onboarding_skipped_at', null);
      }
    }

    const { error: updateErr } = await updateQuery;

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
