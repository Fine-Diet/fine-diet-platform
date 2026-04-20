/**
 * Plans — AI Gateway (Phase 2)
 *
 * Provider-agnostic interface for Plans AI operations. Phase 2 ships a
 * deterministic StubAIGateway only — no OpenAI / Anthropic / other SDK.
 *
 * The gateway is selected at runtime by the PLANS_AI_PROVIDER env var.
 * Values recognised:
 *   - 'stub' (default)   → StubAIGateway (this file)
 *   - anything else       → throws. Future packets may add providers.
 *
 * All gateway methods return Zod-validated payloads; invalid AI output
 * must throw, never silently reshape. Consumers are expected to wrap
 * calls in try/catch and surface errors as 502-class responses.
 */

import { computeMealDerivedFromPayload } from '@/lib/nds/mealDerived';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import type { NDSConfidence } from './types';
import {
  AiPlanGenerationRequestSchema,
  AiPlanGenerationResponseSchema,
  AiSubstitutionRequestSchema,
  AiSubstitutionResponseSchema,
  type AiPlanGenerationRequest,
  type AiPlanGenerationResponse,
  type AiSubstitutionRequest,
  type AiSubstitutionResponse,
  type AiPlannedMeal,
} from './validators';

// ============================================================================
// Interface
// ============================================================================

export interface PlansAIGateway {
  readonly providerName: string;
  generatePlan(req: AiPlanGenerationRequest): Promise<AiPlanGenerationResponse>;
  regenerateSlot(
    req: AiSubstitutionRequest,
  ): Promise<{ top: AiSubstitutionResponse; alternates: AiSubstitutionResponse[] }>;
}

// ============================================================================
// Stub: deterministic, no provider SDK
// ============================================================================

/**
 * Canonical food-item templates used by the stub. Deliberately simple,
 * deliberately provider-free. Each item has:
 *   - calories + macros so meal totals can be computed
 *   - no food_object_id → confidence will degrade to 'low' via the Plans
 *     NDS confidence rule, which matches the packet's "AI-estimated"
 *     branch of the locked Phase 2 projection-confidence rule.
 */
interface StubItem {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  added_sugar_g?: number;
}

const STUB_BREAKFASTS: StubItem[][] = [
  [
    { name: 'Steel-cut oats', calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4, fiber_g: 6 },
    { name: 'Blueberries', calories: 50, protein_g: 1, carbs_g: 12, fat_g: 0, fiber_g: 3 },
    { name: 'Walnuts', calories: 110, protein_g: 3, carbs_g: 2, fat_g: 10, fiber_g: 1 },
  ],
  [
    { name: 'Greek yogurt', calories: 180, protein_g: 20, carbs_g: 10, fat_g: 6 },
    { name: 'Raspberries', calories: 60, protein_g: 1, carbs_g: 14, fat_g: 0, fiber_g: 8 },
    { name: 'Chia seeds', calories: 70, protein_g: 2, carbs_g: 6, fat_g: 4, fiber_g: 5 },
  ],
  [
    { name: 'Scrambled eggs (2)', calories: 160, protein_g: 12, carbs_g: 1, fat_g: 12 },
    { name: 'Avocado', calories: 120, protein_g: 1, carbs_g: 6, fat_g: 11, fiber_g: 5 },
    { name: 'Whole-grain toast', calories: 120, protein_g: 5, carbs_g: 22, fat_g: 2, fiber_g: 3 },
  ],
];

