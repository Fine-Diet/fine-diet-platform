/**
 * Admin API: Missing-item request — detail + resolve/dismiss (Phase 14–15)
 *
 * GET   /api/admin/missing-item-requests/[id]
 *   → full request record.
 *
 * PATCH /api/admin/missing-item-requests/[id]
 *   body: { status: 'resolved' | 'dismissed',
 *           resolved_food_object_id?: string | null,
 *           resolution_notes?: string | null,
 *           apply_alias_enrichment?: boolean,   // Phase 15
 *           alias_value?: string | null }       // Phase 15
 *
 * Phase 15 notes:
 *   - When `apply_alias_enrichment` is true and a
 *     `resolved_food_object_id` is supplied, the service also appends
 *     `alias_value` (or the request's normalized_input when omitted)
 *     to the linked food_objects.aliases array, idempotently.
 *   - Closing a request frees the Packet 14 partial-unique dedupe
 *     slot so a later occurrence opens a fresh row rather than
 *     reusing a closed one.
 *
 * PATCH response shape:
 *   { request: MissingItemRequest, alias_added: string | null }
 *   `alias_added` is set to the exact alias string that was appended
 *   when enrichment produced a real change; null when enrichment was
 *   not requested or the alias was already present.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { MissingItemResolveSchema } from '@/lib/missingItems/validators';
import {
  dismissRequest,
  getRequestById,
  resolveRequest,
} from '@/lib/missingItems/missingItemRequestServerService';
import type { MissingItemRequest } from '@/lib/missingItems/types';

interface PatchResponse {
  request: MissingItemRequest;
  alias_added: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    MissingItemRequest | PatchResponse | { error: string; issues?: unknown }
  >,
) {
  const user = await requireRoleFromApi(req, res, ['admin', 'editor']);
  if (!user) return;

  const rawId = req.query.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';
  if (!id) return res.status(400).json({ error: 'Missing id.' });

  if (req.method === 'GET') {
    try {
      const row = await getRequestById(id);
      if (!row) return res.status(404).json({ error: 'Not found.' });
      return res.status(200).json(row);
    } catch (err) {
      console.error('[admin/missing-item-requests/:id GET] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = MissingItemResolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload.',
        issues: parsed.error.flatten(),
      });
    }

    try {
      const existing = await getRequestById(id);
      if (!existing) return res.status(404).json({ error: 'Not found.' });

      if (parsed.data.status === 'resolved') {
        const outcome = await resolveRequest({
          id,
          resolvedByUserId: user.id ?? null,
          resolvedFoodObjectId: parsed.data.resolved_food_object_id,
          resolutionNotes: parsed.data.resolution_notes,
          applyAliasEnrichment: parsed.data.apply_alias_enrichment,
          aliasValue: parsed.data.alias_value,
        });
        return res.status(200).json(outcome);
      }

      const dismissed = await dismissRequest({
        id,
        resolvedByUserId: user.id ?? null,
        resolutionNotes: parsed.data.resolution_notes,
      });
      return res.status(200).json({ request: dismissed, alias_added: null });
    } catch (err) {
      console.error('[admin/missing-item-requests/:id PATCH] error:', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Server error',
      });
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
