/**
 * API Route: Delete Question Set
 * 
 * DELETE /api/admin/question-sets/:id
 * 
 * Permanently deletes a question set and all related data.
 * Requires admin role only.
 * Cascades to revisions and pointers (database handles this).
 * Assessment submissions are NOT deleted (they reference type/version as text).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface DeleteResponse {
  success?: boolean;
  error?: string;
  warning?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DeleteResponse>
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin role for deletion
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Question set ID is required' });
    }

    // Check if question set exists and get details
    const { data: questionSet, error: fetchError } = await supabaseAdmin
      .from('question_sets')
      .select('id, assessment_type, assessment_version, locale')
      .eq('id', id)
      .single();

    if (fetchError || !questionSet) {
      if (fetchError?.code === 'PGRST116') {
        return res.status(404).json({ error: 'Question set not found' });
      }
      console.error('Error fetching question set:', fetchError);
      return res.status(500).json({ error: fetchError?.message || 'Failed to fetch question set' });
    }

    // Check for existing submissions that reference this assessment type/version
    // (They won't be deleted, but we should warn about them)
    const { count: submissionCount } = await supabaseAdmin
      .from('assessment_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_type', questionSet.assessment_type)
      .eq('assessment_version', questionSet.assessment_version);

    // Delete the question set (CASCADE will handle revisions and pointers)
    const { error: deleteError } = await supabaseAdmin
      .from('question_sets')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting question set:', deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.delete',
        entity_type: 'question_set',
        entity_id: id,
        metadata: {
          assessment_type: questionSet.assessment_type,
          assessment_version: questionSet.assessment_version,
          locale: questionSet.locale,
          existing_submissions: submissionCount || 0,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    const response: DeleteResponse = { success: true };
    if (submissionCount && submissionCount > 0) {
      response.warning = `${submissionCount} assessment submission(s) still reference this assessment type/version and were not deleted.`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Delete question set error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

