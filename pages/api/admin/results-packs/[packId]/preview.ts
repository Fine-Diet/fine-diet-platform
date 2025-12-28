/**
 * API Route: Set Preview Pointer
 * 
 * POST /api/admin/results-packs/[packId]/preview
 * 
 * Sets the preview_revision_id pointer for a results pack.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, supabaseAdmin } from '@/lib/resultsPack/requireRole';

interface SetPreviewRequest {
  revision_id: string;
}

interface SetPreviewResponse {
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetPreviewResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireRole(req, res, ['editor', 'admin']);
  if (!auth) {
    return; // Response already sent by requireRole
  }

  try {
    const packId = String(req.query.packId);
    const { revision_id } = req.body as SetPreviewRequest;

    if (!revision_id) {
      return res.status(400).json({ error: 'revision_id is required' });
    }

    // Ensure pointer row exists and update preview_revision_id
    const { error } = await supabaseAdmin
      .from('results_pack_pointers')
      .upsert({
        pack_id: packId,
        preview_revision_id: revision_id,
        updated_by: auth.user.id,
      });

    if (error) {
      console.error('Error setting preview pointer:', error);
      return res.status(500).json({ error: error.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: auth.user.id,
        action: 'results.set_preview',
        entity_type: 'results_pack_pointer',
        entity_id: packId,
        metadata: {
          revision_id: revision_id,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(204).end();
  } catch (error) {
    console.error('Set preview error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

