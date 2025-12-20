/**
 * API Route: Vercel Cron Job for Outbox Dispatch
 * 
 * GET /api/cron/outbox-dispatch
 * 
 * Vercel cron job that runs every 5 minutes to trigger the outbox worker.
 * Calls the internal /api/outbox/dispatch-pending endpoint.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

interface DispatchResponse {
  success: boolean;
  processed: number;
  sent: number;
  failed: number;
  error?: string;
  invokedBy?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DispatchResponse>
) {
  // Only allow GET (Vercel cron calls GET)
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: 'Method not allowed',
    });
  }

  // Security: Only allow Vercel cron requests
  // Vercel cron sends x-vercel-cron header OR we check user-agent
  const vercelCronHeader = req.headers['x-vercel-cron'];
  const userAgent = req.headers['user-agent'] || '';
  const isVercelCron = vercelCronHeader === '1' || userAgent.includes('vercel-cron');

  // In production, require vercel cron. In development, allow local invocation for testing
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (!isDevelopment && !isVercelCron) {
    console.warn('[cron/outbox-dispatch] Unauthorized access attempt');
    return res.status(401).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: 'Unauthorized - Vercel cron only',
    });
  }

  // Log cron start
  console.log('[cron/outbox-dispatch] Starting outbox dispatch worker...');

  try {
    // Determine base URL
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://myfinediet.com';

    const dispatchUrl = `${baseUrl}/api/outbox/dispatch-pending`;
    const secret = process.env.OUTBOX_CRON_SECRET;

    if (!secret) {
      console.error('[cron/outbox-dispatch] OUTBOX_CRON_SECRET not configured');
      return res.status(500).json({
        success: false,
        processed: 0,
        sent: 0,
        failed: 0,
        error: 'Server configuration error',
      });
    }

    // Call the dispatch-pending endpoint
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-outbox-secret': secret,
      },
    });

    const responseData = await response.json().catch(() => ({}));

    // Log upstream response summary
    if (response.ok && responseData.processed !== undefined) {
      console.log(
        `[cron/outbox-dispatch] Completed: processed=${responseData.processed}, sent=${responseData.sent}, failed=${responseData.failed}`
      );
    } else {
      console.error('[cron/outbox-dispatch] Upstream error:', responseData);
    }

    // Return upstream response with invokedBy marker
    return res.status(response.ok ? 200 : response.status).json({
      ...responseData,
      invokedBy: 'vercel-cron',
    });
  } catch (error) {
    console.error('[cron/outbox-dispatch] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      processed: 0,
      sent: 0,
      failed: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      invokedBy: 'vercel-cron',
    });
  }
}

