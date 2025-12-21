/**
 * API Route: Outbox Delivery Metrics (Admin Only)
 * 
 * GET /api/admin/metrics/outbox
 * 
 * Returns delivery health metrics for the last 14 days.
 * Admin-only access via requireRoleFromApi.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { requireRoleFromApi } from '@/lib/authServer';

interface DayMetrics {
  day: string; // YYYY-MM-DD format
  count?: number;
  sent_count?: number;
  failed_count?: number;
  pending_count?: number;
}

interface MetricsResponse {
  success: boolean;
  metrics?: DayMetrics[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MetricsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Require admin role only
  const user = await requireRoleFromApi(req, res, ['admin']);
  if (!user) return;

  try {
    // Calculate date range: last 14 days including today (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - 13); // 14 days including today

    // Generate array of all days in range (to fill gaps)
    const daysArray: string[] = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + i);
      const dayStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      daysArray.push(dayStr);
    }

    // Series A: Submissions per day from assessment_submissions
    const { data: submissionsData, error: submissionsError } = await supabaseAdmin
      .from('assessment_submissions')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (submissionsError) {
      console.error('Error querying assessment_submissions:', submissionsError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${submissionsError.message}`,
      });
    }

    // Group submissions by day
    const submissionsByDay: Record<string, number> = {};
    (submissionsData || []).forEach((row: { created_at: string }) => {
      const day = row.created_at.split('T')[0]; // Extract YYYY-MM-DD
      submissionsByDay[day] = (submissionsByDay[day] || 0) + 1;
    });

    // Series B: Outbox delivery per day from webhook_outbox
    const { data: outboxData, error: outboxError } = await supabaseAdmin
      .from('webhook_outbox')
      .select('created_at, status')
      .eq('target', 'n8n_email_capture')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (outboxError) {
      console.error('Error querying webhook_outbox:', outboxError);
      return res.status(500).json({
        success: false,
        error: `Database error: ${outboxError.message}`,
      });
    }

    // Group outbox by day and status
    const outboxByDay: Record<string, { sent: number; failed: number; pending: number }> = {};
    (outboxData || []).forEach((row: { created_at: string; status: string }) => {
      const day = row.created_at.split('T')[0]; // Extract YYYY-MM-DD
      if (!outboxByDay[day]) {
        outboxByDay[day] = { sent: 0, failed: 0, pending: 0 };
      }
      if (row.status === 'sent') {
        outboxByDay[day].sent++;
      } else if (row.status === 'failed') {
        outboxByDay[day].failed++;
      } else if (row.status === 'pending') {
        outboxByDay[day].pending++;
      }
    });

    // Combine into metrics array, filling gaps with zeros
    const metrics: DayMetrics[] = daysArray.map((day) => ({
      day,
      count: submissionsByDay[day] || 0,
      sent_count: outboxByDay[day]?.sent || 0,
      failed_count: outboxByDay[day]?.failed || 0,
      pending_count: outboxByDay[day]?.pending || 0,
    }));

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('Metrics API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

