/**
 * POST /api/journal/plans/ai/regenerate-slot
 *
 *   Body: { planned_meal_id: string, constraints?: {...} }
 *
 *   - Loads the current planned_meal.
 *   - Asks the PlansAIGateway for alternates.
 *   - Applies the locked ranking rule from lib/plans/recommendation.ts.
 *   - Returns { top, alternates } where both carry full NDSDelta.
 *
 *   This endpoint does NOT persist to planned_substitutions in Phase 2;
 *   the caller can PATCH /api/journal/plans/meals/:mealId with
 *   { ai_replacement } to accept the top result.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  buildPlanInputSnapshot,
  assertEighteenPlus,
  getPlannedMeal,
  plannedMealToAiShape,
  PlansPolicyError,
} from '@/lib/plans/planServerService';
import { getPlansAIGateway } from '@/lib/plans/aiGateway';
import {
  AiSubstitutionRequestSchema,
  type AiSubstitutionResponse,
} from '@/lib/plans/validators';
import { rankCandidates } from '@/lib/plans/recommendation';
import type { PlannedMeal } from '@/lib/plans/types';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import { supabaseAdmin } from '@/lib/supabaseServerClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }

    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as {
      planned_meal_id?: string;
      constraints?: Record<string, unknown>;
    };
    if (!body.planned_meal_id) {
      return res.status(400).json({ error: 'planned_meal_id is required' });
    }

    const existing = await getPlannedMeal(personId, body.planned_meal_id);
    if (!existing) return res.status(404).json({ error: 'Planned meal not found' });

    const snapshot = await buildPlanInputSnapshot(personId);
    try {
      assertEighteenPlus(snapshot);
    } catch (e) {
      if (e instanceof PlansPolicyError) {
        return res.status(403).json({ error: e.message, code: e.code, reason: e.reason });
      }
      throw e;
    }

    const aiReq = AiSubstitutionRequestSchema.parse({
      planned_meal_id: existing.id,
      current_meal: plannedMealToAiShape(existing),
      constraints: body.constraints,
      input_snapshot: snapshot,
    });

    const gateway = getPlansAIGateway();
    const startedAt = Date.now();

    let gatewayResult: {
      top: AiSubstitutionResponse;
      alternates: AiSubstitutionResponse[];
    };
    try {
      gatewayResult = await gateway.regenerateSlot(aiReq);
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      await writeAiRun({
        personId,
        planId: existing.plan_id,
        runType: 'substitution',
        provider: gateway.providerName,
        request_payload_json: aiReq,
        response_payload_json: null,
        status: 'failed',
        error_text: errorText,
        latency_ms: Date.now() - startedAt,
      });
      return res
        .status(502)
        .json({ error: 'AI substitution failed', detail: errorText });
    }

    // Re-rank combined set using the locked rule. The gateway already
    // pre-orders, but the canonical ranking authority is this server route.
    const allResults = [gatewayResult.top, ...gatewayResult.alternates];
    const userAllergens = snapshot.preferences.allergies ?? null;
    const target_calories = snapshot.targets.daily_calorie_goal
      ? Math.round(snapshot.targets.daily_calorie_goal / 3)
      : null;

    const ranked = rankCandidates(
      allResults.map((r) => ({
        meal: substitutionToPlannedMealShape(r, personId, existing),
        projected_meal_nds_impact_on_day: r.nds_delta.delta_nds_100_estimate ?? 0,
        target_calories,
        user_allergens: userAllergens,
      })),
    );

    const orderedResponses = ranked
      .map((s) => allResults.find((r) => r.replacement_meal.name === s.meal.name))
      .filter((r): r is AiSubstitutionResponse => Boolean(r));

    const [top, ...alternates] = orderedResponses.length > 0 ? orderedResponses : allResults;

    await writeAiRun({
      personId,
      planId: existing.plan_id,
      runType: 'substitution',
      provider: gateway.providerName,
      request_payload_json: aiReq,
      response_payload_json: { top, alternates },
      status: 'succeeded',
      error_text: null,
      latency_ms: Date.now() - startedAt,
    });

    return res.status(200).json({ top, alternates });
  } catch (err) {
    console.error('[API /journal/plans/ai/regenerate-slot] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * The ranker operates on PlannedMeal, so shape an AI substitution back
 * into the PlannedMeal contract for ranking purposes only. The caller's
 * actual persisted meal is not modified.
 */
function substitutionToPlannedMealShape(
  sub: AiSubstitutionResponse,
  personId: string,
  existing: PlannedMeal,
): PlannedMeal {
  return {
    id: `proposed:${existing.id}:${sub.replacement_meal.name}`,
    plan_id: existing.plan_id,
    plan_day_id: existing.plan_day_id,
    plan_slot_id: existing.plan_slot_id,
    person_id: personId,
    name: sub.replacement_meal.name,
    meal_type: sub.replacement_meal.meal_type,
    payload: sub.replacement_meal.payload as PlannedMeal['payload'],
    protein_score_10: sub.replacement_meal.protein_score_10,
    is_main_meal: sub.replacement_meal.is_main_meal,
    psq_multiplier: sub.replacement_meal.psq_multiplier,
    meal_derived_data: sub.replacement_meal.meal_derived_data,
    nds_confidence: sub.replacement_meal.nds_confidence,
    source_template_id: null,
    source_imported_meal_id: sub.replacement_meal.source_imported_meal_id ?? null,
    nds_version: existing.nds_version,
    classifier_version: existing.classifier_version,
    created_at: existing.created_at,
    updated_at: existing.updated_at,
  };
}

async function writeAiRun(args: {
  personId: string;
  planId: string | null;
  runType: 'substitution';
  provider: string;
  request_payload_json: unknown;
  response_payload_json: unknown;
  status: 'pending' | 'succeeded' | 'failed';
  error_text: string | null;
  latency_ms: number;
}) {
  try {
    await supabaseAdmin.from('ai_runs').insert({
      person_id: args.personId,
      plan_id: args.planId,
      run_type: args.runType,
      provider: args.provider,
      model: null,
      request_payload_json: args.request_payload_json,
      response_payload_json: args.response_payload_json,
      status: args.status,
      error_text: args.error_text,
      latency_ms: args.latency_ms,
      cost_cents: null,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    });
  } catch (e) {
    console.warn('[plans/ai_runs] insert failed (non-fatal):', e);
  }
}
