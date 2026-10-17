import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import { completeProgramDay, getProgramDayCompletion, PROGRAM_DAY_READ_ONLY } from '@/lib/programs/programDayInteractionServerService';

const PostBodySchema = z.object({ day: z.number().int().min(0).max(10000) });
const MAX_DAY = 10000;

function readGetDay(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const day = Number(value);
  if (!Number.isSafeInteger(day) || day > MAX_DAY) return undefined;
  return day;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const enrollmentId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!z.string().uuid().safeParse(enrollmentId).success) {
    return res.status(400).json({ error: 'Invalid enrollment id.' });
  }
  const ctx = await requireJournalAuth(req, res);
  if (!ctx || !(await requireCallerJournalAccess(res, ctx))) return;
  let day: number;
  if (req.method === 'GET') {
    const parsedDay = readGetDay(req.query.day);
    if (parsedDay === undefined) return res.status(400).json({ error: 'Invalid day completion payload.' });
    day = parsedDay;
  } else {
    const parsed = PostBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid day completion payload.', issues: parsed.error.flatten() });
    day = parsed.data.day;
  }
  try {
    const input = { personId: ctx.personId, enrollmentId: enrollmentId!, day };
    const completion = req.method === 'GET'
      ? await getProgramDayCompletion(input)
      : await completeProgramDay(input);
    return res.status(200).json(completion);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const status = code === 'PROGRAM_ENROLLMENT_NOT_FOUND' ? 404
      : code === 'PROGRAM_DAY_NOT_UNLOCKED' || code === 'PROGRAM_DAY_REQUIREMENTS_UNMET' || code === PROGRAM_DAY_READ_ONLY ? 409
        : 500;
    console.error('[journal/programs/enrollments/:id/complete-day] error:', err);
    return res.status(status).json({ error: err instanceof Error ? err.message : 'Server error', code });
  }
}
