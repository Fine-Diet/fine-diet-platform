/**
 * POST /api/journal/programs/enroll
 *
 * Creates (or returns existing) guided-program enrollment for the signed-in
 * person or an authorized staff target. The runtime service locks the row to a
 * published program_version and verifies entitlement/assignment access.
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
  createProgramEnrollmentFromAccess,
  getProgramRuntimeSummaryForPerson,
} from '@/lib/programs/programRuntimeServerService';
import type {
  ProgramCapacity,
  ProgramRuntimeSummary,
} from '@/lib/programs/runtimeTypes';

const EnrollSchema = z.object({
  person_id: z.string().uuid().optional(),
  program_slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  selected_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(1).max(128).optional(),
  current_capacity: z.enum(['low', 'steady', 'high']).optional(),
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
    res.status(403).json({ error: 'Access denied to write this person\'s program runtime' });
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

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveWriteTargetPerson(req, res, ctx);
  if (!personId) return;

  const parsed = EnrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid enrollment payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const enrollment = await createProgramEnrollmentFromAccess({
      personId,
      programSlug: parsed.data.program_slug,
      selectedStartDate: parsed.data.selected_start_date,
      timezone: parsed.data.timezone ?? 'UTC',
      currentCapacity: parsed.data.current_capacity as ProgramCapacity | undefined,
    });

    const summary = await getProgramRuntimeSummaryForPerson(personId, enrollment.id);
    if (!summary) {
      return res.status(500).json({ error: 'Enrollment summary unavailable.' });
    }
    return res.status(201).json(summary);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const status =
      code === 'PROGRAM_ACCESS_DENIED' ||
      code === 'PROGRAM_ENTITLEMENT_DENIED' ||
      code === 'PROGRAM_ASSIGNMENT_DENIED'
        ? 403
        : /No matching published runtime version|not found/i.test(
              err instanceof Error ? err.message : '',
            )
          ? 404
          : 500;
    console.error('[journal/programs/enroll] error:', err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
