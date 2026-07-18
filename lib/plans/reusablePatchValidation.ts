/**
 * Validates PATCH payloads for reusable template authoring APIs.
 * Keeps malformed client writes from reaching snapshot persistence.
 */

import type { PlanDayTemplateMeal, PlanDayTemplateSlot } from '@/lib/plans/types';

export function normalizeTemplatePatchBody(body: Record<string, unknown>): {
  name?: string;
  slots?: PlanDayTemplateSlot[];
  unassigned_meals?: PlanDayTemplateMeal[];
} {
  const patch: {
    name?: string;
    slots?: PlanDayTemplateSlot[];
    unassigned_meals?: PlanDayTemplateMeal[];
  } = {};

  if (typeof body.name === 'string') {
    patch.name = body.name;
  }
  if (Array.isArray(body.slots)) {
    patch.slots = body.slots as PlanDayTemplateSlot[];
  }
  if (Array.isArray(body.unassigned_meals)) {
    patch.unassigned_meals = body.unassigned_meals as PlanDayTemplateMeal[];
  }
  return patch;
}
