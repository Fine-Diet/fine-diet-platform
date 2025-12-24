/**
 * API Route: Update Submission Results Pack Reference
 * 
 * POST /api/assessments/update-pack-ref
 * 
 * Updates submission.metadata.resultsPackRef for pinning.
 * Called after first pack resolution to persist the reference.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { ResultsPackRef } from '@/lib/assessments/results/resolveResultsPack';

interface UpdatePackRefRequest {
  submissionId: string;
  resultsPackRef: ResultsPackRef;
}

interface UpdatePackRefResponse {
  success: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdatePackRefResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { submissionId, resultsPackRef } = req.body as UpdatePackRefRequest;

    if (!submissionId || !resultsPackRef) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: submissionId, resultsPackRef',
      });
    }

    // Get existing submission to merge metadata
    const { data: existingSubmission, error: fetchError } = await supabaseAdmin
      .from('assessment_submissions')
      .select('metadata')
      .eq('id', submissionId)
      .single();

    if (fetchError || !existingSubmission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found',
      });
    }

    // Merge metadata (don't overwrite other fields)
    const existingMetadata = existingSubmission.metadata || {};
    const mergedMetadata = {
      ...existingMetadata,
      resultsPackRef,
    };

    // Update submission with merged metadata
    const { error: updateError } = await supabaseAdmin
      .from('assessment_submissions')
      .update({ metadata: mergedMetadata })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Error updating submission pack ref:', updateError);
      return res.status(500).json({
        success: false,
        error: updateError.message,
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Update pack ref error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

