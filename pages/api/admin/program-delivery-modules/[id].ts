/**
 * Admin API: Program Delivery Module — get / update / archive (Packet 16)
 *
 * GET    /api/admin/program-delivery-modules/[id]
 * PATCH  /api/admin/program-delivery-modules/[id]
 * DELETE /api/admin/program-delivery-modules/[id] (archives, does not delete)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  archiveDeliveryModule,
  getDeliveryModuleById,
  ProgramDeliveryModuleUpdateSchema,
  updateDeliveryModule,
  type ProgramDeliveryModuleRow,
} from '@/lib/programs/deliveryModuleAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramDeliveryModuleRow | { ok: true } | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'id is required' });
  }

  if (req.method === 'GET') {
    try {
      const row = await getDeliveryModuleById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(row);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = ProgramDeliveryModuleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid delivery module patch.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateDeliveryModule(id, parsed.data);
      return res.status(200).json(updated);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await archiveDeliveryModule(id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
