/**
 * POST /api/journal/plans/ai/generate
 *
 * Generates a plan via the active PlansAIGateway (Phase 2: StubAIGateway).
 *
 *   - Three-step auth (self-only write).
 *   - 18+ policy gate enforced via assertEighteenPlus on the built snapshot.
 *   - The plan + days + slots + meals are persisted in one pass; we return
 *     the full PlanDetail so the client can render the week view
 *     immediately.
 *   - A row is also written to ai_runs for observability. Failures here
 *     never block the 200 response.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  buildPlanInputSnapshot,
  assertEighteenPlus,
  persistAiPlan,
  PlansPolicyError,
} from '@/lib/plans/planServerService';
import { getPlansAIGateway } from '@/lib/plans/aiGateway';
import { AiPlanGenerationRequestSchema } from '@/lib/plans/validators';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';

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
      plan_shape?: 'day' | 'week' | 'multi_day';
      start_date?: string;
      end_date?: string | null;
      user_prompt?: string | null;
    };

    if (!body.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
      return res.status(400).json({ error: 'start_date (YYYY-MM-DD) is required' });
    }
    const plan_shape = body.plan_shape ?? 'week';

    const snapshot = await buildPlanInputSnapshot(personId);
    try {
      assertEighteenPlus(snapshot);
    } catch (e) {
      if (e instanceof PlansPolicyError) {
        return res.status(403).json({ error: e.message, code: e.code, reason: e.reason });
      }
      throw e;
    }

    const aiReq = AiPlanGenerationRequestSchema.parse({
      plan_shape,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      input_snapshot: snapshot,
      user_prompt: body.user_prompt ?? null,
    });

    const gateway = getPlansAIGateway();
    const startedAt = Date.now();
    let aiResponse;
    let runStatus: 'succeeded' | 'failed' = 'succeeded';
    let errorText: string | null = null;

    try {
      aiResponse = await gateway.generatePlan(aiReq);
    } catch (err) {
      runStatus = 'failed';
      errorText = err instanceof Error ? err.message : String(err);
      await writeAiRun({
        personId,
        planId: null,
        runType: 'plan_generate',
        provider: gateway.providerName,
        request_payload_json: aiReq,
        response_payload_json: null,
        status: runStatus,
        error_text: errorText,
        latency_ms: Date.now() - startedAt,
      });
      return res.status(502).json({ error: 'AI generation failed', detail: errorText });
    }

    const detail = await persistAiPlan({
      personId,
      ai: aiResponse,
      input_snapshot: snapshot,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
    });

    await writeAiRun({
      personId,
      planId: detail.plan.id,
      runType: 'plan_generate',
      provider: gateway.providerName,
      request_payload_json: aiReq,
      response_payload_json: aiResponse,
      status: runStatus,
      error_text: null,
      latency_ms: Date.now() - startedAt,
    });

    return res.status(200).json(detail);
  } catch (err) {
    console.error('[API /journal/plans/ai/generate] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function writeAiRun(args: {
  personId: string;
  planId: string | null;
  runType:
    | 'plan_generate'
    | 'plan_regenerate'
    | 'substitution'
    | 'restaurant_rec'
    | 'menu_parse'
    | 'recipe_parse'
    | 'grocery_list'
    | 'nds_optimize';
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
