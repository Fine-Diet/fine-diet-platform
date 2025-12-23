/**
 * API Route: Claim Assessment Submission
 * 
 * POST /api/assessments/claim
 * 
 * Allows an authenticated user to claim a guest submission by claim token.
 * Updates submission.user_id and metadata.claimedAt/claimedBy.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';

interface ClaimRequest {
  claimToken: string;
}

interface ClaimResponse {
  success: boolean;
  submissionId?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClaimResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Require authentication
  const user = await getCurrentUserWithRoleFromApi(req, res);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { claimToken } = req.body as ClaimRequest;

    if (!claimToken || typeof claimToken !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: claimToken',
      });
    }

    // Find submission with matching claimToken and no user_id (unclaimed)
    // Use JSONB query to filter by metadata.claimToken
    const { data: submissions, error: findError } = await supabaseAdmin
      .from('assessment_submissions')
      .select('id, metadata')
      .is('user_id', null)
      .eq('metadata->>claimToken', claimToken)
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('Error finding submission by claim token:', findError);
      return res.status(500).json({
        success: false,
        error: 'Database error',
      });
    }

    const matchingSubmission = submissions;

    if (!matchingSubmission) {
      // Not found - return 204 No Content (no-op, as per requirements)
      return res.status(204).end();
    }

    // Update submission: set user_id and claim metadata
    const updatedMetadata = {
      ...((matchingSubmission.metadata as any) || {}),
      claimedAt: new Date().toISOString(),
      claimedBy: user.id,
    };

    const { data: updatedSubmission, error: updateError } = await supabaseAdmin
      .from('assessment_submissions')
      .update({
        user_id: user.id,
        metadata: updatedMetadata,
      })
      .eq('id', matchingSubmission.id)
      .select('id')
      .single();

    if (updateError) {
      console.error('Error claiming submission:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Database error',
      });
    }

    return res.status(200).json({
      success: true,
      submissionId: updatedSubmission.id,
    });
  } catch (error) {
    console.error('Claim submission error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

