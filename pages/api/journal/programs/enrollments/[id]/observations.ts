import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  requireCallerJournalAccess,
  requireJournalAuth,
} from '@/lib/access/requireJournalAccess';
import {
  getProgramDayObservation,
  PROGRAM_DAY_READ_ONLY,
  writeProgramDayObservation,
} from '@/lib/programs/programDayInteractionServerService';

const IdentitySchema = z.object({
  day: z.coerce.number().int().min(0).max(10000),
  content_key: z.string().regex(/^[a-z0-9][a-z0-9-_]{0,119}$/),
});
const WriteSchema = IdentitySchema.extend({
  text: z.string().max(20000),
  action: z.enum(['draft', 'save']),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'PUT'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const enrollmentId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!z.string().uuid().safeParse(enrollmentId).success) {
    return res.status(400).json({ error: 'Invalid enrollment id.' });
  }
  const ctx = await requireJournalAuth(req, res);
  if (!ctx || !(await requireCallerJournalAccess(res, ctx))) return;
  try {
    if (req.method === 'GET') {
      const parsed = IdentitySchema.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid observation identity.', issues: parsed.error.flatten() });
      const result = await getProgramDayObservation({ personId: ctx.personId, enrollmentId: enrollmentId!, day: parsed.data.day, contentKey: parsed.data.content_key });
      return res.status(200).json(result);
    }
    const parsed = WriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid observation payload.', issues: parsed.error.flatten() });
    const result = await writeProgramDayObservation({
      personId: ctx.personId,
      enrollmentId: enrollmentId!,
      day: parsed.data.day,
      contentKey: parsed.data.content_key,
      text: parsed.data.text,
      commit: parsed.data.action === 'save',
    });
    return res.status(200).json(result);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const status = code === 'PROGRAM_ENROLLMENT_NOT_FOUND' ? 404
      : code === 'PROGRAM_DAY_MODULE_NOT_FOUND' ? 404
        : code === 'PROGRAM_DAY_NOT_UNLOCKED' || code === PROGRAM_DAY_READ_ONLY ? 409
          : 500;
    console.error('[journal/programs/enrollments/:id/observations] error:', err);
    return res.status(status).json({ error: err instanceof Error ? err.message : 'Server error', code });
  }
}
