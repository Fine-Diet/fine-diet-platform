/**
 * Admin API: AI task policy upsert (Plans Phase 16)
 *
 * PATCH /api/admin/ai/task-policies/[task_type]
 *   body: Partial<AITaskPolicy> — validated by TaskPolicyUpdateSchema.
 *   Upserts (policy may not exist yet for newly-added task types).
 *
 * Auth: admin or editor.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { TaskPolicyUpdateSchema } from '@/lib/ai/runtime/validators';
import { upsertTaskPolicy } from '@/lib/ai/runtime/aiConfigServerService';
import { AI_TASK_TYPES, type AITaskPolicy, type AITaskType } from '@/lib/ai/runtime/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AITaskPolicy | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const rawType = req.query.task_type;
  const taskType = typeof rawType === 'string' ? rawType : Array.isArray(rawType) ? rawType[0] : '';
  if (!taskType || !(AI_TASK_TYPES as readonly string[]).includes(taskType)) {
    return res.status(400).json({ error: 'Invalid task_type.' });
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = TaskPolicyUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      issues: parsed.error.flatten(),
    });
  }

  try {
    const updated = await upsertTaskPolicy(taskType as AITaskType, parsed.data);
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[admin/ai/task-policies/:task_type PATCH] error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Server error',
    });
  }
}
