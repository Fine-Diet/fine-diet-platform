/**
 * Admin API: AI task policies (Plans Phase 16)
 *
 * GET /api/admin/ai/task-policies
 *   Returns task policies joined with their resolved preferred /
 *   fallback model config rows so the admin page can render the full
 *   routing view in one request.
 *
 * Auth: admin or editor.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { listTaskPoliciesWithConfigs } from '@/lib/ai/runtime/aiConfigServerService';
import type { AITaskPolicyWithConfigs } from '@/lib/ai/runtime/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ rows: AITaskPolicyWithConfigs[] } | { error: string }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rows = await listTaskPoliciesWithConfigs();
    return res.status(200).json({ rows });
  } catch (err) {
    console.error('[admin/ai/task-policies GET] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
