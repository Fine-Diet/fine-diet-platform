/**
 * Admin API: Program Guidance — Preview (Plans Phase 7)
 *
 * POST /api/admin/program-guidance/preview
 *   Body: `{ guidance_payload_json: ProgramPlanGuidancePayload }`.
 *   Returns `{ summary: string }` — a concise natural-language
 *   description of what the guidance payload will do. Never persisted.
 *
 * Protected: admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { ProgramPlanGuidancePayloadSchema } from '@/lib/plans/validators';
import { previewGuidancePayload } from '@/lib/plans/programGuidanceAdminServerService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ summary: string } | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as { guidance_payload_json?: unknown };
  const parsed = ProgramPlanGuidancePayloadSchema.safeParse(
    body.guidance_payload_json,
  );
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid guidance payload.',
      issues: parsed.error.flatten(),
    });
  }

  const summary = previewGuidancePayload(parsed.data);
  return res.status(200).json({ summary });
}
