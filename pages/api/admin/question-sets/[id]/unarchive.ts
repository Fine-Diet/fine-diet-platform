/**
 * API Route: Unarchive Question Set
 * 
 * POST /api/admin/question-sets/:id/unarchive
 * 
 * Unarchives a question set (restores it to active status).
 * Requires admin role only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface UnarchiveResponse {
  success?: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UnarchiveResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require admin role for unarchiving
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) {
    return; // Response already sent by requireRoleFromApi
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Question set ID is required' });
    }

    // Check if question set exists
    const { data: questionSet, error: fetchError } = await supabaseAdmin
      .from('question_sets')
      .select('id, assessment_type, assessment_version, status')
      .eq('id', id)
      .single();

    if (fetchError || !questionSet) {
      if (fetchError?.code === 'PGRST116') {
        return res.status(404).json({ error: 'Question set not found' });
      }
      console.error('Error fetching question set:', fetchError);
      return res.status(500).json({ error: fetchError?.message || 'Failed to fetch question set' });
    }

    // Check if already active (only if status column exists)
    if ('status' in questionSet && questionSet.status === 'active') {
      return res.status(400).json({ error: 'Question set is already active' });
    }

    // Update status to active
    const { error: updateError } = await supabaseAdmin
      .from('question_sets')
      .update({ status: 'active' })
      .eq('id', id);

    if (updateError) {
      // Check if error is due to missing status column
      if (updateError.message?.toLowerCase().includes('status') || 
          updateError.message?.toLowerCase().includes('column') ||
          updateError.message?.toLowerCase().includes('does not exist')) {
        console.error('Unarchive failed: status column does not exist. Migration required.');
        return res.status(500).json({ 
          error: 'Unarchive functionality requires database migration. Please run scripts/addQuestionSetStatus.sql in Supabase SQL Editor.',
        });
      }
      console.error('Error unarchiving question set:', updateError);
      return res.status(500).json({ error: updateError.message });
    }

    // Log to audit log
    try {
      await supabaseAdmin.from('content_audit_log').insert({
        actor_id: user.id,
        action: 'questions.unarchive',
        entity_type: 'question_set',
        entity_id: id,
        metadata: {
          assessment_type: questionSet.assessment_type,
          assessment_version: questionSet.assessment_version,
        },
      });
    } catch (auditError) {
      // Non-blocking audit log error
      console.warn('Failed to write audit log:', auditError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unarchive question set error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

