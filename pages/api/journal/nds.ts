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
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getDailyNDS, recomputeDailyNDS } from '../../../lib/nds/ndsServerService';
import { getEmptyNDS } from '../../../lib/nds/dailyCalculator';
import { NDS_VERSION, CLASSIFIER_VERSION } from '../../../lib/nds/types';

// Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

/**
 * Get person_id from auth user.
 */
async function getPersonIdFromAuth(authUserId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  return data.id;
}

/**
 * Check if user is admin (for debug data access).
 */
async function isAdmin(authUserId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('people')
    .select('role')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  
  return data?.role === 'admin';
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
    // Get auth token from header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Verify token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    // Parse query params
    const { 
      person_id: personIdParam, 
      date_local: dateParam,
      include_debug: debugParam,
    } = req.query;
    
    // Determine date_local
    const dateLocal = typeof dateParam === 'string' && isValidDateLocal(dateParam)
      ? dateParam
      : getTodayDateLocal();
    
    // Determine person_id
    let personId: string | null = null;
    
    if (typeof personIdParam === 'string' && personIdParam.length > 0) {
      // Explicit person_id provided - validate access later
      personId = personIdParam;
    } else {
      // Default to authenticated user's person_id
      personId = await getPersonIdFromAuth(user.id);
    }
    
    if (!personId) {
      return res.status(400).json({ error: 'Could not determine person_id' });
    }
    
    // TODO: Add access control for household/caregiver scenarios
    // For now, only allow users to access their own NDS
    const userPersonId = await getPersonIdFromAuth(user.id);
    const userIsAdmin = await isAdmin(user.id);
    
    if (personId !== userPersonId && !userIsAdmin) {
      return res.status(403).json({ error: 'Access denied to this person\'s NDS' });
    }
    
    // Try to fetch cached NDS
    const includeDebug = debugParam === 'true' && userIsAdmin;
    let cached = await getDailyNDS(personId, dateLocal);
    let source: 'cached' | 'recomputed' | 'empty' = 'cached';
    
    // If no cached data, compute it now
    if (!cached) {
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
