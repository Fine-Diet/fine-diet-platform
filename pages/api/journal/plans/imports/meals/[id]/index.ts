/**
 * /api/journal/plans/imports/meals/[id]
 *
 * Phase 4: detail / edit endpoint for an imported_meals draft.
 *
 *   - GET: self-read via journal access.
 *   - PATCH: self-only write. Allows the user to update title, source_url,
 *     attachable payload, parsed_payload_json, nutrition_estimate_json,
 *     ingredient_match_json, and/or parse_status. When the attachable
 *     `payload` changes we also recompute the meal-level NDS shape so
 *     day projections stay truthful after an edit.
 *
 * Body shape validated by ImportRecipePatchSchema.
 *
 * Auth: self-only write. Cross-person access is rejected by the service
 * helpers via person_id filtering.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
  resolveJournalTargetPerson,
} from '@/lib/access/requireJournalAccess';
import { ImportRecipePatchSchema } from '@/lib/plans/validators';
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
import {
  missingItemInputsFromIngredientMatches,
  recordMissingIngredientBatch,
} from '@/lib/missingItems/missingItemRequestServerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) {
    return res.status(400).json({ error: 'Missing import id.' });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const target = await resolveJournalTargetPerson(req, res, ctx);
      if (!target) return;
      const imported = await getImportedMeal(target, id);
      if (!imported) return res.status(404).json({ error: 'Imported meal not found.' });
      return res.status(200).json({ imported_meal: imported });
    }

    if (req.method === 'PATCH') {
      if (!(await requireCallerJournalAccess(res, ctx))) return;
      const { personId } = ctx;

      const parsed = ImportRecipePatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
      }

      const patch = parsed.data;
      const current = await getImportedMeal(personId, id);
      if (!current) return res.status(404).json({ error: 'Imported meal not found.' });

      // --------------------------------------------------------------
      // Packet 4 follow-up — transparent edits
      //
      // When the user edits `parsed_payload_json` (e.g. changes an
      // ingredient's quantity, adds an item, or removes one), we
      // regenerate the dependent fields server-side so a single save
      // keeps four surfaces consistent:
      //
      //   - `parsed_payload_json`  (authoritative edit target)
      //   - `payload`              (attachable shape for slots/templates)
      //   - `nutrition_estimate_json` (per-serving totals)
      //   - `ingredient_match_json` (per-item match records)
      //
      // The client only has to send `parsed_payload_json`; the server
      // does the rest via `rebuildDerivedFromIngredients`. This is the
      // same derivation path the initial import uses, so edits and
      // imports produce identical downstream shapes.
      //
      // If the caller supplies `payload` explicitly, that wins — this
      // keeps us compatible with advanced edits that already know the
      // attachable shape they want.
      // --------------------------------------------------------------

      const draftChanged = patch.parsed_payload_json !== undefined;
      const payloadExplicit = patch.payload !== undefined;

      let nextPayload: typeof current.payload = current.payload;
      let nextEstimate = patch.nutrition_estimate_json;
      let nextMatch = patch.ingredient_match_json;
      let nextParseStatus = patch.parse_status;

      if (draftChanged && !payloadExplicit && patch.parsed_payload_json) {
        const draft = patch.parsed_payload_json;
        // Packet 6: rerun matching on every edit. We prefer the
        // grounded (trusted food-object) matcher so quantity tweaks and
        // renames can upgrade confidence from `low` → `high`. If the
        // lookup fails we fall back to the pure heuristic path so the
        // edit still persists.
        let rebuilt: Awaited<ReturnType<typeof rebuildDerivedFromIngredientsGrounded>>;
        try {
          rebuilt = await rebuildDerivedFromIngredientsGrounded({
            title: patch.title ?? current.title,
            ingredients: draft.ingredients ?? [],
            servings: draft.servings ?? null,
            lookup: createDefaultIngredientLookup(),
            // Packet 28 — carry previously recorded user_choice
            // decisions through structural edits (amount / unit /
            // name tweaks). Without this, an edit to an adjacent
            // row would silently re-run scoring for an already-
            // applied row and overwrite the user's choice.
            priorMatches: current.ingredient_match_json ?? null,
          });
        } catch (matchErr) {
          console.warn(
            '[API /journal/plans/imports/meals/:id PATCH] grounded rebuild failed, using heuristic:',
            matchErr instanceof Error ? matchErr.message : matchErr,
          );
          rebuilt = rebuildDerivedFromIngredients({
            title: patch.title ?? current.title,
            ingredients: draft.ingredients ?? [],
            servings: draft.servings ?? null,
          });
        }
        nextPayload = rebuilt.payload as typeof current.payload;
        if (nextEstimate === undefined) nextEstimate = rebuilt.nutrition_estimate;
        if (nextMatch === undefined) nextMatch = rebuilt.ingredient_match;
        if (nextParseStatus === undefined) nextParseStatus = rebuilt.parse_status;
      } else if (payloadExplicit) {
        nextPayload = patch.payload as typeof current.payload;
      }

      const payloadChanged = draftChanged || payloadExplicit;
      const ndsDerived = payloadChanged
        ? recomputeMealNDSShape(
            patch.title ?? current.title,
            nextPayload as {
              items?: Array<{ food_object_id?: string | null; calories?: number | null }>;
              totals?: { calories?: number; protein_g?: number };
            },
          )
        : null;

      const updated = await updateImportedMeal(personId, id, {
        title: patch.title,
        source_url: patch.source_url,
        payload: payloadChanged ? nextPayload : undefined,
        parsed_payload_json: patch.parsed_payload_json,
        nutrition_estimate_json: nextEstimate,
        ingredient_match_json: nextMatch,
        parse_status: nextParseStatus,
        ...(ndsDerived
          ? {
              protein_score_10: ndsDerived.protein_score_10,
              is_main_meal: ndsDerived.is_main_meal,
              psq_multiplier: ndsDerived.psq_multiplier,
              meal_derived_data: ndsDerived.meal_derived_data,
              nds_confidence: ndsDerived.nds_confidence,
            }
          : {}),
      });

      if (!updated) return res.status(404).json({ error: 'Imported meal not found.' });

      // Packet 14: re-enqueue missing-item requests whenever a rebuild
      // produced a fresh match set with unresolved rows. Fire-and-forget.
      const matchesForBacklog = updated.ingredient_match_json ?? null;
      if (
        draftChanged &&
        Array.isArray(matchesForBacklog) &&
        matchesForBacklog.length > 0
      ) {
        const inputs = missingItemInputsFromIngredientMatches({
          personId,
          sourceRef: updated.id,
          matches: matchesForBacklog,
        });
        if (inputs.length > 0) {
          recordMissingIngredientBatch(inputs).catch(() => {
            /* non-fatal */
          });
        }
      }

      return res.status(200).json({ imported_meal: updated });
    }

    res.setHeader('Allow', ['GET', 'PATCH']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('[API /journal/plans/imports/meals/:id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
