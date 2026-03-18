/**
 * GET /api/foods/search?q=query
 * 
 * Search foods by text query.
 * Returns sectioned results (My Foods, Common, Branded, Scanned, Other) in deterministic order.
 * 
 * Query params:
 * - q: Search query (required, min 2 chars)
 * - limit: Overall max results (default 50)
 * - sectionLimit: Max results per section (default 12)
 * - section: Return only this section (for "Show more")
 *   Valid values: my_foods, common, branded, scanned, other
 * - sectionOffset: Offset for section pagination (default 0)
 * - debug: Include debug info in response (dev only)
 * 
 * Response:
 * - results: Flat list of all results (for backward compatibility)
 * - sections: Array of sections in order (my_foods → common → branded → scanned → other)
 *   Each section has: key, label, order, topScore, total, shown, hasMore, offset, items
 * - Legacy fields: yourFoods, branded, common (deprecated)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getCurrentUserWithRoleFromApi } from '@/lib/authServer';
import { getPersonIdFromAuthUserId } from '@/lib/journal/journalServerService';
import { searchFoods, SectionKey } from '@/lib/food/foodServerService';

// Valid section keys (includes 'off' for Phase 2 OFF fallback pagination)
const VALID_SECTIONS: SectionKey[] = ['my_foods', 'common', 'branded', 'scanned', 'other', 'promoted_off', 'off'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 50;
    const sectionLimit = parseInt(req.query.sectionLimit as string) || 12;
    const sectionOffset = parseInt(req.query.sectionOffset as string) || 0;
    
    // Validate section param if provided
    const sectionParam = req.query.section as string | undefined;
    let section: SectionKey | undefined;
    if (sectionParam) {
      if (!VALID_SECTIONS.includes(sectionParam as SectionKey)) {
        return res.status(400).json({ 
          error: `Invalid section. Valid values: ${VALID_SECTIONS.join(', ')}` 
        });
      }
      section = sectionParam as SectionKey;
    }
    
    // Debug mode: set via query param or env var
    const debug = req.query.debug === 'true' || 
      (process.env.NODE_ENV !== 'production' && process.env.SEARCH_DEBUG === 'true');

    // Try to get authenticated user (search works for both auth'd and anon)
    let personId: string | null = null;
    try {
      const user = await getCurrentUserWithRoleFromApi(req, res);
      if (user) {
        personId = await getPersonIdFromAuthUserId(user.id);
      }
    } catch {
      // Anonymous user - that's fine for search
    }

    const sessionId = (req.headers['x-session-id'] as string) || null;
    const pageContext = (req.query.pageContext as string) || null;

    const results = await searchFoods(query, personId, {
      limit,
      sectionLimit,
      section,
      sectionOffset,
      debug,
      sessionId,
      pageContext,
    });

    return res.status(200).json(results);
  } catch (error) {
    console.error('[API /api/foods/search] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
