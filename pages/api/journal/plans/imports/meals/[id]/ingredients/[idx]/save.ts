/**
 * POST /api/journal/plans/imports/meals/[id]/ingredients/[idx]/save
 *
 * Plans Phase 29 — In-place row save.
 *
 * Commits a partial update to a single ingredient row on the draft
 * without requiring the user to scroll to the bottom-of-page Save
 * Changes button.
 *
 * Contract notes (Packet 29 §3e, §4b):
 *   - Only the targeted row index is mutated on
 *     `parsed_payload_json.ingredients`. All other rows pass through
 *     untouched — this keeps the commit truly row-local and avoids
 *     silently persisting unrelated in-flight local edits.
 *   - The full rebuild pipeline runs with `priorMatches` so any
 *     Packet 28 `user_choice` decisions on other rows are preserved.
 *   - The targeted row's `user_choice` is NOT cleared when structural
 *     fields change: if a user had applied a source and then tweaks
 *     the amount, we keep the applied source locked (override path in
 *     `matchIngredient`) so estimates rescale cleanly.
 *   - Steps / description / servings / title are left exactly where
 *     they are on the server — this endpoint is ingredients-only.
 *
 * Auth: self-only via `requireJournalAuth` +
 * `requireCallerJournalAccess`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  getImportedMeal,
  updateImportedMeal,
} from '@/lib/plans/importsServerService';
import { recomputeMealNDSShape } from '@/lib/plans/planServerService';
import {
  rebuildDerivedFromIngredients,
  rebuildDerivedFromIngredientsGrounded,
} from '@/lib/plans/recipeImporter';
import { createDefaultIngredientLookup } from '@/lib/plans/ingredientMatcher';
import { rebuildRawTextFromStructured } from '@/lib/plans/ingredientPhraseParser';
import type {
  ImportedMealDraftIngredient,
  ImportedMealDraftPayload,
} from '@/lib/plans/types';

// ----------------------------------------------------------------
// Request validation
// ----------------------------------------------------------------

/**
 * Partial row patch. Any omitted field is left at its current value
 * on the server. `null` is a meaningful value for `normalized_name`,
 * `quantity_value`, `quantity_unit`, and `preparation_note` — it
 * clears the field.
 */
const IngredientRowPatchSchema = z
  .object({
    raw_text: z.string().nullable().optional(),
    normalized_name: z.string().nullable().optional(),
    quantity_value: z.number().nullable().optional(),
    quantity_unit: z.string().nullable().optional(),
    preparation_note: z.string().nullable().optional(),
    parse_confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
    quantity_source: z
      .enum(['explicit', 'count_inferred', 'range_midpoint', 'approximated'])
      .nullable()
      .optional(),
  })
  .strict();

const SaveRowBodySchema = z.object({
  ingredient: IngredientRowPatchSchema,
});

// ----------------------------------------------------------------
// Handler
// ----------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  const idxRaw = typeof req.query.idx === 'string' ? req.query.idx : null;
  if (!id) return res.status(400).json({ error: 'Missing import id.' });
  if (idxRaw === null) return res.status(400).json({ error: 'Missing ingredient index.' });
  const idx = Number.parseInt(idxRaw, 10);
  if (!Number.isFinite(idx) || idx < 0) {
    return res.status(400).json({ error: 'Ingredient index must be a non-negative integer.' });
  }

  const parsed = SaveRowBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
  }
  const patch = parsed.data.ingredient;

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const current = await getImportedMeal(personId, id);
    if (!current) return res.status(404).json({ error: 'Imported meal not found.' });

    const draft = current.parsed_payload_json;
    if (!draft) {
      return res.status(409).json({
        error:
          'This draft has no parsed ingredient payload — row-level save is only available on parsed drafts.',
      });
    }

    const ingredients = draft.ingredients ?? [];
    if (idx >= ingredients.length) {
      return res.status(404).json({
        error: `Ingredient index ${idx} is out of range (draft has ${ingredients.length} rows).`,
      });
    }

    // --------------------------------------------------------------
    // Merge the patch into the targeted row, then normalize via
    // `rebuildRawTextFromStructured` so the raw text stays consistent
    // with the structured fields. This mirrors what the UI does on
    // keystroke so the server-authoritative row lines up with the
    // isomorphic parser's output.
    // --------------------------------------------------------------
    const targetRow = ingredients[idx];
    const rawTextOverride =
      patch.raw_text !== undefined ? patch.raw_text ?? '' : undefined;
    const mergedRow: ImportedMealDraftIngredient = {
      ...targetRow,
      ...patch,
      // raw_text is required (`string`). Patch may carry null meaning
      // "clear" — normalize that to empty string here; the rebuild
      // fall-through below regenerates a canonical raw_text from the
      // structural fields regardless.
      raw_text: rawTextOverride ?? targetRow.raw_text,
    };

    // Only trust an explicit caller-provided raw_text. Otherwise
    // regenerate it from the structured fields so the server-
    // authoritative row lines up with what the isomorphic parser
    // would produce. This mirrors the client's in-edit behavior
    // (`updateIngredientField`).
    if (rawTextOverride === undefined) {
      mergedRow.raw_text = rebuildRawTextFromStructured(mergedRow);
    }

    const nextIngredients: ImportedMealDraftIngredient[] = ingredients.map((row, i) =>
      i === idx ? mergedRow : row,
    );

    const nextDraft: ImportedMealDraftPayload = {
      ...draft,
      ingredients: nextIngredients,
    };

    // --------------------------------------------------------------
    // Re-derive payload / estimate / NDS with priorMatches so the
    // user's Packet 28 decisions on other rows (and on this row) are
    // preserved. If the edited row had `user_choice='applied'`, the
    // matcher keeps that source locked and just re-scales against
    // the new amount / unit.
    // --------------------------------------------------------------
    let rebuilt: Awaited<ReturnType<typeof rebuildDerivedFromIngredientsGrounded>>;
    try {
      rebuilt = await rebuildDerivedFromIngredientsGrounded({
        title: current.title,
        ingredients: nextIngredients,
        servings: draft.servings ?? null,
        lookup: createDefaultIngredientLookup(),
        priorMatches: current.ingredient_match_json ?? null,
      });
    } catch (matchErr) {
      console.warn(
        '[API ingredients/[idx]/save] grounded rebuild failed, using heuristic:',
        matchErr instanceof Error ? matchErr.message : matchErr,
      );
      rebuilt = rebuildDerivedFromIngredients({
        title: current.title,
        ingredients: nextIngredients,
        servings: draft.servings ?? null,
      });
    }

    const ndsDerived = recomputeMealNDSShape(
      current.title,
      rebuilt.payload as {
        items?: Array<{ food_object_id?: string | null; calories?: number | null }>;
        totals?: { calories?: number; protein_g?: number };
      },
    );

    const updated = await updateImportedMeal(personId, id, {
      parsed_payload_json: nextDraft,
      payload: rebuilt.payload,
      nutrition_estimate_json: rebuilt.nutrition_estimate,
      ingredient_match_json: rebuilt.ingredient_match,
      parse_status: rebuilt.parse_status,
      protein_score_10: ndsDerived.protein_score_10,
      is_main_meal: ndsDerived.is_main_meal,
      psq_multiplier: ndsDerived.psq_multiplier,
      meal_derived_data: ndsDerived.meal_derived_data,
      nds_confidence: ndsDerived.nds_confidence,
    });
    if (!updated) return res.status(404).json({ error: 'Imported meal not found.' });

    return res.status(200).json({
      imported_meal: updated,
      row: { index: idx },
    });
  } catch (err) {
    console.error('[API ingredients/[idx]/save POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