const STUB_LUNCHES: StubItem[][] = [
  [
    { name: 'Grilled chicken (5oz)', calories: 240, protein_g: 42, carbs_g: 0, fat_g: 8 },
    { name: 'Quinoa', calories: 200, protein_g: 8, carbs_g: 36, fat_g: 3, fiber_g: 5 },
    { name: 'Roasted vegetables', calories: 120, protein_g: 3, carbs_g: 20, fat_g: 4, fiber_g: 6 },
  ],
  [
    { name: 'Salmon (5oz)', calories: 280, protein_g: 34, carbs_g: 0, fat_g: 16 },
    { name: 'Brown rice', calories: 220, protein_g: 5, carbs_g: 46, fat_g: 2, fiber_g: 4 },
    { name: 'Steamed broccoli', calories: 60, protein_g: 4, carbs_g: 11, fat_g: 0, fiber_g: 5 },
  ],
  [
    { name: 'Lentil soup', calories: 240, protein_g: 14, carbs_g: 36, fat_g: 4, fiber_g: 12 },
    { name: 'Mixed greens salad', calories: 90, protein_g: 2, carbs_g: 8, fat_g: 6, fiber_g: 3 },
    { name: 'Olive oil dressing', calories: 90, protein_g: 0, carbs_g: 0, fat_g: 10 },
  ],
];

const STUB_DINNERS: StubItem[][] = [
  [
    { name: 'Sirloin steak (5oz)', calories: 280, protein_g: 38, carbs_g: 0, fat_g: 14 },
    { name: 'Sweet potato', calories: 180, protein_g: 3, carbs_g: 40, fat_g: 0, fiber_g: 6 },
    { name: 'Sauteed spinach', calories: 80, protein_g: 4, carbs_g: 6, fat_g: 5, fiber_g: 4 },
  ],
  [
    { name: 'Baked cod (5oz)', calories: 200, protein_g: 34, carbs_g: 0, fat_g: 6 },
    { name: 'Farro', calories: 220, protein_g: 8, carbs_g: 44, fat_g: 2, fiber_g: 6 },
    { name: 'Roasted Brussels sprouts', calories: 120, protein_g: 5, carbs_g: 14, fat_g: 6, fiber_g: 6 },
  ],
  [
    { name: 'Tofu stir-fry', calories: 260, protein_g: 20, carbs_g: 18, fat_g: 14, fiber_g: 4 },
    { name: 'Jasmine rice', calories: 220, protein_g: 4, carbs_g: 48, fat_g: 1 },
    { name: 'Bok choy', calories: 60, protein_g: 4, carbs_g: 8, fat_g: 0, fiber_g: 3 },
  ],
];

function totalsOf(items: StubItem[]) {
  const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const it of items) {
    totals.calories += it.calories;
    totals.protein_g += it.protein_g;
    totals.carbs_g += it.carbs_g;
    totals.fat_g += it.fat_g;
  }
  return totals;
}

function buildAiPlannedMeal(
  name: string,
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other',
  items: StubItem[],
  confidence: NDSConfidence,
): AiPlannedMeal {
  const totals = totalsOf(items);
  const derived = computeMealDerivedFromPayload({
    calories: totals.calories,
    macros: { protein: totals.protein_g },
    quantity: 1,
    name,
  });

  return {
    name,
    meal_type,
    payload: {
      items: items.map((it) => ({
        name: it.name,
        calories: it.calories,
        macros: { protein: it.protein_g, carbs: it.carbs_g, fat: it.fat_g },
      })),
      totals,
    },
    source_imported_meal_id: null,
    // MealNDSShape fields (REQUIRED by validator)
    protein_score_10: derived.protein_score_10,
    is_main_meal: derived.is_main_meal,
    psq_multiplier: derived.psq_multiplier,
    meal_derived_data: derived,
    nds_confidence: confidence,
  };
}

function enumerateDates(start: string, endOrNull: string | null, shape: string): string[] {
  if (shape === 'day') return [start];
  const days: string[] = [];
  const startD = new Date(`${start}T00:00:00Z`);
  const endD = endOrNull ? new Date(`${endOrNull}T00:00:00Z`) : null;
  const count = shape === 'week' ? 7 : endD ? Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1) : 1;
  for (let i = 0; i < count; i++) {
    const d = new Date(startD.getTime() + i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Deterministic pick based on an index — keeps the stub reproducible and
 * test-friendly. Never random.
 */
function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length];
}

/**
 * Project a rough daily NDS from three stub meals using their meal-derived
 * totals. This is intentionally a "best effort" projection: because stub
 * items have no food_object_id and no nutrients, real per-day NDS math
 * (MNC, OB, PND) will be weak — so we keep projection_confidence 'low'
 * and project a conservative nds_100 derived from protein_score pacing.
 */
