/**
 * POST /api/journal/plans/meals
 *
 * Creates a new planned_meal under an existing plan_slot. Used to
 * re-fill an empty slot after the user removed its meal — the slot
 * row persists (empty hole) and this endpoint puts a fresh meal back
 * into that specific slot position.
 *
 * Body:
 *   {
 *     plan_id: string,
 *     plan_day_id: string,
 *     plan_slot_id: string,
 *     name: string,
 *     meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other',
 *     payload: { items?: [], totals?: {}, notes_md? }
 *   }
 *
 * Derived NDS fields are computed server-side from the payload so
 * SlotCard badges and the day's projected NDS stay truthful without
 * the client having to know the scoring model.
 *
 * Auth: self-only writes.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  requireJournalAuth,
  requireCallerJournalAccess,
} from '@/lib/access/requireJournalAccess';
import {
  findExistingCanonicalSlotAttach,
  readSourceMealDocumentId,
} from '@/lib/plans/mealDocumentPlanPointer';
import {
  getPlan,
  getPlanDayByDate,
  insertPlannedMeal,
  listMealsForDay,
  recomputeMealNDSShape,
  recomputePlanDayProjection,
} from '@/lib/plans/planServerService';
import { httpStatusForPlanError } from '@/lib/plans/planRequestErrors';
import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { PlannedMealType } from '@/lib/plans/types';

const ALLOWED_MEAL_TYPES: readonly PlannedMealType[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'other',
] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const ctx = await requireJournalAuth(req, res);
    if (!ctx) return;
    if (!(await requireCallerJournalAccess(res, ctx))) return;
    const { personId } = ctx;

    const body = (req.body ?? {}) as {
      plan_id?: unknown;
      plan_day_id?: unknown;
      plan_slot_id?: unknown;
      name?: unknown;
      meal_type?: unknown;
      payload?: unknown;
      source_template_id?: unknown;
      source_imported_meal_id?: unknown;
    };

    const planId = typeof body.plan_id === 'string' ? body.plan_id : null;
    const planDayId = typeof body.plan_day_id === 'string' ? body.plan_day_id : null;
    const planSlotId = typeof body.plan_slot_id === 'string' ? body.plan_slot_id : null;
    const name = typeof body.name === 'string' && body.name.trim().length > 0
      ? body.name.trim()
      : null;
    const mealType =
      typeof body.meal_type === 'string' &&
      (ALLOWED_MEAL_TYPES as readonly string[]).includes(body.meal_type)
        ? (body.meal_type as PlannedMealType)
        : null;
    const payload =
      body.payload && typeof body.payload === 'object'
        ? (body.payload as Record<string, unknown>)
        : null;

    // Provenance columns — canonical home for the "where did this meal
    // come from?" question. Also sniffed from the payload JSON to stay
    // compatible with older clients that tuck them inside the payload.
    const sourceTemplateId =
      typeof body.source_template_id === 'string'
        ? body.source_template_id
        : payload && typeof payload.source_template_id === 'string'
          ? (payload.source_template_id as string)
          : null;
    const sourceImportedMealId =
      typeof body.source_imported_meal_id === 'string'
        ? body.source_imported_meal_id
        : payload && typeof payload.source_imported_meal_id === 'string'
          ? (payload.source_imported_meal_id as string)
          : null;

    if (!planId || !planDayId || !planSlotId) {
      return res
        .status(400)
        .json({ error: 'plan_id, plan_day_id, and plan_slot_id are required.' });
    }
    if (!mealType) {
      return res.status(400).json({ error: 'meal_type is required and must be valid.' });
    }
    if (!payload) {
      return res.status(400).json({ error: 'payload is required.' });
    }

    // Ownership checks: the plan, day, and slot must all belong to this
    // person. This prevents cross-plan writes if any ID is spoofed.
    const plan = await getPlan(personId, planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const { data: dayRow, error: dayErr } = await supabaseAdmin
      .from('plan_days')
      .select('id, plan_id, person_id, date_local')
      .eq('id', planDayId)
      .eq('person_id', personId)
      .maybeSingle();
    if (dayErr) throw new Error(`Failed to load plan_day: ${dayErr.message}`);
    if (!dayRow || dayRow.plan_id !== planId) {
      return res.status(404).json({ error: 'Plan day not found under this plan.' });
    }

    const { data: slotRow, error: slotErr } = await supabaseAdmin
      .from('plan_slots')
      .select('id, plan_day_id, person_id')
      .eq('id', planSlotId)
      .eq('person_id', personId)
      .maybeSingle();
    if (slotErr) throw new Error(`Failed to load plan_slot: ${slotErr.message}`);
    if (!slotRow || slotRow.plan_day_id !== planDayId) {
      return res.status(404).json({ error: 'Slot not found under this day.' });
    }

    // Touch getPlanDayByDate to keep the helper usage reachable for future
    // expansion (e.g., date-based slot lookup); not needed for the write.
    void getPlanDayByDate;

    const sourceMealDocumentId = readSourceMealDocumentId(payload);
    if (sourceMealDocumentId) {
      const existingMeals = await listMealsForDay(personId, planDayId);
      const existing = findExistingCanonicalSlotAttach({
        meals: existingMeals,
        planId,
        planSlotId,
        sourceMealDocumentId,
      });
      if (existing) {
        return res.status(200).json({ meal: existing, reused: true });
      }
    }

    const derived = recomputeMealNDSShape(name, payload as {
      items?: Array<{ food_object_id?: string | null; calories?: number | null }>;
      totals?: { calories?: number; protein_g?: number };
    });

    const meal = await insertPlannedMeal({
      personId,
      planId,
      planDayId,
      planSlotId,
      name,
      meal_type: mealType,
      payload,
      protein_score_10: derived.protein_score_10,
      is_main_meal: derived.is_main_meal,
      psq_multiplier: derived.psq_multiplier,
      meal_derived_data: derived.meal_derived_data as unknown as Record<string, unknown>,
      nds_confidence: derived.nds_confidence,
      source_template_id: sourceTemplateId,
      source_imported_meal_id: sourceImportedMealId,
    });

    await recomputePlanDayProjection(personId, planDayId);

    return res.status(201).json({ meal });
  } catch (err) {
    const status = httpStatusForPlanError(err);
    if (status) {
      return res.status(status).json({
        error: err instanceof Error ? err.message : 'Plan request failed.',
      });
    }
    console.error('[API /journal/plans/meals POST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
