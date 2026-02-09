/**
 * Cron Route: /api/cron/process-nds-queue
 * 
 * Processes pending NDS recompute requests from the queue.
 * Should be called via Vercel cron at a regular interval (e.g., every minute).
 * 
 * Security: Protected by CRON_SECRET env var to prevent unauthorized access.
 * 
 * How it runs in prod:
 * 1. Database trigger on journal_entries auto-enqueues to nds_recompute_queue
 * 2. This cron route runs every minute (or configurable interval)
 * 3. It processes pending items where scheduled_for <= now
 * 4. Idempotent: Uses "claim then process" pattern with status transitions
 * 5. Race-safe: Items move to 'processing' before work starts
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { processNDSQueue, cleanupNDSQueue, recoverStuckJobs } from '@/lib/nds/ndsServerService';
import { NDS_VERSION } from '@/lib/nds/types';

// Build/version info for debugging deployments
const GIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown';

interface CronResponse {
  success: boolean;
  recovered?: number;
  processed?: number;
  cleaned?: number;
  error?: string;
  duration_ms?: number;
  // Version markers for deployment verification
  nds_version?: string;
  git_sha?: string;
  now_utc?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CronResponse>
) {
  const startTime = Date.now();
  
  // Only allow GET (for Vercel cron) or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Verify cron secret to prevent unauthorized access
  // Vercel cron sends the secret in the Authorization header
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  // SECURITY: Fail closed - require CRON_SECRET in production
  if (!cronSecret) {
    // In production, CRON_SECRET must be set
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      console.error('[NDS Cron] CRON_SECRET not configured in production - rejecting request');
      return res.status(500).json({ success: false, error: 'Server misconfiguration' });
    }
    // In development, allow but warn
    console.warn('[NDS Cron] CRON_SECRET not configured - allowing in development');
  } else {
    // Verify the secret matches
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[NDS Cron] Unauthorized request - invalid or missing token');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  try {
    const nowUtc = new Date().toISOString();
    console.log(`[NDS Cron] git_sha=${GIT_SHA} nds_version=${NDS_VERSION} starting recoverStuckJobs + processNDSQueue`);
    
    // First, recover any stuck jobs (in 'processing' for >10 minutes)
    const recovered = await recoverStuckJobs(10);
    if (recovered > 0) {
      console.log(`[NDS Cron] Recovered ${recovered} stuck jobs`);
    }
    
    // Process pending NDS recompute jobs
    // Limit to 20 per run to avoid timeout (Vercel functions have 10s default timeout)
    const processed = await processNDSQueue(20);
    
    // Cleanup old completed items once per day (check if hour is 3 AM UTC)
    let cleaned = 0;
    const currentHour = new Date().getUTCHours();
    if (currentHour === 3) {
      cleaned = await cleanupNDSQueue(7); // Remove items older than 7 days
      console.log(`[NDS Cron] Cleaned up ${cleaned} old queue items`);
    }
    
    const durationMs = Date.now() - startTime;
    console.log(`[NDS Cron] Completed: ${recovered} recovered, ${processed} processed, ${cleaned} cleaned in ${durationMs}ms`);
    
    return res.status(200).json({
      success: true,
      recovered,
      processed,
      cleaned,
      duration_ms: durationMs,
      nds_version: NDS_VERSION,
      git_sha: GIT_SHA,
      now_utc: nowUtc,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[NDS Cron] Error:', errorMessage);
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
      duration_ms: Date.now() - startTime,
      nds_version: NDS_VERSION,
      git_sha: GIT_SHA,
      now_utc: new Date().toISOString(),
    });
  }
}
