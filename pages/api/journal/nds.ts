/**
 * GET /api/journal/nds
 * 
 * Fetch daily Nutrition Density Score for a person/date.
 * 
 * Query Parameters:
 * - person_id (optional): Person UUID. Defaults to authenticated user's person_id.
 * - date_local (optional): Date in YYYY-MM-DD format. Defaults to today.
 * - include_debug (optional): If 'true', includes detailed debug breakdown.
 * 
 * Response:
 * - date_local: string
 * - person_id: string
 * - nds_score_100: number (0-100)
 * - subscores_10: object with wfr, ps, pnd, fp, as, mnc, ob (each 0-10)
 * - nds_version: string
 * - classifier_version: string
 * - debug_data?: object (if include_debug=true and user is admin)
 * 
 * Authentication: Uses Supabase session cookie (same as other journal APIs)
 * Authorization: Users can access their own NDS; admins and users with an
 *   active person_access_links(journal_read) can access another person's NDS.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireJournalAuth, resolveJournalTargetPerson } from '@/lib/access/requireJournalAccess';
import { getDailyNDS, recomputeDailyNDS, type RecomputeResult } from '@/lib/nds/ndsServerService';
import { getEmptyNDS } from '@/lib/nds/dailyCalculator';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';

// ============================================================================
// Types
// ============================================================================

interface NDSResponse {
  date_local: string;
  person_id: string;
  nds_score_100: number;
  subscores_10: {
    wfr: number;
    ps: number;
    pnd: number;
    fp: number;
    as: number;
    mnc: number;
    ob: number;
  };
  nds_version: string;
  classifier_version: string;
  debug_data?: Record<string, unknown>;
  _meta?: {
    computed_at: string;
    source: 'cached' | 'recomputed' | 'empty';
    entry_count?: number;
    intake_count?: number;
    meal_count?: number;
    entry_types?: Record<string, number>;
    empty_reason?: string;
  };
  _error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDateLocal(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Validate YYYY-MM-DD format.
 */
function isValidDateLocal(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// ============================================================================
// Handler
// ============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NDSResponse | { error: string }>
) {
  // Only GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Authenticate user (journal access checked by resolveJournalTargetPerson)
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return; // 401 or 403 already sent
    const { user } = ctx;

    // Parse query params
    const { 
      date_local: dateParam,
      include_debug: debugParam,
      force: forceParam,
    } = req.query;
    
    // Determine date_local
    const dateLocal = typeof dateParam === 'string' && isValidDateLocal(dateParam)
      ? dateParam
      : getTodayDateLocal();

    // Resolve target person (supports ?person_id= via admin bypass or access links)
    const personId = await resolveJournalTargetPerson(req, res, ctx);
    if (!personId) return; // 403 already sent
    
    // Try to fetch cached NDS
    const userIsAdmin = user.role === 'admin';
    const includeDebug = debugParam === 'true' && userIsAdmin;
    const forceRecompute = forceParam === 'true';
    let cached = forceRecompute ? null : await getDailyNDS(personId, dateLocal);
    let source: 'cached' | 'recomputed' | 'empty' = 'cached';
    let recomputeDiag: RecomputeResult['diagnostics'] | undefined;
    
    // Recompute if:
    //  - No cached data
    //  - Cached version is stale (formula changed)
    //  - Client requested force recompute (entries changed)
    //  - Cached score is 0 (always from getEmptyNDS; real meals always produce > 0
    //    because the AS subscore defaults to 10 with 0 added sugar)
    const isStale = cached && cached.nds_version !== NDS_VERSION;
    const isZeroCache = cached && cached.nds_score_100 === 0;
    if (!cached || isStale || isZeroCache || forceRecompute) {
      const reason = forceRecompute ? 'force' : isStale ? `stale(${cached!.nds_version}→${NDS_VERSION})` : isZeroCache ? 'zero-cache-recheck' : 'missing';
      console.log(`[NDS API] Recomputing: reason=${reason} date=${dateLocal} person=${personId.slice(0,8)}`);
      try {
        const recomputed = await recomputeDailyNDS(personId, dateLocal, includeDebug);
        cached = recomputed.stored;
        recomputeDiag = recomputed.diagnostics;
        source = 'recomputed';
        console.log(`[NDS API] Recompute success: score=${cached.nds_score_100} entries=${recomputeDiag.entry_count} intake=${recomputeDiag.intake_count} meals=${recomputeDiag.meal_count}${recomputeDiag.empty_reason ? ` empty_reason=${recomputeDiag.empty_reason}` : ''}`);
      } catch (computeError) {
        const errorMsg = computeError instanceof Error ? computeError.message : String(computeError);
        console.error(`[NDS API] Computation FAILED: ${errorMsg}`, computeError);
        const emptyResult = getEmptyNDS();
        
        return res.status(200).json({
          date_local: dateLocal,
          person_id: personId,
          nds_score_100: emptyResult.nds_score_100,
          subscores_10: {
            wfr: emptyResult.subscores.wfr_10,
            ps: emptyResult.subscores.ps_10,
            pnd: emptyResult.subscores.pnd_10,
            fp: emptyResult.subscores.fp_10,
            as: emptyResult.subscores.as_10,
            mnc: emptyResult.subscores.mnc_10,
            ob: emptyResult.subscores.ob_10,
          },
          nds_version: emptyResult.nds_version,
          classifier_version: emptyResult.classifier_version,
          _meta: {
            computed_at: new Date().toISOString(),
            source: 'empty',
          },
          _error: errorMsg,
        });
      }
    }
    
    // Build response
    const response: NDSResponse = {
      date_local: dateLocal,
      person_id: personId,
      nds_score_100: cached.nds_score_100,
      subscores_10: {
        wfr: cached.wfr_10,
        ps: cached.ps_10,
        pnd: cached.pnd_10,
        fp: cached.fp_10,
        as: cached.as_10,
        mnc: cached.mnc_10,
        ob: cached.ob_10,
      },
      nds_version: cached.nds_version,
      classifier_version: cached.classifier_version,
      _meta: {
        computed_at: cached.updated_at,
        source,
        ...(recomputeDiag ? {
          entry_count: recomputeDiag.entry_count,
          intake_count: recomputeDiag.intake_count,
          meal_count: recomputeDiag.meal_count,
          entry_types: recomputeDiag.entry_types,
          empty_reason: recomputeDiag.empty_reason,
        } : {}),
      },
    };
    
    // Include debug data if requested and allowed
    if (includeDebug && cached.debug_data) {
      response.debug_data = cached.debug_data as Record<string, unknown>;
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('[NDS API] Unexpected error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
}
