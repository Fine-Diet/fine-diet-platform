/**
 * GET and draft-only POST for versioned check-in templates.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  listCheckinTemplatesForVersion,
  saveCheckinTemplateForDraft,
} from '@/lib/programs/deliveryModuleAdminServerService';

const SaveSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  version_id: z.string().uuid(),
  checkin_day: z.number().int().min(1),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(2000).optional().nullable(),
  prompt_md: z.string().max(12000).optional().nullable(),
  questions_json: z.array(z.unknown()).default([]),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'program id is required' });
  }

  try {
    if (req.method === 'GET') {
      const rawVersion = req.query.version_id;
      const versionId = Array.isArray(rawVersion) ? rawVersion[0] : rawVersion;
      if (typeof versionId !== 'string' || !versionId) {
        return res.status(400).json({ error: 'version_id is required' });
      }
      const templates = await listCheckinTemplatesForVersion(id, versionId);
      return res.status(200).json(templates);
    }
    if (req.method === 'POST') {
      const parsed = SaveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid check-in template.', issues: parsed.error.flatten() });
      }
      const saved = await saveCheckinTemplateForDraft({
        programId: id,
        programVersionId: parsed.data.version_id,
        id: parsed.data.id,
        checkinDay: parsed.data.checkin_day,
        title: parsed.data.title,
        description: parsed.data.description,
        promptMd: parsed.data.prompt_md,
        questionsJson: parsed.data.questions_json,
      });
      return res.status(parsed.data.id ? 200 : 201).json(saved);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    const status = code === 'VERSION_PROGRAM_MISMATCH' ? 400 : code === 'COMPOSITION_WRITE_REJECTED' ? 409 : 500;
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
