/**
 * API Route: Dispatch Pending Webhook Outbox Entries
 * 
 * POST /api/outbox/dispatch-pending
 * 
 * Retry worker for webhook_outbox rows. Processes eligible pending/failed entries
 * and attempts to deliver webhooks. Designed to be called by a cron job.
 * 
 * Security: Requires x-outbox-secret header matching OUTBOX_CRON_SECRET
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

interface DispatchResponse {
  success: boolean;
  processed: number;
  sent: number;
  failed: number;
  error?: string;
}

interface OutboxRow {
  id: string;
  submission_id: string;
  target: string;
  webhook_url: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  created_at: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DispatchResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: 'Method not allowed',
    });
  }

  // Security: Require secret header
  const secretHeader = req.headers['x-outbox-secret'];
  const expectedSecret = process.env.OUTBOX_CRON_SECRET;

  if (!expectedSecret) {
    console.error('[dispatch-pending] OUTBOX_CRON_SECRET not configured');
    return res.status(500).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: 'Server configuration error',
    });
  }

  if (secretHeader !== expectedSecret) {
    console.warn('[dispatch-pending] Unauthorized access attempt');
    return res.status(401).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: 'Unauthorized',
    });
  }

  try {
    // Query eligible rows
    // Eligible if:
    // - target = 'n8n_email_capture'
    // - status IN ('pending', 'failed')
    // - attempts < 5
    // - AND either:
    //   - status = 'failed' OR
    //   - status = 'pending' AND created_at < now() - interval '2 minutes'
    const { data: eligibleRows, error: queryError } = await supabaseAdmin
      .from('webhook_outbox')
      .select('id, submission_id, target, webhook_url, payload, status, attempts, last_attempt_at, created_at')
      .eq('target', 'n8n_email_capture')
      .in('status', ['pending', 'failed'])
      .lt('attempts', 5)
      .order('created_at', { ascending: true })
      .limit(25);

    if (queryError) {
      console.error('[dispatch-pending] Error querying webhook_outbox:', queryError);
      return res.status(500).json({
        success: false,
        processed: 0,
        sent: 0,
        failed: 0,
        error: `Database error: ${queryError.message}`,
      });
    }

    if (!eligibleRows || eligibleRows.length === 0) {
      return res.status(200).json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
      });
    }

    // Filter rows by additional criteria (status = 'failed' OR pending with 2min delay)
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    const rowsToProcess = eligibleRows.filter((row: OutboxRow) => {
      if (row.status === 'failed') {
        return true;
      }
      if (row.status === 'pending') {
        const createdAt = new Date(row.created_at);
        return createdAt < twoMinutesAgo;
      }
      return false;
    });

    if (rowsToProcess.length === 0) {
      return res.status(200).json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    // Process each row
    for (const row of rowsToProcess) {
      try {
        // Update row: increment attempts, set last_attempt_at, clear error_message
        const updateNow = new Date().toISOString();
        const { error: updateError } = await supabaseAdmin
          .from('webhook_outbox')
          .update({
            attempts: row.attempts + 1,
            last_attempt_at: updateNow,
            error_message: null,
          })
          .eq('id', row.id);

        if (updateError) {
          console.error(
            `[dispatch-pending] Error updating row ${row.id} (submission_id: ${row.submission_id}):`,
            updateError
          );
          failedCount++;
          continue;
        }

        // POST to webhook_url
        let webhookSuccess = false;
        let errorMessage = '';

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const response = await fetch(row.webhook_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(row.payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            webhookSuccess = true;
          } else {
            const responseText = await response.text().catch(() => 'Unable to read response');
            errorMessage = `HTTP ${response.status}: ${responseText.substring(0, 100)}`;
          }
        } catch (fetchError) {
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            errorMessage = 'Request timeout after 10s';
          } else {
            errorMessage = fetchError instanceof Error ? fetchError.message : 'Network error';
          }
        }

        // Update row based on result
        const finalUpdate: Record<string, unknown> = {
          last_attempt_at: updateNow,
        };

        if (webhookSuccess) {
          finalUpdate.status = 'sent';
          finalUpdate.sent_at = updateNow;
          finalUpdate.error_message = null;
          sentCount++;
          console.log(
            `[dispatch-pending] Successfully sent webhook for submission_id: ${row.submission_id}`
          );
        } else {
          finalUpdate.status = 'failed';
          finalUpdate.error_message = errorMessage;
          failedCount++;
          console.log(
            `[dispatch-pending] Failed to send webhook for submission_id: ${row.submission_id}, error: ${errorMessage}`
          );
        }

        const { error: finalUpdateError } = await supabaseAdmin
          .from('webhook_outbox')
          .update(finalUpdate)
          .eq('id', row.id);

        if (finalUpdateError) {
          console.error(
            `[dispatch-pending] Error updating final status for row ${row.id} (submission_id: ${row.submission_id}):`,
            finalUpdateError
          );
        }
      } catch (rowError) {
        // Log error but continue processing remaining rows
        console.error(
          `[dispatch-pending] Error processing row ${row.id} (submission_id: ${row.submission_id}):`,
          rowError
        );
        failedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      processed: rowsToProcess.length,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (error) {
    console.error('[dispatch-pending] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

