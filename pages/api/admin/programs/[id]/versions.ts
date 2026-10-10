/**
 * GET /api/admin/programs/[id]/versions
 *
 * Read-only version list for composition authoring. Does not publish,
 * enroll, or change runtime rows.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireRoleFromApi } from '@/lib/authServer';
import { getProgramById } from '@/lib/programs/programContentAdminServerService';
import {
  createProgramVersionDraft,
  listProgramVersionsForProgram,
} from '@/lib/programs/deliveryModuleAdminServerService';

const CreateDraftSchema = z.object({
  source_version_id: z.string().uuid().nullable().optional(),
  version_label: z.string().trim().max(120).nullable().optional(),
  duration_days: z.number().int().min(1).max(3650).nullable().optional(),
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
    const program = await getProgramById(id);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    if (req.method === 'GET') {
      const versions = await listProgramVersionsForProgram(id);
      return res.status(200).json(versions);
    }
    if (req.method === 'POST') {
      const parsed = CreateDraftSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid draft version request.',
          issues: parsed.error.flatten(),
        });
      }
      const version = await createProgramVersionDraft({
        programId: id,
        sourceVersionId: parsed.data.source_version_id,
        versionLabel: parsed.data.version_label,
        durationDays: parsed.data.duration_days,
      });
      return res.status(201).json(version);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({
      error: message,
    });
  }
}
