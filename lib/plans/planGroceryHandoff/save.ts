/**
 * Packet 9 client commit. Reuses the existing plan-scoped grocery generate
 * contract with regenerate held false. Never invents a second derivation path.
 */

import { planService } from '@/lib/plans/planService';
import type { GroceryActiveListContext, GeneratedGroceryList } from '@/lib/plans/types';
import { emitPlanGroceryHandoffEvent } from './emitEvent';
import {
  PLAN_GROCERY_HANDOFF_POLICY_ID,
  PLAN_GROCERY_HANDOFF_POLICY_VERSION,
  classifyGroceryGenerateOutcome,
  planGroceryHandoffHref,
  type PlanGroceryGenerateOutcome,
  type PlanGroceryHandoffReasonCode,
} from './policy';

const SAFE_ERROR = 'Could not build that grocery list. Try again.';

export interface PlanGroceryHandoffCommitResult {
  href: string;
  listId: string;
  outcome: PlanGroceryGenerateOutcome;
  selectionKind: GroceryActiveListContext['selection_kind'];
  plannedMealCount: number;
  sourceMealCount: number;
}

export async function commitPlanGroceryHandoff(args: {
  planId: string;
  dateStart: string;
  dateEnd: string;
  plannedMealCount: number;
  clamped: boolean;
  reasonCodes: PlanGroceryHandoffReasonCode[];
}): Promise<
  | { ok: true; result: PlanGroceryHandoffCommitResult }
  | { ok: false; error: string }
> {
  try {
    const generated = await planService.generateGroceryList(args.planId, {
      date: args.dateStart,
      date_end: args.dateEnd,
      regenerate: false,
    });
    const outcome = classifyGroceryGenerateOutcome(generated.list_context.selection_kind);
    const list = generated.list as GeneratedGroceryList;
    emitPlanGroceryHandoffEvent({
      event:
        outcome === 'reused' ? 'plan_grocery_existing_reused' : 'plan_grocery_generate_committed',
      policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
      policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
      path: 'primary',
      reasonCodes: [
        ...args.reasonCodes,
        outcome === 'reused' ? 'existing_list_reused' : 'generated_exact_scope',
      ],
      planId: args.planId,
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      plannedMealCount: args.plannedMealCount,
      outcome,
      clamped: args.clamped,
      listId: list.id,
      selectionKind: generated.list_context.selection_kind,
    });
    return {
      ok: true,
      result: {
        href: planGroceryHandoffHref({
          listId: list.id,
          requestedStart: args.dateStart,
          requestedEnd: args.dateEnd,
          selectionKind: generated.list_context.selection_kind,
        }),
        listId: list.id,
        outcome,
        selectionKind: generated.list_context.selection_kind,
        plannedMealCount: args.plannedMealCount,
        sourceMealCount: generated.source_meals.length,
      },
    };
  } catch {
    emitPlanGroceryHandoffEvent({
      event: 'plan_grocery_generation_failed',
      policyId: PLAN_GROCERY_HANDOFF_POLICY_ID,
      policyVersion: PLAN_GROCERY_HANDOFF_POLICY_VERSION,
      path: 'primary',
      reasonCodes: [...args.reasonCodes, 'generation_failed'],
      planId: args.planId,
      dateStart: args.dateStart,
      dateEnd: args.dateEnd,
      plannedMealCount: args.plannedMealCount,
      outcome: 'none',
      clamped: args.clamped,
      listId: null,
      selectionKind: null,
    });
    return { ok: false, error: SAFE_ERROR };
  }
}