function stubProjectedDailyNDS(meals: AiPlannedMeal[]) {
  const ps = meals
    .filter((m) => m.is_main_meal && typeof m.protein_score_10 === 'number')
    .map((m) => m.protein_score_10 as number);
  const ps_avg = ps.length > 0 ? ps.reduce((a, b) => a + b, 0) / ps.length : 5;
  // Simple projection: blend PS with a constant wfr-ish heuristic.
  const wfr = 6; // stub items are mostly whole-food-coded
  const pnd = 4; // low plant diversity in 3 meals without fruit vegetable repetition
  const fp = 5;
  const as = 8;
  const mnc = 3; // no nutrient data → weak coverage
  const ob = 3;
  const ps_10 = Math.round(ps_avg * 100) / 100;

  // Rough weighted projection (not the real NDS formula — stub only).
  const approx =
    wfr * 0.2 +
    ps_10 * 0.2 +
    pnd * 0.12 +
    fp * 0.12 +
    as * 0.12 +
    mnc * 0.12 +
    ob * 0.12;
  const projected_nds_100 = Math.min(100, Math.max(0, Math.round(approx * 10 * 100) / 100));

  return {
    projected_nds_100,
    projected_wfr_10: wfr,
    projected_ps_10: ps_10,
    projected_pnd_10: pnd,
    projected_fp_10: fp,
    projected_as_10: as,
    projected_mnc_10: mnc,
    projected_ob_10: ob,
    projection_confidence: 'low' as NDSConfidence,
  };
}

export class StubAIGateway implements PlansAIGateway {
  readonly providerName = 'stub';

  async generatePlan(rawReq: AiPlanGenerationRequest): Promise<AiPlanGenerationResponse> {
    const req = AiPlanGenerationRequestSchema.parse(rawReq);
    const dates = enumerateDates(req.start_date, req.end_date ?? null, req.plan_shape);

    const plan_days = dates.map((date, i) => {
      const breakfast = buildAiPlannedMeal(
        'Stub breakfast',
        'breakfast',
        pick(STUB_BREAKFASTS, i),
        'low',
      );
      const lunch = buildAiPlannedMeal(
        'Stub lunch',
        'lunch',
        pick(STUB_LUNCHES, i),
        'low',
      );
      const dinner = buildAiPlannedMeal(
        'Stub dinner',
        'dinner',
        pick(STUB_DINNERS, i),
        'low',
      );
      const projected = stubProjectedDailyNDS([breakfast, lunch, dinner]);

      return {
        date_local: date,
        projected_daily_nds: {
          projected_nds_100: projected.projected_nds_100,
          projected_wfr_10: projected.projected_wfr_10,
          projected_ps_10: projected.projected_ps_10,
          projected_pnd_10: projected.projected_pnd_10,
          projected_fp_10: projected.projected_fp_10,
          projected_as_10: projected.projected_as_10,
          projected_mnc_10: projected.projected_mnc_10,
          projected_ob_10: projected.projected_ob_10,
          projection_confidence: projected.projection_confidence,
        },
        notes: null,
        slots: [
          {
            slot_block: 'morning' as const,
            slot_ordinal: 0,
            slot_label: 'Breakfast',
            target_time: '08:00',
            planned_meals: [breakfast],
          },
          {
            slot_block: 'midday' as const,
            slot_ordinal: 1,
            slot_label: 'Lunch',
            target_time: '12:30',
            planned_meals: [lunch],
          },
          {
            slot_block: 'evening' as const,
            slot_ordinal: 2,
            slot_label: 'Dinner',
            target_time: '19:00',
            planned_meals: [dinner],
          },
        ],
      };
    });

    const response: AiPlanGenerationResponse = {
      title: titleForSnapshot(req.input_snapshot, req.plan_shape),
      plan_shape: req.plan_shape,
      plan_days,
      rationale_md:
        'Stub plan. Each day surfaces a whole-food breakfast, a lean-protein lunch, ' +
        'and a plant-forward dinner so projected NDS stays above floor even without ' +
        'resolved food objects. Projection confidence is intentionally low.',
    };

    return AiPlanGenerationResponseSchema.parse(response);
  }

