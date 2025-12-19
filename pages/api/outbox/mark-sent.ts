/**
 * API Route: Update webhook_outbox status
 * 
 * POST /api/outbox/mark-sent
 * 
 * Updates webhook_outbox row status to 'sent' or 'failed' after n8n execution.
 * Used by n8n workflow to mark webhook delivery success/failure.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface MarkSentPayload {
  submissionId: string;
  target?: string;
  status: 'sent' | 'failed';
  error_message?: string;
}

interface MarkSentResponse {
  success: boolean;
  rowsUpdated?: number;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MarkSentResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body as MarkSentPayload;

    // Validate required fields
    if (!payload.submissionId || !payload.status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: submissionId, status',
      });
    }

    if (payload.status !== 'sent' && payload.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: "status must be 'sent' or 'failed'",
      });
    }

    const target = payload.target || 'n8n';
    const now = new Date().toISOString();

    // Build update object based on status
    const updateData: Record<string, unknown> = {
      status: payload.status,
      last_attempt_at: now,
    };

    if (payload.status === 'sent') {
      updateData.sent_at = now;
      updateData.error_message = null;
    } else if (payload.status === 'failed') {
      updateData.error_message = payload.error_message || 'Webhook execution failed';
    }

    // Update webhook_outbox row
    const { data, error: updateError } = await supabaseAdmin
      .from('webhook_outbox')
      .update(updateData)
      .eq('submission_id', payload.submissionId)
      .eq('target', target)
      .select('id');

    if (updateError) {
      console.error('Error updating webhook_outbox:', updateError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${updateError.message}`,
      });
    }

    const rowsUpdated = data?.length || 0;

    // Log if no rows updated (debug)
    if (rowsUpdated === 0) {
      console.warn(
        `[mark-sent] No rows updated for submission_id=${payload.submissionId}, target=${target}`
      );
    }

    // Return success even if 0 rows (may have already been updated)
    return res.status(200).json({
      success: true,
      rowsUpdated,
    });
  } catch (error) {
    console.error('Mark sent API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

