/**
 * POST /api/journal/plans/imports/meals/[id]/ingredients/[idx]/source
 *
 * Plans Phase 28 — Suggested source adoption workflow.
 *
 * Implements the row-level `apply` / `reject` / `undo` actions for a
 * single ingredient row inside an import draft. The action is
 * intentionally narrow: it mutates only the targeted row's
 * `user_choice`, then re-derives the downstream fields
 * (`payload`, `nutrition_estimate_json`, `ingredient_match_json`,
 * NDS) via `rebuildDerivedFromIngredientsGrounded` with the prior
 * match set so other rows stay exactly as they were.
 *
 *   - `apply`   commits a food-object source for this row. If the
 *               caller omits `food_object_id`, we default to the
 *               current match record's suggested `source_id` —
 *               this is the common "Use this source" one-click path
 *               (Packet 28 §6b). The server re-runs the guardrail
 *               classifier and refuses `ineligible` rows.
 *   - `reject`  marks `user_choice='rejected'`. The suggestion is
 *               suppressed and the row falls through to the
 *               heuristic / default estimate on future rebuilds.
 *   - `undo`    clears `user_choice` (whether it was applied or
 *               rejected). The matcher will re-score the row on the
 *               next save and may resurface the suggestion.
 *
 * The endpoint also records an `ingredient_source_events` row as
 * lightweight product telemetry (Packet 28 §4c).
 *
 * Auth: self-only write via `requireJournalAuth` +
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
import {
  classifyMatchEntry,
  type SuggestedSourceVerdict,
} from '@/lib/plans/suggestedSourceEligibility';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { IngredientMatchEntry } from '@/lib/plans/types';

// ----------------------------------------------------------------
// Request validation
// ----------------------------------------------------------------

const IngredientSourceActionSchema = z.object({
  action: z.enum(['apply', 'reject', 'undo']),
  /**
   * Optional explicit food-object id for `apply`. When omitted and
   * the current match record already has a food_object source, we
   * adopt that one — this is the common "Use this source" path.
   */
  food_object_id: z.string().uuid().nullable().optional(),
});

type IngredientSourceAction = z.infer<typeof IngredientSourceActionSchema>['action'];

