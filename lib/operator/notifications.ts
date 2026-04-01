/**
 * Operator Review Notifications
 *
 * Fires two side-effects after a successful Operator API draft creation:
 *   1. Second Brain task — durable review item, created via HTTP call to the MCP server.
 *   2. Email notification — interrupt layer, written to the `operator_review_notifications`
 *      outbox table for n8n or another process to pick up.
 *
 * Both operations are:
 *   - Non-blocking (failures are logged but do not fail the primary request)
 *   - Idempotent via an idempotency_key stored with each notification record
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

// ============================================================================
// Types
// ============================================================================

export interface OperatorReviewNotificationInput {
  /**
   * Unique key for this notification.
   * Recommend: `operator-assessment-review-<questionSetId>-<resultsVersion>`
   */
  idempotencyKey: string;
  /** Human-readable title for the second-brain task and email subject */
  title: string;
  /** Additional context included in the task notes */
  notes: string;
  /** Admin review link (primary URL included in the task and email) */
  primaryReviewUrl: string;
  /** Metadata stored with the outbox record for debugging */
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  secondBrainTaskCreated: boolean;
  emailQueued: boolean;
  errors: string[];
}

// ============================================================================
// Second Brain task via MCP HTTP
// ============================================================================

/**
 * Create a review task in the Second Brain by calling the MCP server directly.
 * Uses SECOND_BRAIN_API_TOKEN env var for Bearer auth.
 *
 * The `linked_project_id` is the Fine Diet — Operator API project UUID.
 */
async function createSecondBrainReviewTask(
  input: OperatorReviewNotificationInput
): Promise<boolean> {
  const token = process.env.SECOND_BRAIN_API_TOKEN;
  const mcpUrl = process.env.SECOND_BRAIN_MCP_URL ?? 'https://mcp.rashadtyler.com/api/mcp';
  const operatorProjectId = process.env.OPERATOR_PROJECT_ID ?? '5e644744-a5ec-4ff8-8c7e-e966a0a9bb77';

  if (!token) {
    console.warn('[OperatorNotifications] SECOND_BRAIN_API_TOKEN not set — skipping second-brain task');
    return false;
  }

  const notes = `${input.notes}\n\nReview link: ${input.primaryReviewUrl}\n\nIdempotency key: ${input.idempotencyKey}`;

  const mcpPayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'capture_task',
      arguments: {
        title: input.title,
        priority: 'high',
        owner: 'Rashad',
        notes,
        linked_project_id: operatorProjectId,
      },
    },
  };

  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(mcpPayload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[OperatorNotifications] MCP task creation failed: ${response.status} — ${body}`);
      return false;
    }

    const data = await response.json();
    if (data?.error) {
      console.error('[OperatorNotifications] MCP returned error:', data.error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[OperatorNotifications] Failed to call MCP server:', err);
    return false;
  }
}

// ============================================================================
// Email outbox
// ============================================================================

/**
 * Write a review notification record to `operator_review_notifications`.
 * This table is the email outbox — n8n or another process picks up pending records.
 *
 * Idempotent: silently skips if the idempotency_key already exists.
 */
async function queueReviewEmail(
  input: OperatorReviewNotificationInput
): Promise<boolean> {
  try {
    // Upsert on idempotency_key — duplicate calls are a no-op
    const { error } = await supabaseAdmin
      .from('operator_review_notifications')
      .upsert(
        {
          idempotency_key: input.idempotencyKey,
          title: input.title,
          notes: input.notes,
          primary_review_url: input.primaryReviewUrl,
          metadata: input.metadata ?? {},
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: true }
      );

    if (error) {
      console.error('[OperatorNotifications] Failed to queue review email:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[OperatorNotifications] Unexpected error queuing review email:', err);
    return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fire both notification channels for a completed Operator draft creation.
 * Non-blocking: always resolves, never throws.
 * Returns a result object indicating which channels succeeded.
 */
export async function sendOperatorReviewNotifications(
  input: OperatorReviewNotificationInput
): Promise<NotificationResult> {
  const result: NotificationResult = {
    secondBrainTaskCreated: false,
    emailQueued: false,
    errors: [],
  };

  // Run both channels in parallel; neither blocks the other
  const [taskResult, emailResult] = await Promise.allSettled([
    createSecondBrainReviewTask(input),
    queueReviewEmail(input),
  ]);

  if (taskResult.status === 'fulfilled') {
    result.secondBrainTaskCreated = taskResult.value;
  } else {
    result.errors.push(`Second Brain task: ${taskResult.reason}`);
  }

  if (emailResult.status === 'fulfilled') {
    result.emailQueued = emailResult.value;
  } else {
    result.errors.push(`Email queue: ${emailResult.reason}`);
  }

  return result;
}
