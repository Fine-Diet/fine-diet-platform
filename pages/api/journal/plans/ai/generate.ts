/**
 * POST /api/journal/plans/ai/generate
 *
 * Generates a plan via the governed AI runtime (Plans Phase 16).
 *
 *   - Three-step auth (self-only write).
 *   - 18+ policy gate enforced via assertEighteenPlus on the built snapshot.
 *   - Routing is resolved through `ai_task_policies` + `ai_model_configs`
 *     for the `plan_generate` task. The feature does not hardcode a
 *     provider; the runtime decides. V1 seeds the 'stub' provider,
 *     which delegates execution to the existing PlansAIGateway.
 *   - Fallback chain: preferred config -> fallback config ->
 *     deterministic path (PlansAIGateway). ai_runs records which path
 *     actually executed and sets fallback_used accordingly.
 *   - The plan + days + slots + meals are persisted in one pass; we
 *     return the full PlanDetail so the client can render the week view
 *     immediately.
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
import { validatePlanDateRange } from '@/lib/plans/planDateRangeContract';
import { httpStatusForPlanError } from '@/lib/plans/planRequestErrors';
import { getPlansAIGateway } from '@/lib/plans/aiGateway';
import { AiPlanGenerationRequestSchema, type AiPlanGenerationResponse } from '@/lib/plans/validators';
import {
  runAITask,
  AIRuntimeError,
} from '@/lib/ai/runtime/aiRuntimeServerService';
import type { PlanShape } from '@/lib/plans/types';

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
      plan_shape?: PlanShape;
      start_date?: string;
      end_date?: string | null;
      user_prompt?: string | null;
    };

    const plan_shape: PlanShape = body.plan_shape ?? 'week';
    if (!['day', 'week', 'multi_day'].includes(plan_shape)) {
      return res.status(400).json({ error: 'plan_shape must be day, week, or multi_day.' });
    }
    const range = validatePlanDateRange({
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      plan_shape,
      allowMissingWeekEnd: true,
    });
    if (!range.ok) {
      return res.status(400).json({ error: range.error });
    }

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
      start_date: range.start_date,
      end_date: range.end_date,
      input_snapshot: snapshot,
      user_prompt: body.user_prompt ?? null,
    });

    let outcome;
    try {
      outcome = await runAITask<typeof aiReq, AiPlanGenerationResponse>({
        taskType: 'plan_generate',
        input: aiReq,
        ctx: { personId, planId: null },
        execute: async (route) => {
          // Provider-agnostic executor. In V1 the only wired provider
          // is 'stub', which runs the deterministic gateway. Future
          // providers can branch here without the route handler
          // knowing about any specific vendor SDK.
          if (route.provider_key === 'stub') {
            const gateway = getPlansAIGateway();
            return gateway.generatePlan(aiReq);
          }
          throw new Error(
            `Provider '${route.provider_key}' is not yet wired for plan_generate.`,
          );
        },
        deterministicFallback: async () => {
          // Deterministic last-resort path is the same stub gateway.
          // This is what keeps the feature functional when every
          // configured model is disabled.
          const gateway = getPlansAIGateway();
          return gateway.generatePlan(aiReq);
        },
      });
    } catch (err) {
      if (err instanceof AIRuntimeError) {
        return res.status(502).json({
          error: 'AI generation failed',
          code: err.code,
          detail: err.errors.join('; '),
        });
      }
      throw err;
    }

    const detail = await persistAiPlan({
      personId,
      ai: outcome.output,
      input_snapshot: snapshot,
      start_date: range.start_date,
      end_date: range.end_date,
    });

    // Best-effort back-link: the runtime logged ai_runs before the
    // plan existed, so we stamp the plan_id on the most recent
    // succeeded plan_generate run for this person. Failures here are
    // non-fatal — the audit row is already complete otherwise.
    try {
      const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
      const { data: recent } = await supabaseAdmin
        .from('ai_runs')
        .select('id')
        .eq('person_id', personId)
        .eq('run_type', 'plan_generate')
        .eq('status', 'succeeded')
        .is('plan_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recent?.id) {
        await supabaseAdmin
          .from('ai_runs')
          .update({ plan_id: detail.plan.id })
          .eq('id', recent.id);
      }
    } catch (e) {
      console.warn('[plans/ai_runs] plan_id back-link failed (non-fatal):', e);
    }

    return res.status(200).json(detail);
  } catch (err) {
    const status = httpStatusForPlanError(err);
    if (status) {
      return res.status(status).json({
        error: err instanceof Error ? err.message : 'Plan request failed.',
      });
    }
    console.error('[API /journal/plans/ai/generate] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
