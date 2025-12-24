/**
 * API Route: Publish Results Pack Revision
 * 
 * POST /api/admin/results-packs/[packId]/publish
 * 
 * Publishes a revision (sets it as the published_revision_id pointer).
 * Requires admin role only.
 * Validates revision before publishing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, supabaseAdmin } from '@/lib/resultsPack/requireRole';
import { validateResultsPack } from '@/lib/resultsPack/validateResultsPack';

interface PublishRequest {
  revision_id: string;
}

interface PublishResponse {
  error?: string;
  details?: {
    errors: string[];
    warnings: string[];
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PublishResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin role for publishing
  const auth = await requireRole(req, res, ['admin']);
  if (!auth) {
    return; // Response already sent by requireRole
  }

  try {
    const packId = String(req.query.packId);
    const { revision_id } = req.body as PublishRequest;

    if (!revision_id) {
      return res.status(400).json({ error: 'revision_id is required' });
    }

    // Fetch revision content to validate before publish
    const { data: rev, error: revErr } = await supabaseAdmin
      .from('results_pack_revisions')
      .select('id, pack_id, content_json')
      .eq('id', revision_id)
      .single();

    if (revErr || !rev) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    if (rev.pack_id !== packId) {
      return res.status(400).json({ error: 'Revision does not belong to pack' });
    }

    // Validate revision content
    const validation = validateResultsPack(rev.content_json);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'Validation failed',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    }

    // Update pointer (set published_revision_id, clear preview_revision_id)
    const { error: ptrErr } = await supabaseAdmin
      .from('results_pack_pointers')
      .upsert({
        pack_id: packId,
        published_revision_id: revision_id,
        preview_revision_id: null,
        updated_by: auth.user.id,
      });

    if (ptrErr) {
      console.error('Error updating publish pointer:', ptrErr);
      return res.status(500).json({ error: ptrErr.message });
    }

    return res.status(204).end();
  } catch (error) {
    console.error('Publish error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

