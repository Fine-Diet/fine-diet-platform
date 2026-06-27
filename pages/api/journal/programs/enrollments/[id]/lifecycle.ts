/**
 * POST /api/journal/programs/enrollments/[id]/lifecycle
 *
 * Guarded enrollment lifecycle endpoint (P2). Performs pause / resume / cancel
 * / complete transitions for the signed-in person or an authorized staff
 * target. Legal-transition guards and the actual writes live in the runtime
 * service; this handler only does auth, validation, and error mapping.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { canActOnClient } from '@/lib/access/accessLinkService';
import { hasJournalAccess } from '@/lib/access/accessService';
import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import {
  applyProgramEnrollmentLifecycleAction,
  PROGRAM_LIFECYCLE_TRANSITION_DENIED,
} from '@/lib/programs/programRuntimeServerService';
import {
  PROGRAM_LIFECYCLE_ACTIONS,
  type ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';

const LifecycleSchema = z.object({
  person_id: z.string().uuid().optional(),
  action: z.enum(
    PROGRAM_LIFECYCLE_ACTIONS as unknown as [string, ...string[]],
  ),
});

async function resolveWriteTargetPerson(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: Awaited<ReturnType<typeof requireJournalAuth>>,
): Promise<string | null> {
  if (!ctx) return null;
  const parsed = z
    .object({ person_id: z.string().uuid().optional() })
    .safeParse(req.body ?? {});
  const targetPersonId = parsed.success ? parsed.data.person_id : undefined;

  if (!targetPersonId || targetPersonId === ctx.personId) {
    return (await requireCallerJournalAccess(res, ctx)) ? ctx.personId : null;
  }

  const authorised = await canActOnClient(
    ctx.user.role,
    ctx.personId,
    targetPersonId,
    'journal_write',
  );
  if (!authorised) {
    res
      .status(403)
      .json({ error: "Access denied to write this person's program runtime" });
    return null;
  }

  if (!(await hasJournalAccess(targetPersonId))) {
    res.status(403).json({ error: 'Target person does not have journal access' });
    return null;
  }

  return targetPersonId;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramRuntimeSummary | { error: string; issues?: unknown }>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const enrollmentId = Array.isArray(req.query.id)
    ? req.query.id[0]
    : req.query.id;
  if (!enrollmentId || !z.string().uuid().safeParse(enrollmentId).success) {
    return res.status(400).json({ error: 'Invalid enrollment id.' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveWriteTargetPerson(req, res, ctx);
  if (!personId) return;

  const parsed = LifecycleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid lifecycle payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const summary = await applyProgramEnrollmentLifecycleAction({
      personId,
      enrollmentId,
      action: parsed.data.action as (typeof PROGRAM_LIFECYCLE_ACTIONS)[number],
    });
    return res.status(200).json(summary);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const status =
      code === PROGRAM_LIFECYCLE_TRANSITION_DENIED
        ? 409
        : code === 'PROGRAM_ENROLLMENT_NOT_FOUND'
          ? 404
          : 500;
    console.error('[journal/programs/enrollments/lifecycle] error:', err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