  async regenerateSlot(rawReq: AiSubstitutionRequest): Promise<{
    top: AiSubstitutionResponse;
    alternates: AiSubstitutionResponse[];
  }> {
    const req = AiSubstitutionRequestSchema.parse(rawReq);
    const current = req.current_meal;

    // Pick 3 alternate meal templates from the same mealType pool.
    const pool =
      current.meal_type === 'breakfast'
        ? STUB_BREAKFASTS
        : current.meal_type === 'lunch'
          ? STUB_LUNCHES
          : STUB_DINNERS;

    const proposals: AiSubstitutionResponse[] = pool.map((items, i) => {
      const replacement = buildAiPlannedMeal(
        `Alternate ${current.meal_type} #${i + 1}`,
        current.meal_type,
        items,
        'low',
      );

      const before = {
        protein_score_10: current.protein_score_10,
        is_main_meal: current.is_main_meal,
        psq_multiplier: current.psq_multiplier,
        meal_derived_data: current.meal_derived_data,
        nds_confidence: current.nds_confidence,
      };
      const after = {
        protein_score_10: replacement.protein_score_10,
        is_main_meal: replacement.is_main_meal,
        psq_multiplier: replacement.psq_multiplier,
        meal_derived_data: replacement.meal_derived_data,
        nds_confidence: replacement.nds_confidence,
      };

      const delta_ps =
        (replacement.protein_score_10 ?? 0) - (current.protein_score_10 ?? 0);
      // Rough daily-level delta estimate: PS subscore is weight 0.2, scaled *10.
      const delta_nds_100_estimate = Math.round(delta_ps * 2 * 100) / 100;

      const response: AiSubstitutionResponse = {
        replacement_meal: replacement,
        rationale_md:
          delta_ps >= 0
            ? `Raises protein score by ~${delta_ps.toFixed(1)} with similar calories.`
            : `Comparable calories; trades ~${Math.abs(delta_ps).toFixed(1)} protein points for variety.`,
        nds_delta: {
          before,
          after,
          delta_nds_100_estimate,
          delta_subscores_10: { ps_10: delta_ps },
        },
      };
      return AiSubstitutionResponseSchema.parse(response);
    });

    // Sort by estimated NDS delta (descending).
    proposals.sort(
      (a, b) =>
        (b.nds_delta.delta_nds_100_estimate ?? 0) - (a.nds_delta.delta_nds_100_estimate ?? 0),
    );
    const [top, ...alternates] = proposals;
    return { top, alternates };
  }
}

function titleForSnapshot(
  snapshot: { targets: { nds_score_100_target: number | null } },
  shape: 'day' | 'week' | 'multi_day',
): string {
  const goal = snapshot.targets.nds_score_100_target;
  const baseTitle = shape === 'day' ? 'Stub day plan' : shape === 'week' ? 'Stub week plan' : 'Stub multi-day plan';
  return goal ? `${baseTitle} — NDS ≥ ${goal}` : baseTitle;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Returns the active Plans AI gateway. Selected by PLANS_AI_PROVIDER.
 * Defaults to 'stub'. Throws on unknown providers so we never silently
 * misroute requests.
 *
 * Always imports safely on the client for types, but throws if actually
 * invoked without a valid provider. Gateway instances are intended for
 * server-only use.
 */
export function getPlansAIGateway(): PlansAIGateway {
  const provider = (process.env.PLANS_AI_PROVIDER ?? 'stub').toLowerCase();
  switch (provider) {
    case 'stub':
      return new StubAIGateway();
    default:
      throw new Error(
        `[plans/aiGateway] Unknown PLANS_AI_PROVIDER='${provider}'. Phase 2 supports 'stub' only.`,
      );
  }
}

export const PLANS_AI_NDS_VERSION_STAMP = {
  nds_version: NDS_VERSION,
  classifier_version: CLASSIFIER_VERSION,
} as const;
