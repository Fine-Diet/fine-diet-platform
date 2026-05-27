/**
 * POST /api/journal/programs/checkins/respond
 *
 * Writes a completed or explicitly skipped guided-program check-in response.
 * The service verifies the enrollment belongs to the target person before
 * writing through service_role.
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
  respondToProgramCheckin,
} from '@/lib/programs/programRuntimeServerService';
import type {
  ProgramCheckinResponseResult,
} from '@/lib/programs/runtimeTypes';

const RespondSchema = z
  .object({
    person_id: z.string().uuid().optional(),
    enrollment_id: z.string().uuid(),
    checkin_template_id: z.string().uuid().optional().nullable(),
    checkin_day: z.number().int().min(1).optional().nullable(),
    response_status: z.enum(['completed', 'skipped']),
    responses_json: z.record(z.string(), z.unknown()).optional(),
    skipped_reason: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.checkin_template_id && value.checkin_day == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkin_day'],
        message: 'checkin_template_id or checkin_day is required.',
      });
    }
    if (value.response_status === 'completed' && !value.responses_json) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responses_json'],
        message: 'responses_json is required for completed check-ins.',
      });
    }
  });

async function resolveWriteTargetPerson(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: Awaited<ReturnType<typeof requireJournalAuth>>,
): Promise<string | null> {
  if (!ctx) return null;
  const targetPersonId =
    req.body && typeof req.body.person_id === 'string'
      ? req.body.person_id
      : undefined;

  if (!targetPersonId || targetPersonId === ctx.personId) {
    return (await requireCallerJournalAccess(res, ctx)) ? ctx.personId : null;
  }

  if (!z.string().uuid().safeParse(targetPersonId).success) {
    res.status(400).json({ error: 'person_id must be a valid UUID' });
    return null;
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
  res: NextApiResponse<
    ProgramCheckinResponseResult | { error: string; issues?: unknown }
  >,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireJournalAuth(req, res);
  if (!ctx) return;

  const personId = await resolveWriteTargetPerson(req, res, ctx);
  if (!personId) return;

  const parsed = RespondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid check-in response payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const result = await respondToProgramCheckin({
      personId,
      enrollmentId: parsed.data.enrollment_id,
      checkinTemplateId: parsed.data.checkin_template_id ?? null,
      checkinDay: parsed.data.checkin_day ?? null,
      responseStatus: parsed.data.response_status,
      responsesJson: parsed.data.responses_json ?? {},
      skippedReason: parsed.data.skipped_reason ?? null,
    });
    return res.status(200).json(result);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const status =
      code === 'PROGRAM_ENROLLMENT_NOT_FOUND'
        ? 404
        : code === 'PROGRAM_CHECKIN_TEMPLATE_DENIED'
          ? 403
          : 500;
    console.error('[journal/programs/checkins/respond] error:', err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
