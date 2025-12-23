/**
 * API Route: Submit Assessment
 * 
 * POST /api/assessments/submit
 * 
 * Responsibilities:
 * - Validate payload
 * - Idempotent insert using client-generated submissionId
 * - Write to Supabase (assessment_submissions)
 * - Mark session as completed
 * - Return success immediately
 * 
 * Note: Webhook logic moved to email-capture.ts (n8n only fires after email capture)
 * 
 * Must NOT:
 * - Block UI
 * - Calculate scores
 * - Fail user flow if n8n is down
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import type { SubmissionPayload, SubmissionResponse } from '@/lib/assessmentTypes';
import { randomUUID } from 'crypto';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubmissionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body as SubmissionPayload;

    // Validate required fields
    if (
      !payload.submissionId ||
      !payload.assessmentType ||
      !payload.sessionId ||
      !payload.answers ||
      !payload.primaryAvatar
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: submissionId, assessmentType, sessionId, answers, primaryAvatar',
      });
    }

    // Validate submissionId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(payload.submissionId)) {
      return res.status(400).json({
        success: false,
        error: 'submissionId must be a valid UUID',
      });
    }

    // Validate answers structure
    if (!Array.isArray(payload.answers) || payload.answers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'answers must be a non-empty array',
      });
    }

    const assessmentVersion = payload.assessmentVersion || 1;

    // Get authenticated user if available
    let authenticatedUserId: string | null = null;
    try {
      const user = await getCurrentUserWithRoleFromApi(req, res);
      // Only set user_id if we got a valid user (don't fail on auth errors)
      if (user?.id) {
        authenticatedUserId = user.id;
      }
    } catch (authError) {
      // Auth errors are not fatal - submission can proceed as guest
      console.log('[Submit] No authenticated user, proceeding as guest');
    }

    // Check if submission already exists (idempotency check)
    const { data: existingSubmission } = await supabaseAdmin
      .from('assessment_submissions')
      .select('id')
      .eq('id', payload.submissionId)
      .single();

    if (existingSubmission) {
      // Submission already exists - return success (idempotent)
      return res.status(200).json({
        success: true,
        submissionId: existingSubmission.id,
      });
    }

    // For v2, store responses in metadata for easy access
    // v2 uses responses format {q1: 0, q2: 1, ... q17: 3}
    // If guest submission, generate claim token for later account attachment
    const claimToken = authenticatedUserId ? null : randomUUID();
    const metadata = {
      ...(payload.metadata || {}),
      ...(assessmentVersion === 2 && payload.responses ? { responses: payload.responses } : {}),
      ...(claimToken ? {
        claimToken,
        claimedAt: null,
        claimedBy: null,
      } : {}),
    };

    // Insert submission (using client-generated ID for idempotency)
    // Ensure metadata is never null (use {} as default)
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('assessment_submissions')
      .insert({
        id: payload.submissionId,
        assessment_type: payload.assessmentType,
        assessment_version: assessmentVersion,
        session_id: payload.sessionId,
        user_id: authenticatedUserId || payload.userId || null,
        email: payload.email || null,
        answers: payload.answers,
        score_map: payload.scoreMap,
        normalized_score_map: payload.normalizedScoreMap,
        primary_avatar: payload.primaryAvatar,
        secondary_avatar: payload.secondaryAvatar || null,
        confidence_score: payload.confidenceScore,
        metadata: metadata,
      })
      .select('id')
      .single();

    if (submissionError) {
      // Check if it's a duplicate key error (race condition)
      if (submissionError.code === '23505') {
        // Duplicate - return success (idempotent)
        return res.status(200).json({
          success: true,
          submissionId: payload.submissionId,
        });
      }

      console.error('Error inserting assessment_submission:', submissionError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${submissionError.message}`,
      });
    }

    // Mark session as completed
    // WHERE clause must include: session_id, assessment_type, and assessment_version
    // (matches schema uniqueness on (session_id, assessment_type, assessment_version))
    const { error: sessionError } = await supabaseAdmin
      .from('assessment_sessions')
      .update({
        status: 'completed',
        last_question_index: payload.answers.length - 1,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', payload.sessionId)
      .eq('assessment_type', payload.assessmentType)
      .eq('assessment_version', assessmentVersion);

    if (sessionError) {
      console.error('Error updating assessment_session:', sessionError);
      // Don't fail the request - submission was successful
    }

    // Return success immediately
    // Note: Webhook logic moved to email-capture.ts - n8n only fires after email capture
    return res.status(200).json({
      success: true,
      submissionId: submission.id,
      claimToken: claimToken || undefined, // Only return claim token for guest submissions
    });
  } catch (error) {
    console.error('Assessment submission error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

