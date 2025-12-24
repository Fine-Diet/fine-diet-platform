/**
 * API Route: Get Assessment Submission
 * 
 * GET /api/assessments/submission?submission_id=xxx
 * 
 * Returns persisted submission data from assessment_submissions table.
 * Uses service-role (RLS deny-by-default remains).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface SubmissionResponse {
  success: boolean;
  data?: {
    id: string;
    primary_avatar: string;
    secondary_avatar?: string | null;
    score_map: Record<string, number>;
    normalized_score_map: Record<string, number>;
    confidence_score: number;
    assessment_type: string;
    assessment_version: number;
    session_id: string;
    metadata?: Record<string, unknown> | null;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubmissionResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const submissionId = req.query.submission_id as string;

    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: submission_id',
      });
    }

    // Fetch submission from database using service-role
    const { data: submission, error } = await supabaseAdmin
      .from('assessment_submissions')
      .select(
        'id, primary_avatar, secondary_avatar, score_map, normalized_score_map, confidence_score, assessment_type, assessment_version, session_id, metadata'
      )
      .eq('id', submissionId)
      .single();

    if (error) {
      console.error('Error fetching submission:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: submission.id,
        primary_avatar: submission.primary_avatar,
        secondary_avatar: submission.secondary_avatar,
        score_map: submission.score_map as Record<string, number>,
        normalized_score_map: submission.normalized_score_map as Record<string, number>,
        confidence_score: submission.confidence_score,
        assessment_type: submission.assessment_type,
        assessment_version: submission.assessment_version,
        session_id: submission.session_id,
        metadata: submission.metadata as Record<string, unknown> | null,
      },
    });
  } catch (error) {
    console.error('Submission fetch error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

