/**
 * GET /api/journal/plans/imports/meals/[id]/source-search?q=...
 *
 * Plans Phase 29 — Row-level trusted-source search.
 *
 * Returns a small candidate list of trusted food objects matching the
 * caller-supplied query, intended to back the row-level "Find source"
 * / "Replace source" panel on an import-draft ingredient row.
 *
 * Contract notes (Packet 29 §3a, §3f):
 *   - Operates against the trusted food-object layer only — the same
 *     layer used by the Packet 28 suggested-source adoption flow.
 *   - Does not touch the fixed NDS model, curated-truth promotion, or
 *     any part of the broader trust-governance layer.
 *   - Scoped under an imported meal id for symmetry with the other
 *     row-level endpoints. We verify the caller owns the draft before
 *     running the search so this stays self-only.
 *
 * Response shape:
 *   {
 *     candidates: Array<{
 *       id, canonical_name, brand_name, serving_size_g,
 *       calories, protein_g, carbs_g, fat_g,
 *       is_verified, source_provider, source_type, nutrient_confidence
 *     }>
 *   }
 *
 * Auth: self-only via `requireJournalAuth` +
 * `requireCallerJournalAccess`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import { getImportedMeal } from '@/lib/plans/importsServerService';
import {
  createDefaultIngredientLookup,
  type FoodObjectLite,
} from '@/lib/plans/ingredientMatcher';

const MAX_QUERY_LENGTH = 120;
const MAX_CANDIDATES = 12;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Missing import id.' });

  const rawQ = typeof req.query.q === 'string' ? req.query.q : '';
  const q = rawQ.trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length < 2) {
    return res.status(200).json({ candidates: [] });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const current = await getImportedMeal(personId, id);
    if (!current) return res.status(404).json({ error: 'Imported meal not found.' });

    const lookup = createDefaultIngredientLookup();
    const candidates = await lookup.findCandidates(q);

    // Light shape for the UI: only what the review panel needs.
    const shaped = candidates.slice(0, MAX_CANDIDATES).map(toPreviewRow);

    return res.status(200).json({ candidates: shaped });
  } catch (err) {
    console.error('[API /journal/plans/imports/meals/:id/source-search] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export interface SourceSearchCandidate {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  serving_size_g: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  is_verified: boolean;
  source_provider: string | null;
  source_type: string | null;
  nutrient_confidence: 'high' | 'medium' | 'low' | null;
}

function toPreviewRow(f: FoodObjectLite): SourceSearchCandidate {
  return {
    id: f.id,
    canonical_name: f.canonical_name,
    brand_name: f.brand_name,
    serving_size_g: f.serving_size_g,
    calories: f.calories,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    is_verified: f.is_verified,
    source_provider: f.source_provider,
    source_type: f.source_type,
    nutrient_confidence: f.nutrient_confidence,
  };
}
