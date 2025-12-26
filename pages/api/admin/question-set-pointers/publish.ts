/**
 * API Route: Publish Question Set Revision
 * 
 * POST /api/admin/question-set-pointers/publish
 * 
 * Publishes a revision (sets it as the published_revision_id pointer).
 * Requires admin role only.
 * Validates revision before publishing.
 * DB trigger enforces admin-only publish, but we also gate here.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { validateQuestionSet } from '@/lib/questionSet/validateQuestionSet';

interface PublishRequest {
  questionSetId: string;
  revisionId: string;
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
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { questionSetId, revisionId } = req.body as PublishRequest;

    if (!questionSetId || !revisionId) {
      return res.status(400).json({
        error: 'questionSetId and revisionId are required',
      });
    }

    // Fetch revision content to validate before publish
    const { data: rev, error: revErr } = await supabaseAdmin
      .from('question_set_revisions')
      .select('id, question_set_id, content_json')
      .eq('id', revisionId)
      .single();

    if (revErr || !rev) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    if (rev.question_set_id !== questionSetId) {
      return res.status(400).json({
        error: 'Revision does not belong to question set',
      });
    }

    // Validate revision content
    const validation = validateQuestionSet(rev.content_json);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'Validation failed',
        details: {
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
    }

    // Update pointer (set published_revision_id)
    // Note: preview_revision_id is NOT cleared (different from results pack behavior)
    const { error: ptrErr } = await supabaseAdmin
      .from('question_set_pointers')
      .upsert({
        question_set_id: questionSetId,
        published_revision_id: revisionId,
        updated_by: user.id,
      }, {
        onConflict: 'question_set_id',
      });

    if (ptrErr) {
      console.error('Error updating publish pointer:', ptrErr);
      return res.status(500).json({ error: ptrErr.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.publish',
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
    console.error('Publish error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