function actionToEventType(action: IngredientSourceAction): 'applied' | 'rejected' | 'undone' {
  if (action === 'apply') return 'applied';
  if (action === 'reject') return 'rejected';
  return 'undone';
}

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

  const parsed = IngredientSourceActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid request body.', details: parsed.error.flatten() });
  }
  const { action, food_object_id: explicitFoodObjectId } = parsed.data;

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const current = await getImportedMeal(personId, id);
    if (!current) return res.status(404).json({ error: 'Imported meal not found.' });

    const matches = current.ingredient_match_json ?? [];
    if (idx >= matches.length) {
      return res.status(404).json({
        error: `Ingredient index ${idx} is out of range (draft has ${matches.length} matched rows).`,
      });
    }

    const currentEntry = matches[idx];
    const verdict = classifyMatchEntry(currentEntry);
    const isExplicitSourceChoice =
      explicitFoodObjectId !== undefined && explicitFoodObjectId !== null;

    // --------------------------------------------------------------
    // Authorise the action against the current row state.
    //
    // Packet 29 — when the caller supplies an explicit `food_object_id`
    // (manual search / Find source / Replace source flow), we relax
    // the verdict gate. The guardrail and suggested-vs-applied state
    // machine govern the one-click adoption path; manual search is an
    // explicit user choice and should not be blocked by the same
    // guardrail. We still validate the target food object exists and
    // still run the full rebuild so estimates stay truthful.
    // --------------------------------------------------------------
    if (action === 'apply' && !isExplicitSourceChoice) {
      if (verdict.state === 'ineligible') {
        return res.status(409).json({
          error:
            'This suggestion is not applyable for this ingredient row. ' +
            'Try editing the ingredient name or choosing a different source.',
          detail: verdict.reason,
          state: verdict.state,
        });
      }
      if (verdict.state === 'none') {
        return res.status(409).json({
          error:
            'This ingredient row has no food-object suggestion to apply. ' +
            'Add a source by editing the ingredient name and saving.',
          detail: verdict.reason,
          state: verdict.state,
        });
      }
      if (verdict.state === 'applied') {
        return res.status(409).json({
          error: 'A source is already applied to this row. Undo first to re-apply.',
          state: verdict.state,
        });
      }
    }
    if (action === 'apply' && isExplicitSourceChoice) {
      // Manual search / Replace source: the only blocker is asking to
      // re-apply the exact same source that is already applied.
      if (
        verdict.state === 'applied' &&
        currentEntry.source_kind === 'food_object' &&
        currentEntry.source_id === explicitFoodObjectId
      ) {
        return res.status(409).json({
          error: 'That source is already applied to this row.',
          state: verdict.state,
        });
      }
    }
    if (action === 'reject' && verdict.state === 'none') {
      return res.status(409).json({
        error: 'There is nothing to reject on this row — no food-object suggestion exists.',
        state: verdict.state,
      });
    }
    if (action === 'undo' && verdict.state !== 'applied' && verdict.state !== 'rejected') {
      return res.status(409).json({
        error: 'Nothing to undo on this row — no prior user choice is recorded.',
        state: verdict.state,
      });
    }

    // --------------------------------------------------------------
    // Resolve the target source_id (for apply only).
    // --------------------------------------------------------------
    const lookup = createDefaultIngredientLookup();
    let targetSourceId: string | null = null;
    if (action === 'apply') {
      targetSourceId =
        explicitFoodObjectId ??
        (currentEntry.source_kind === 'food_object' ? currentEntry.source_id : null);
      if (!targetSourceId) {
        return res.status(409).json({
          error:
            'Cannot apply a source: the row has no food-object suggestion and no explicit food_object_id was provided.',
          state: verdict.state,
        });
      }
      // Packet 29 — when the caller provided an explicit id via the
      // Find/Replace source search flow, verify it resolves to a real
      // trusted food object before we stamp `user_choice='applied'`.
      // Without this, a deleted/stale id would leave the row with the
      // applied flag but no usable source (the matcher falls through
      // to heuristic on dangling refs).
      if (isExplicitSourceChoice) {
        const resolved = await lookup.findById(targetSourceId);
        if (!resolved) {
          return res.status(404).json({
            error: 'Selected trusted source was not found.',
            food_object_id: targetSourceId,
          });
        }
      }
    }

    // --------------------------------------------------------------
    // Build the override list passed to the matcher. We copy the
    // full prior match set and mutate only the targeted row.
    // --------------------------------------------------------------
    const appliedAt = new Date().toISOString();
    const nextMatches: IngredientMatchEntry[] = matches.map((m, i) => {
      if (i !== idx) return m;
      if (action === 'apply') {
        return {
          ...m,
          user_choice: 'applied' as const,
          applied_at: appliedAt,
          // Lock the source on the override so matchIngredient's
          // apply path picks up the caller-chosen food object even
          // when the caller overrode the current suggestion.
          source_id: targetSourceId,
        };
      }
      if (action === 'reject') {
        return {
          ...m,
          user_choice: 'rejected' as const,
          applied_at: appliedAt,
        };
      }
      // undo
      return {
        ...m,
        user_choice: null,
        applied_at: null,
      };
    });

    const draft = current.parsed_payload_json;
    if (!draft) {
      return res.status(409).json({
        error:
          'This draft has no parsed ingredient payload — row-level source actions are only available on parsed drafts.',
      });
    }

    // --------------------------------------------------------------
    // Re-derive payload / estimate / NDS with the new overrides.
    // --------------------------------------------------------------
    let rebuilt: Awaited<ReturnType<typeof rebuildDerivedFromIngredientsGrounded>>;
    try {
      rebuilt = await rebuildDerivedFromIngredientsGrounded({
        title: current.title,
        ingredients: draft.ingredients ?? [],
        servings: draft.servings ?? null,
        lookup,
        priorMatches: nextMatches,
      });
    } catch (matchErr) {
      console.warn(
        '[API ingredients/[idx]/source] grounded rebuild failed, using heuristic:',
        matchErr instanceof Error ? matchErr.message : matchErr,
      );
      rebuilt = rebuildDerivedFromIngredients({
        title: current.title,
        ingredients: draft.ingredients ?? [],
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

    // --------------------------------------------------------------
    // Record the telemetry event. Fire-and-forget; a telemetry
    // failure must not bubble into the user-facing response since
    // the state transition has already been persisted.
    // --------------------------------------------------------------
    const finalEntry = updated.ingredient_match_json?.[idx] ?? null;
    const finalVerdict = classifyMatchEntry(finalEntry);
    recordIngredientSourceEvent({
      personId,
      importedMealId: id,
      ingredientIndex: idx,
      action: actionToEventType(action),
      foodObjectId:
        action === 'apply'
          ? targetSourceId
          : action === 'undo'
            ? (currentEntry.source_kind === 'food_object' ? currentEntry.source_id : null)
            : (currentEntry.source_kind === 'food_object' ? currentEntry.source_id : null),
      entryBefore: currentEntry,
      verdictBefore: verdict,
      verdictAfter: finalVerdict,
      // Packet 29 — distinguish one-click suggestion adoption from
      // explicit manual search selection in the telemetry reason
      // trail. Same `applied` action; different `selection_mode`.
      selectionMode: isExplicitSourceChoice ? 'manual_search' : 'suggestion',
    }).catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[API ingredients/[idx]/source] telemetry insert failed (non-fatal):',
          err instanceof Error ? err.message : err,
        );
      }
    });

    return res.status(200).json({
      imported_meal: updated,
      row: {
        index: idx,
        before: { state: verdict.state, reason: verdict.reason },
        after: { state: finalVerdict.state, reason: finalVerdict.reason },
      },
    });
  } catch (err) {
    console.error('[API ingredients/[idx]/source POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ----------------------------------------------------------------
// Telemetry
// ----------------------------------------------------------------

interface RecordEventArgs {
  personId: string;
  importedMealId: string;
  ingredientIndex: number;
  action: 'applied' | 'rejected' | 'undone';
  foodObjectId: string | null;
  entryBefore: IngredientMatchEntry;
  verdictBefore: SuggestedSourceVerdict;
  verdictAfter: SuggestedSourceVerdict;
  /** Packet 29 — distinguishes suggestion adoption from manual search. */
  selectionMode?: 'suggestion' | 'manual_search';
}

async function recordIngredientSourceEvent(args: RecordEventArgs): Promise<void> {
  const reasonParts: string[] = [
    `before:${args.verdictBefore.reason}`,
    `after:${args.verdictAfter.reason}`,
  ];
  if (args.selectionMode) reasonParts.push(`mode:${args.selectionMode}`);
  const row = {
    person_id: args.personId,
    imported_meal_id: args.importedMealId,
    ingredient_index: args.ingredientIndex,
    action: args.action,
    food_object_id: args.foodObjectId,
    ingredient_raw_text: args.entryBefore.raw_text ?? null,
    ingredient_normalized_name: args.entryBefore.normalized_name ?? null,
    source_label: args.entryBefore.source_label ?? null,
    match_status: args.entryBefore.match_status ?? null,
    match_confidence: args.entryBefore.confidence ?? null,
    eligibility: args.verdictBefore.state,
    token_jaccard:
      args.verdictBefore.token_jaccard !== null &&
      Number.isFinite(args.verdictBefore.token_jaccard)
        ? Number(args.verdictBefore.token_jaccard.toFixed(4))
        : null,
    reason: reasonParts.join(' | ').slice(0, 500),
  };
  const { error } = await supabaseAdmin.from('ingredient_source_events').insert(row);
  if (error) throw new Error(error.message);
}
