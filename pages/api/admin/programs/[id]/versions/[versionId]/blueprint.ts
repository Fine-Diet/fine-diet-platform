/**
 * PUT /api/admin/programs/[id]/versions/[versionId]/blueprint
 *
 * Saves validated programBlueprintV1 metadata on a draft version. It does not
 * publish, enroll, or replace unrelated metadata.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ZodError } from 'zod';
import { requireRoleFromApi } from '@/lib/authServer';
import { getProgramById } from '@/lib/programs/programContentAdminServerService';
import { saveProgramBlueprintMetadataForDraft } from '@/lib/programs/deliveryModuleAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const programId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const versionId = Array.isArray(req.query.versionId)
    ? req.query.versionId[0]
    : req.query.versionId;
  if (!programId || !versionId) {
    return res.status(400).json({ error: 'program id and version id are required' });
  }

  try {
    const program = await getProgramById(programId);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    const blueprint = req.body && typeof req.body === 'object' && 'programBlueprintV1' in req.body
      ? (req.body as { programBlueprintV1: unknown }).programBlueprintV1
      : req.body;
    const version = await saveProgramBlueprintMetadataForDraft({
      programId,
      programVersionId: versionId,
      blueprint,
    });
    return res.status(200).json(version);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Invalid programBlueprintV1 metadata.',
        issues: err.flatten(),
      });
    }
    const message = err instanceof Error ? err.message : 'Server error';
    const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined;
    const status = code === 'VERSION_PROGRAM_MISMATCH' || /not found/i.test(message)
      ? 404
      : code === 'COMPOSITION_WRITE_REJECTED' || /immutable|draft|duration|protected/i.test(message)
        ? 409
        : 500;
    return res.status(status).json({ error: message });
  }
}
