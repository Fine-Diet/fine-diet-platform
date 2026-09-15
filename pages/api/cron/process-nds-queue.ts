/**
 * Cron Route: /api/cron/process-nds-queue
 * 
 * Processes pending NDS recompute requests from the queue.
 * Should be called via Vercel cron at a regular interval (e.g., every minute).
 * 
 * Security: Protected by CRON_SECRET env var to prevent unauthorized access.
 * 
 * How it runs in prod:
 * 1. A database trigger on journal_entries records the change and raises
 *    coalesced work for the affected person/day.
 * 2. This cron route runs every minute (or configurable interval).
 * 3. Work is leased with a fencing token, not claimed by a status transition, so
 *    a stalled worker cannot later clear a day a newer worker already owns.
 * 4. Completion advances only the revision that was actually computed, so intake
 *    logged mid-run leaves the day outstanding instead of being lost.
 *
 * Crashed workers recover through lease expiry, so there is no separate
 * stuck-job sweep to get out of step with the queue.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getNdsWorkerDiagnostics, runNdsRecomputeWorker } from '@/lib/nds/ndsRecomputeWorker';
import { NDS_VERSION } from '@/lib/nds/types';

// Build/version info for debugging deployments
const GIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown';

interface CronResponse {
  success: boolean;
  claimed?: number;
  published?: number;
  /** Days whose result could not be published because the day moved again. */
  superseded?: number;
  /** Completions rejected because the lease was no longer held. */
  fenced_out?: number;
  failed?: number;
  /**
   * Queue health from the database's own view. Reported even on a quiet run so a
   * blocked queue cannot look idle.
   */
  outstanding?: number;
  expired_leases?: number;
  failing?: number;
  oldest_outstanding_age?: string | null;
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
    console.log(`[NDS Cron] git_sha=${GIT_SHA} nds_version=${NDS_VERSION} starting fenced recompute pass`);

    // Limited per run to stay inside the function timeout. Work is coalesced per
    // person/day, so an unfinished backlog is picked up by the next pass rather
    // than lost.
    const run = await runNdsRecomputeWorker({ limit: 20 });
    const diagnostics = await getNdsWorkerDiagnostics();

    for (const failure of run.errors) {
      console.error(
        `[NDS Cron] ${failure.dateLocal} person=${failure.personId.slice(0, 8)} failed: ${failure.message}`,
      );
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[NDS Cron] claimed=${run.claimed} published=${run.published} superseded=${run.superseded} fenced_out=${run.fencedOut} failed=${run.failed} outstanding=${diagnostics?.outstanding ?? 'unknown'} in ${durationMs}ms`,
    );

    return res.status(200).json({
      success: true,
      claimed: run.claimed,
      published: run.published,
      superseded: run.superseded,
      fenced_out: run.fencedOut,
      failed: run.failed,
      outstanding: diagnostics?.outstanding,
      expired_leases: diagnostics?.expiredLeases,
      failing: diagnostics?.failing,
      oldest_outstanding_age: diagnostics?.oldestOutstandingAge ?? null,
      duration_ms: durationMs,
      nds_version: NDS_VERSION,
      git_sha: GIT_SHA,
      now_utc: nowUtc,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[NDS Cron] Error:', errorMessage);

    // The cron caller is a trusted internal client, so the message stays; it is
    // never surfaced to a signed-in user.
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
