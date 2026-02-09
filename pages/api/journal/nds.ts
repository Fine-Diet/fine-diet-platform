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
 * Authorization: Users can only access their own NDS, unless admin
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { getDailyNDS, recomputeDailyNDS } from '@/lib/nds/ndsServerService';
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
  };
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
    // Authenticate user (uses session cookies, same as other journal APIs)
    const user = await getCurrentUserWithRoleFromApi(req, res);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Parse query params
    const { 
      person_id: personIdParam, 
      date_local: dateParam,
      include_debug: debugParam,
      force: forceParam,
    } = req.query;
    
    // Determine date_local
    const dateLocal = typeof dateParam === 'string' && isValidDateLocal(dateParam)
      ? dateParam
      : getTodayDateLocal();
    
    // Get authenticated user's person_id
    const userPersonId = await getPersonIdFromAuthUserId(user.id);
    if (!userPersonId) {
      return res.status(403).json({ error: 'No person record found. Please contact support.' });
    }
    
    // Determine person_id to fetch
    let personId: string;
    
    if (typeof personIdParam === 'string' && personIdParam.length > 0) {
      // Explicit person_id provided - validate access
      personId = personIdParam;
    } else {
      // Default to authenticated user's person_id
      personId = userPersonId;
    }
    
    // Authorization check: Users can only access their own NDS, admins can access any
    const userIsAdmin = user.role === 'admin';
    
    if (personId !== userPersonId && !userIsAdmin) {
      return res.status(403).json({ error: 'Access denied to this person\'s NDS' });
    }
    
    // Try to fetch cached NDS
    const includeDebug = debugParam === 'true' && userIsAdmin;
    const forceRecompute = forceParam === 'true';
    let cached = forceRecompute ? null : await getDailyNDS(personId, dateLocal);
    let source: 'cached' | 'recomputed' | 'empty' = 'cached';
    
    // Recompute if:
    //  - No cached data
    //  - Cached version is stale (formula changed)
    //  - Client requested force recompute (entries changed)
    const isStale = cached && cached.nds_version !== NDS_VERSION;
    if (!cached || isStale || forceRecompute) {
      if (forceRecompute) {
        console.log(`[NDS API] Force recompute requested for ${dateLocal}.`);
      } else if (isStale) {
        console.log(`[NDS API] Stale version: cached=${cached!.nds_version}, current=${NDS_VERSION}. Recomputing.`);
      }
      try {
        cached = await recomputeDailyNDS(personId, dateLocal, includeDebug);
        source = 'recomputed';
      } catch (computeError) {
        // Fallback to empty NDS if computation fails
        console.error('[NDS API] Computation failed:', computeError);
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
