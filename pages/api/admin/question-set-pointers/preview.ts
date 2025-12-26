/**
 * API Route: Set Preview Pointer
 * 
 * POST /api/admin/question-set-pointers/preview
 * 
 * Sets the preview_revision_id pointer for a question set.
 * Requires editor or admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface SetPreviewRequest {
  questionSetId: string;
  revisionId: string;
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

  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { questionSetId, revisionId } = req.body as SetPreviewRequest;

    if (!questionSetId || !revisionId) {
      return res.status(400).json({
        error: 'questionSetId and revisionId are required',
      });
    }

    // Ensure pointer row exists and update preview_revision_id
    const { error } = await supabaseAdmin
      .from('question_set_pointers')
      .upsert({
        question_set_id: questionSetId,
        preview_revision_id: revisionId,
        updated_by: user.id,
      }, {
        onConflict: 'question_set_id',
      });

    if (error) {
      console.error('Error setting preview pointer:', error);
      return res.status(500).json({ error: error.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.set_preview',
        entity_type: 'question_set_pointer',
        entity_id: questionSetId,
        metadata: {
          revision_id: revisionId,
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

