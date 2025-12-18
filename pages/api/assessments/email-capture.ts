/**
 * API Route: Email Capture for Assessment
 * 
 * POST /api/assessments/email-capture
 * 
 * Responsibilities:
 * - Update assessment_submission with email
 * - Merge metadata (don't null it)
 * - Enqueue webhook_outbox for n8n email capture
 * - Fire webhook async with 2.5s timeout (non-blocking)
 * - Return success even if webhook fails
 * 
 * Input: { sessionId, assessmentType, assessmentVersion, email, primaryAvatar?, submissionId? }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface EmailCapturePayload {
  sessionId: string;
  assessmentType: string;
  assessmentVersion: number;
  email: string;
  primaryAvatar?: string;
  submissionId?: string;
}

interface EmailCaptureResponse {
  success: boolean;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmailCaptureResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body as EmailCapturePayload;

    // Validate required fields
    if (!payload.sessionId || !payload.assessmentType || !payload.assessmentVersion || !payload.email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, assessmentType, assessmentVersion, email',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    const normalizedEmail = payload.email.trim().toLowerCase();
    const assessmentVersion = payload.assessmentVersion || 1;

    let submissionId: string;

    // If submissionId is provided, use it; otherwise find latest submission
    if (payload.submissionId) {
      submissionId = payload.submissionId;
    } else {
      // Find latest assessment_submissions row for session_id + type + version
      const { data: submissions, error: findError } = await supabaseAdmin
        .from('assessment_submissions')
        .select('id')
        .eq('session_id', payload.sessionId)
        .eq('assessment_type', payload.assessmentType)
        .eq('assessment_version', assessmentVersion)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error('Error finding assessment submission:', findError);
        return res.status(500).json({
          success: false,
          error: `Database error: ${findError.message}`,
        });
      }

      if (!submissions) {
        return res.status(404).json({
          success: false,
          error: 'Assessment submission not found',
        });
      }

      submissionId = submissions.id;
    }

    // Get existing submission to merge metadata
    const { data: existingSubmission, error: fetchError } = await supabaseAdmin
      .from('assessment_submissions')
      .select('metadata')
      .eq('id', submissionId)
      .single();

    if (fetchError) {
      console.error('Error fetching existing submission:', fetchError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${fetchError.message}`,
      });
    }

    // Merge metadata (don't null it)
    const existingMetadata = existingSubmission?.metadata || {};
    const mergedMetadata = { ...existingMetadata };

    // Update submission with email and merged metadata
    const { error: updateError } = await supabaseAdmin
      .from('assessment_submissions')
      .update({
        email: normalizedEmail,
        metadata: mergedMetadata,
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Error updating assessment submission:', updateError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${updateError.message}`,
      });
    }

    // Enqueue webhook_outbox and fire webhook (non-blocking)
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (n8nWebhookUrl) {
      const webhookPayload = {
        submission_id: submissionId,
        assessment_type: payload.assessmentType,
        assessment_version: assessmentVersion,
        session_id: payload.sessionId,
        email: normalizedEmail,
        primary_avatar: payload.primaryAvatar || null,
        event_type: 'email_capture',
      };

      // Insert into webhook_outbox
      const { error: outboxError } = await supabaseAdmin
        .from('webhook_outbox')
        .insert({
          submission_id: submissionId,
          target: 'n8n_email_capture',
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
      fireN8nWebhook(submissionId, webhookPayload).catch((error) => {
        console.error('n8n webhook error (non-blocking):', error);
        // Errors are logged but don't affect the response
      });
    }

    // Return success immediately (even if webhook fails)
    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error('Email capture error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

/**
 * Fire n8n webhook asynchronously with timeout
 * Failures are logged but don't affect the user experience
 * Uses AbortController for 2.5 second timeout
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

