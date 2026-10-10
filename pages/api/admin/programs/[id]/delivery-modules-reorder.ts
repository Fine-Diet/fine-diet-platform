/**
 * Admin API: Program Delivery Modules — reorder (Packet 16)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ReorderSchema } from '@/lib/programs/contentValidators';
import {
  reorderDeliveryModules,
  type ProgramDeliveryModuleRow,
} from '@/lib/programs/deliveryModuleAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramDeliveryModuleRow[] | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'program id is required' });
  }

  const parsed = ReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid reorder payload.',
      issues: parsed.error.flatten(),
    });
  }

  const rawVersion = req.query.version_id;
  const versionId = Array.isArray(rawVersion) ? rawVersion[0] : rawVersion;
  if (typeof versionId !== 'string' || !versionId) {
    return res.status(400).json({ error: 'version_id is required' });
  }
  const scope = versionId === 'unversioned' ? null : versionId;

  try {
    const rows = await reorderDeliveryModules(id, parsed.data.ordered_ids, scope);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[admin/programs/:id/delivery-modules-reorder] error:', err);
    const code = (err as { code?: string } | undefined)?.code;
    const status =
      code === 'VERSION_SCOPE_MISMATCH' || code === 'VERSION_PROGRAM_MISMATCH'
        ? 400
        : 500;
    return res.status(status).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
