/**
 * Admin API: Program Delivery Modules — list & create (Packet 16)
 *
 * GET  /api/admin/programs/[id]/delivery-modules
 * POST /api/admin/programs/[id]/delivery-modules
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { getProgramById } from '@/lib/programs/programContentAdminServerService';
import {
  createDeliveryModule,
  listDeliveryModulesForProgram,
  ProgramDeliveryModuleCreateSchema,
  type ProgramDeliveryModuleRow,
} from '@/lib/programs/deliveryModuleAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    ProgramDeliveryModuleRow | ProgramDeliveryModuleRow[] | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const { id } = req.query;
  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'program id is required' });
  }

  if (req.method === 'GET') {
    try {
      const rows = await listDeliveryModulesForProgram(id);
      return res.status(200).json(rows);
    } catch (err) {
      console.error('[admin/programs/:id/delivery-modules GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramDeliveryModuleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid delivery module payload.',
        issues: parsed.error.flatten(),
      });
    }
    try {
      const program = await getProgramById(id);
      if (!program) return res.status(404).json({ error: 'Program not found' });
      const created = await createDeliveryModule(id, parsed.data);
      return res.status(201).json(created);
    } catch (err) {
      console.error('[admin/programs/:id/delivery-modules POST] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
