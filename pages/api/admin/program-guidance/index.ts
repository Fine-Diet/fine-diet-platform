/**
 * Admin API: Program Guidance — List & Create (Plans Phase 7)
 *
 * GET  /api/admin/program-guidance
 *   List program guidance rows. Supports filters: person_id, program_slug,
 *   active, guidance_type, limit, offset.
 *
 * POST /api/admin/program-guidance
 *   Create a new program guidance row. Body must match
 *   ProgramGuidanceAdminCreateSchema. The nested guidance_payload_json
 *   is strictly validated — invalid payloads are rejected before any DB
 *   write. The Plans consumer path is unchanged.
 *
 * Protected: requires admin or editor role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import {
  ProgramGuidanceAdminCreateSchema,
  ProgramGuidanceTypeSchema,
} from '@/lib/plans/validators';
import {
  createGuidance,
  listGuidance,
  previewGuidancePayload,
} from '@/lib/plans/programGuidanceAdminServerService';
import type { ProgramPlanGuidance } from '@/lib/plans/types';

interface ListResponse {
  rows: ProgramPlanGuidance[];
  total: number;
  limit: number;
  offset: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListResponse | ProgramPlanGuidance | { error: string; issues?: unknown }>,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const {
        person_id,
        program_slug,
        active,
        guidance_type,
        limit,
        offset,
      } = req.query;

      const parsedGuidanceType = typeof guidance_type === 'string' && guidance_type
        ? ProgramGuidanceTypeSchema.safeParse(guidance_type)
        : null;

      const result = await listGuidance({
        personId: typeof person_id === 'string' && person_id ? person_id : undefined,
        programSlug: typeof program_slug === 'string' && program_slug ? program_slug : undefined,
        active: active === 'true' ? true : active === 'false' ? false : undefined,
        guidanceType: parsedGuidanceType?.success ? parsedGuidanceType.data : undefined,
        limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
        offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error('[admin/program-guidance GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'POST') {
    const parsed = ProgramGuidanceAdminCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid program guidance payload.',
        issues: parsed.error.flatten(),
      });
    }

    try {
      const created = await createGuidance(parsed.data, {
        createdByAuthUserId: user.id ?? null,
      });
      // Light side-effect: generate preview text so clients can cache it
      // without a second round-trip. Preview is not persisted — it is
      // recomputed on demand from the payload.
      void previewGuidancePayload(created.guidance_payload_json);
      return res.status(201).json(created);
    } catch (err) {
      console.error('[admin/program-guidance POST] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
