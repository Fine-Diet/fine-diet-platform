/**
 * Admin API: AI model config update (Plans Phase 16)
 *
 * PATCH /api/admin/ai/models/[id]
 *   body: Partial<AIModelConfig> — validated by ModelConfigUpdateSchema.
 *
 * Auth: admin or editor.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ModelConfigUpdateSchema } from '@/lib/ai/runtime/validators';
import {
  getModelConfigById,
  updateModelConfig,
} from '@/lib/ai/runtime/aiConfigServerService';
import type { AIModelConfig } from '@/lib/ai/runtime/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AIModelConfig | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const rawId = req.query.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
  if (!id) return res.status(400).json({ error: 'Missing id.' });

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = ModelConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const existing = await getModelConfigById(id);
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    const updated = await updateModelConfig(id, parsed.data);
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[admin/ai/models/:id PATCH] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
