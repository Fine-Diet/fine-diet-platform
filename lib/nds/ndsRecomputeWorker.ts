/**
 * Fenced NDS recompute worker.
 *
 * NDS Integrity v1. Server-only.
 *
 * Replaces the status-transition queue. The problems with that design were not
 * cosmetic:
 *
 *  - Uniqueness on (person_id, date_local, status) meant a day could not be
 *    completed twice, so a second legitimate recompute for the same day
 *    collided with the first completed row.
 *  - "Claim by moving status to processing" gives no fencing token, so a worker
 *    that stalled past the stuck-job recovery window could come back and mark a
 *    day done that a newer worker was already handling.
 *  - Marking a day complete cleared the request wholesale, so a mutation that
 *    landed mid-run was lost rather than left outstanding.
 *
 * Here, work is identified per person/day forever, a claim carries a lease token
 * with an expiry, and completion advances `processed_revision` only to the
 * revision that was actually computed. Anything logged while the worker ran keeps
 * `requested_revision` ahead, so the day stays outstanding and is picked up again.
 *
 * A worker that loses its lease cannot clear newer work: the database rejects the
 * completion and records it as `fenced_out`.
 */

import { supabaseAdmin } from '../supabaseServerClient';
import { createSupabaseNdsPersistence } from './ndsPersistenceSupabase';
import { resolveDailyNDS } from './resolveDailyNDS';

export interface ClaimedWorkItem {
  personId: string;
  dateLocal: string;
  requestedRevision: number;
  requestedGeneration: number;
  leaseToken: string;
  attempts: number;
}

export interface WorkerRunResult {
  claimed: number;
  published: number;
  /** Days whose result could not be published because the day moved again. */
  superseded: number;
  /** Days whose completion was rejected because the lease was no longer held. */
  fencedOut: number;
  failed: number;
  errors: Array<{ personId: string; dateLocal: string; message: string }>;
}

/** Default lease length. Must exceed the realistic worst-case compute time. */
const DEFAULT_LEASE_SECONDS = 120;

interface ClaimRow {
  person_id: string;
  date_local: string;
  requested_revision: number | string;
  requested_generation: number | string;
  lease_token: string;
  attempts: number | string;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function claimRecomputeWork(
  limit: number,
  leaseSeconds = DEFAULT_LEASE_SECONDS,
): Promise<ClaimedWorkItem[]> {
  const { data, error } = await supabaseAdmin.rpc('nds_claim_work', {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    throw new Error(`Failed to claim NDS recompute work: ${error.message}`);
  }

  return ((data ?? []) as ClaimRow[]).map((row) => ({
    personId: row.person_id,
    dateLocal: row.date_local,
    requestedRevision: toInt(row.requested_revision),
    requestedGeneration: toInt(row.requested_generation),
    leaseToken: row.lease_token,
    attempts: toInt(row.attempts),
  }));
}

interface CompleteOutcome {
  accepted: boolean;
  reason: string;
  stillOutstanding: boolean;
}

async function completeWork(
  item: ClaimedWorkItem,
  processedRevision: number,
): Promise<CompleteOutcome> {
  const { data, error } = await supabaseAdmin
    .rpc('nds_complete_work', {
      p_person_id: item.personId,
      p_date_local: item.dateLocal,
      p_lease_token: item.leaseToken,
      p_processed_revision: processedRevision,
    })
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to complete NDS recompute work: ${error.message}`);
  }

  const row = (data ?? null) as {
    accepted?: boolean;
    reason?: string;
    still_outstanding?: boolean;
  } | null;

  return {
    accepted: row?.accepted === true,
    reason: row?.reason ?? 'unknown',
    stillOutstanding: row?.still_outstanding === true,
  };
}

async function failWork(item: ClaimedWorkItem, message: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('nds_fail_work', {
    p_person_id: item.personId,
    p_date_local: item.dateLocal,
    p_lease_token: item.leaseToken,
    p_error: message.slice(0, 2000),
  });
  if (error) {
    console.error('[NDS Worker] Could not record failure:', error.message);
  }
}

/**
 * Process one batch of outstanding work.
 *
 * Items are handled sequentially. Recomputation touches shared rows per
 * person/day, and running a batch concurrently would mostly buy contention on
 * those rows rather than throughput.
 */
export async function runNdsRecomputeWorker(options?: {
  limit?: number;
  leaseSeconds?: number;
}): Promise<WorkerRunResult> {
  const limit = options?.limit ?? 20;
  const leaseSeconds = options?.leaseSeconds ?? DEFAULT_LEASE_SECONDS;

  const port = createSupabaseNdsPersistence();
  const claimed = await claimRecomputeWork(limit, leaseSeconds);

  const result: WorkerRunResult = {
    claimed: claimed.length,
    published: 0,
    superseded: 0,
    fencedOut: 0,
    failed: 0,
    errors: [],
  };

  for (const item of claimed) {
    try {
      const outcome = await resolveDailyNDS(port, {
        personId: item.personId,
        dateLocal: item.dateLocal,
        // The worker exists to compute; declining here would leave the day
        // permanently outstanding.
        allowInlineCompute: true,
      });

      if (outcome.publishReason !== 'published') {
        // The day changed again, or this deployment was superseded. Do NOT mark
        // the requested revision processed — that would drop the newer request.
        result.superseded += 1;
        continue;
      }

      const completion = await completeWork(item, item.requestedRevision);
      if (!completion.accepted) {
        // Our lease is gone; another worker owns this day now. Leaving the row
        // untouched is correct: the current owner will complete it.
        result.fencedOut += 1;
        continue;
      }

      result.published += 1;

      if (completion.stillOutstanding) {
        console.log(
          `[NDS Worker] ${item.dateLocal} changed while computing; left outstanding for the next pass`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.errors.push({
        personId: item.personId,
        dateLocal: item.dateLocal,
        message,
      });
      await failWork(item, message);
    }
  }

  return result;
}

export interface WorkerDiagnostics {
  outstanding: number;
  leased: number;
  expiredLeases: number;
  failing: number;
  oldestOutstandingAge: string | null;
}

/**
 * Report queue health from the database's own view.
 *
 * Deliberately reports expired leases and failing days separately from
 * outstanding work: a blocked queue must not be able to look idle.
 */
export async function getNdsWorkerDiagnostics(): Promise<WorkerDiagnostics | null> {
  const { data, error } = await supabaseAdmin.rpc('nds_work_diagnostics').maybeSingle();
  if (error) {
    console.error('[NDS Worker] Diagnostics unavailable:', error.message);
    return null;
  }
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) return null;

  return {
    outstanding: toInt(row.outstanding),
    leased: toInt(row.leased),
    expiredLeases: toInt(row.expired_leases),
    failing: toInt(row.failing),
    oldestOutstandingAge:
      typeof row.oldest_outstanding_age === 'string' ? row.oldest_outstanding_age : null,
  };
}
