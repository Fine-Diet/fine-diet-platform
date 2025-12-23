/**
 * API Route: Get User Assessments
 * 
 * GET /api/account/assessments
 * 
 * Returns all assessment submissions for the authenticated user.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';

interface AssessmentSubmission {
  id: string;
  assessment_type: string;
  assessment_version: number;
  primary_avatar: string;
  created_at: string;
}

interface AssessmentsResponse {
  submissions: AssessmentSubmission[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AssessmentsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ submissions: [], error: 'Method not allowed' });
  }

  // Require authentication
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ submissions: [], error: 'Unauthorized' });
  }

  try {
    // Fetch all submissions for this user
    const { data: submissions, error: fetchError } = await supabaseAdmin
      .from('assessment_submissions')
      .select('id, assessment_type, assessment_version, primary_avatar, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching user assessments:', fetchError);
      return res.status(500).json({
        submissions: [],
        error: 'Database error',
      });
    }

    return res.status(200).json({
      submissions: submissions || [],
    });
  } catch (error) {
    console.error('Assessments API error:', error);
    return res.status(500).json({
      submissions: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

