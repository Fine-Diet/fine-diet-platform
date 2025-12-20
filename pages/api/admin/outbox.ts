/**
 * API Route: Get Webhook Outbox Entries (Admin Only)
 * 
 * GET /api/admin/outbox
 * 
 * Returns webhook_outbox entries for admin monitoring.
 * Admin-only access via SSR auth check.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { requireRoleFromApi } from '@/lib/authServer';

interface OutboxEntry {
  submission_id: string;
  target: string;
  status: string;
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
}

interface OutboxResponse {
  success: boolean;
  entries?: OutboxEntry[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OutboxResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Require admin role only
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  try {

    // Parse query params
    const status = (req.query.status as string) || 'failed';
    const limitParam = req.query.limit as string;
    const limit = Math.min(parseInt(limitParam || '50', 10), 200);

    // Build query
    let query = supabaseAdmin
      .from('webhook_outbox')
      .select('submission_id, target, status, attempts, created_at, last_attempt_at, sent_at, error_message')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Apply status filter if not 'all'
    if (status !== 'all' && ['pending', 'failed', 'sent'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: entries, error } = await query;

    if (error) {
      console.error('Error querying webhook_outbox:', error);
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      entries: entries || [],
    });
  } catch (error) {
    console.error('Outbox API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

