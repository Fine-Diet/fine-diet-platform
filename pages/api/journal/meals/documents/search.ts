/**
 * GET /api/journal/meals/documents/search
 *
 * Meal Object Foundation — Packet 6. Person-scoped retrieval/search over the
 * caller's MealDocuments (Meal Library: recipes + meals). This is a SEPARATE,
 * additive endpoint that expands Fine Diet discovery BESIDE branded food
 * search. It deliberately does NOT touch /api/foods/search or lib/food/* — the
 * existing branded-food search path is left byte-stable.
 *
 * Query params:
 *   - q?            free-text over title (empty ⇒ browse, updated_at DESC)
 *   - mode?         all | meals | recipes (MealDocument modes). 'foods' is
 *                   rejected here (it lives at /api/foods/search). 'restaurants'
 *                   and 'recent' are accepted but DEFERRED (empty results).
 *   - kind?         meal | recipe (explicit; overrides mode-derived kind)
 *   - review_state? draft | needs_review | confirmed
 *   - limit?        1..50 (default 20)
 *
 * Auth: read path. personId is resolved from the session; staff view-as-client
 * is supported via ?person_id= and enforced by resolveJournalTargetPerson.
 * Results are ALWAYS person-scoped server-side; no cross-user rows are possible.
 *
 * This route performs NO writes, NO AI, and NO nutrition recompute.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  requireJournalAuth,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import {
  searchMealDocumentsForPerson,
  type MealDocumentSearchParams,
} from '@/lib/meals/mealDocumentSearchService';
import {
  isDeferredSearchMode,
  isSearchMode,
  type SearchMode,
} from '@/lib/meals/searchTypes';
import type { MealDocumentKind, MealReviewState } from '@/lib/meals/types';

const VALID_KINDS: MealDocumentKind[] = ['meal', 'recipe'];
const VALID_REVIEW_STATES: MealReviewState[] = ['draft', 'needs_review', 'confirmed'];

function firstStringParam(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    const personId = await resolveJournalTargetPerson(req, res, ctx);
    if (!personId) return; // 403 already sent

    // ---- Parse + validate query params -----------------------------------
    const q = firstStringParam(req.query.q) ?? '';

    const modeParam = firstStringParam(req.query.mode);
    let mode: SearchMode = 'all';
    if (modeParam !== undefined && modeParam.length > 0) {
      if (!isSearchMode(modeParam)) {
        return res.status(400).json({
          error: `Invalid mode. Valid values: all, foods, meals, recipes, restaurants, recent`,
        });
      }
      mode = modeParam;
    }

    // Branded food search is served exclusively by /api/foods/search. This
    // endpoint never proxies it, protecting branded search from regression.
    if (mode === 'foods') {
      return res.status(400).json({
        error:
          'mode=foods is served by /api/foods/search, not this endpoint. Use it for branded/custom food search.',
        endpoint: '/api/foods/search',
      });
    }

    const kindParam = firstStringParam(req.query.kind);
    let kind: MealDocumentKind | undefined;
    if (kindParam !== undefined && kindParam.length > 0) {
      if (!VALID_KINDS.includes(kindParam as MealDocumentKind)) {
        return res
          .status(400)
          .json({ error: `Invalid kind. Valid values: ${VALID_KINDS.join(', ')}` });
      }
      kind = kindParam as MealDocumentKind;
    }

    const reviewParam = firstStringParam(req.query.review_state);
    let reviewState: MealReviewState | undefined;
    if (reviewParam !== undefined && reviewParam.length > 0) {
      if (!VALID_REVIEW_STATES.includes(reviewParam as MealReviewState)) {
        return res.status(400).json({
          error: `Invalid review_state. Valid values: ${VALID_REVIEW_STATES.join(', ')}`,
        });
      }
      reviewState = reviewParam as MealReviewState;
    }

    const limitParam = firstStringParam(req.query.limit);
    const limit = limitParam !== undefined ? Number.parseInt(limitParam, 10) : undefined;

    // ---- Deferred modes: documented, no backing data queried in P6 --------
    if (isDeferredSearchMode(mode)) {
      return res.status(200).json({
        mode,
        deferred: true,
        query: q.trim(),
        results: [],
        message: `Search mode '${mode}' is not yet available.`,
      });
    }

    // ---- MealDocument search (all | meals | recipes) ----------------------
    // `mode` is narrowed to a MealDocument mode here: 'foods' returned 400 and
    // deferred modes returned above, leaving only all | meals | recipes.
    const params: MealDocumentSearchParams = {
      q,
      mode: mode as MealDocumentSearchParams['mode'],
      kind: kind ?? null,
      review_state: reviewState ?? null,
      limit: limit ?? null,
    };

    const outcome = await searchMealDocumentsForPerson(personId, params);
    return res.status(200).json(outcome);
  } catch (err) {
    console.error('[API /journal/meals/documents/search GET] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
