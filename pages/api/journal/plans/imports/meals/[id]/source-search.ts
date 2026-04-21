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
import type { FoodObjectLite } from '@/lib/plans/ingredientMatcher';
import {
  searchTrustedFoodObjectsForRow,
  type RowContext,
} from '@/lib/plans/trustedSourceSearch';
import type { ImportedMealDraftPayload } from '@/lib/plans/types';

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

  // Packet 30 — optional row context. When the client supplies an
  // `idx` query param pointing at an ingredient row on the draft, we
  // hand that row's name + prep note to the ranker as row-context
  // signal. Absent (or out-of-range) idx is a supported case: the
  // search falls back to pure query-based ranking.
  const parsedIdx = parseOptionalIdx(req.query.idx);

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const current = await getImportedMeal(personId, id);
    if (!current) return res.status(404).json({ error: 'Imported meal not found.' });

    const rowContext = deriveRowContext(
      (current.parsed_payload_json ?? null) as ImportedMealDraftPayload | null,
      parsedIdx,
    );

    const scored = await searchTrustedFoodObjectsForRow(q, {
      limit: MAX_CANDIDATES,
      row: rowContext,
    });

    // Light shape for the UI: only what the review panel needs.
    const shaped = scored.map((s) => toPreviewRow(s.food));

    return res.status(200).json({ candidates: shaped });
  } catch (err) {
    console.error('[API /journal/plans/imports/meals/:id/source-search] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Parse the optional `idx` query param. Accepts a non-negative integer
 * as a string; returns null on anything else so the search endpoint
 * still works when the UI omits the idx (e.g. older clients).
 */
function parseOptionalIdx(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * Pull the targeted ingredient row off the draft payload and project
 * it into the lightweight `RowContext` shape used by the ranker.
 * Returns null when the payload is missing the expected structure or
 * the idx falls outside the ingredient array.
 */
function deriveRowContext(
  payload: ImportedMealDraftPayload | null,
  idx: number | null,
): RowContext | null {
  if (!payload || idx == null) return null;
  const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : [];
  if (idx >= ingredients.length) return null;
  const row = ingredients[idx];
  if (!row) return null;
  const name = row.normalized_name ?? row.raw_text ?? null;
  return {
    ingredient_name: name,
    preparation_note: row.preparation_note ?? null,
  };
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
