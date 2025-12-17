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
 * - Enqueue webhook_outbox before firing n8n async
 * - Return success immediately
 * 
 * Must NOT:
 * - Block UI
 * - Calculate scores
 * - Fail user flow if n8n is down
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { SubmissionPayload, SubmissionResponse } from '@/lib/assessmentTypes';

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

    // Insert submission (using client-generated ID for idempotency)
    // Ensure metadata is never null (use {} as default)
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from('assessment_submissions')
      .insert({
        id: payload.submissionId,
        assessment_type: payload.assessmentType,
        assessment_version: assessmentVersion,
        session_id: payload.sessionId,
        user_id: payload.userId || null,
        email: payload.email || null,
        answers: payload.answers,
        score_map: payload.scoreMap,
        normalized_score_map: payload.normalizedScoreMap,
        primary_avatar: payload.primaryAvatar,
        secondary_avatar: payload.secondaryAvatar || null,
        confidence_score: payload.confidenceScore,
        metadata: payload.metadata || {},
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

    // Enqueue webhook_outbox before firing n8n
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (n8nWebhookUrl) {
      const webhookPayload = {
        submission_id: submission.id,
        assessment_type: payload.assessmentType,
        assessment_version: assessmentVersion,
        session_id: payload.sessionId,
        primary_avatar: payload.primaryAvatar,
        secondary_avatar: payload.secondaryAvatar,
        email: payload.email,
        user_id: payload.userId,
      };

      // Insert into webhook_outbox
      // Must insert: submission_id, target ('n8n'), webhook_url, payload, status='pending'
      // All writes via supabaseAdmin service role (no anon policies)
      const { error: outboxError } = await supabaseAdmin
        .from('webhook_outbox')
        .insert({
          submission_id: submission.id,
          target: 'n8n',
          webhook_url: n8nWebhookUrl,
          payload: webhookPayload,
          status: 'pending',
        });

      if (outboxError) {
        console.error('Error inserting into webhook_outbox:', outboxError);
        // Don't fail - continue to fire webhook directly
      }

      // Fire n8n webhook (async, non-blocking)
      // Do not await - let it run in the background
      fireN8nWebhook(submission.id, webhookPayload).catch((error) => {
        console.error('n8n webhook error (non-blocking):', error);
        // Errors are logged but don't affect the response
      });
    }

    // Return success immediately
    return res.status(200).json({
      success: true,
      submissionId: submission.id,
    });
  } catch (error) {
    console.error('Assessment submission error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

/**
 * Fire n8n webhook asynchronously with timeout
 * Failures are logged but don't affect the user experience
 * Uses AbortController for 2-3 second timeout
 */
async function fireN8nWebhook(
  submissionId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!n8nWebhookUrl) {
    console.warn('N8N_WEBHOOK_URL not configured - skipping webhook');
    return;
  }

  try {
    // Create AbortController for timeout (2.5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}`);
    }
  } catch (error) {
    // Log but don't throw - this is non-blocking
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('n8n webhook timeout after 2.5s (non-blocking)');
    } else {
      console.error('n8n webhook failed:', error);
    }
    // Don't re-throw - caller doesn't await this
  }
}
