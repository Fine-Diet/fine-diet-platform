/**
 * Admin API: AI model configs (Plans Phase 16)
 *
 * GET /api/admin/ai/models
 *   Returns all model configs, sorted.
 *
 * Auth: admin or editor.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { listModelConfigs } from '@/lib/ai/runtime/aiConfigServerService';
import type { AIModelConfig } from '@/lib/ai/runtime/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ rows: AIModelConfig[] } | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rows = await listModelConfigs();
    return res.status(200).json({ rows });
  } catch (err) {
    console.error('[admin/ai/models GET] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
