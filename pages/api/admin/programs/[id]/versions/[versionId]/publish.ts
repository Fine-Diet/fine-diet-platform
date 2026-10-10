/** POST /api/admin/programs/[id]/versions/[versionId]/publish */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { getProgramById } from '@/lib/programs/programContentAdminServerService';
import { publishProgramVersion } from '@/lib/programs/deliveryModuleAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
    const version = await publishProgramVersion({
      programId,
      programVersionId: versionId,
    });
    return res.status(200).json(version);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    const status = /not found/i.test(message) ? 404 : /draft|immutable|duration|delivery module|version/i.test(message) ? 409 : 500;
    return res.status(status).json({ error: message });
  }
}
