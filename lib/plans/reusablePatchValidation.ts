/**
 * Validates PATCH payloads for reusable template authoring APIs.
 * Keeps malformed client writes from reaching snapshot persistence.
 */

import type {
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlanWeekPatternDay,
} from '@/lib/plans/types';
import {
  isValidTemplateMeal,
  isValidTemplateSlotArray,
  isValidWeekPatternDayArray,
} from '@/lib/plans/reusableSnapshotValidation';

export class ReusablePatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReusablePatchValidationError';
  }
}

/** Normalize create/update description input. Undefined and null both become null. */
export function normalizeIncomingPlanDescription(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normalize reusable plan description input. Undefined means "omit from patch". */
export function normalizePlanDescription(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ReusablePatchValidationError('description must be a string or null when provided.');
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTemplatePatchBody(body: Record<string, unknown>): {
  name?: string;
  description?: string | null;
  slots?: PlanDayTemplateSlot[];
  unassigned_meals?: PlanDayTemplateMeal[];
} {
  const patch: {
    name?: string;
    description?: string | null;
    slots?: PlanDayTemplateSlot[];
    unassigned_meals?: PlanDayTemplateMeal[];
  } = {};

  if (body.name !== undefined && typeof body.name !== 'string') {
    throw new ReusablePatchValidationError('name must be a string when provided.');
  }
  if (typeof body.name === 'string') {
    patch.name = body.name;
  }

  const description = normalizePlanDescription(body.description);
  if (description !== undefined) {
    patch.description = description;
  }

  if (body.slots !== undefined) {
    if (!isValidTemplateSlotArray(body.slots)) {
      throw new ReusablePatchValidationError('slots must be an array of valid template slot records.');
    }
    patch.slots = body.slots;
  }

  if (body.unassigned_meals !== undefined) {
    if (!Array.isArray(body.unassigned_meals) || !body.unassigned_meals.every(isValidTemplateMeal)) {
      throw new ReusablePatchValidationError(
        'unassigned_meals must be an array of valid template meal records.',
      );
    }
    patch.unassigned_meals = body.unassigned_meals;
  }

  return patch;
}

export function normalizeWeekPatternPatchBody(body: Record<string, unknown>): {
  name?: string;
  description?: string | null;
  days?: PlanWeekPatternDay[];
} {
  const patch: {
    name?: string;
    description?: string | null;
    days?: PlanWeekPatternDay[];
  } = {};

  if (body.name !== undefined && typeof body.name !== 'string') {
    throw new ReusablePatchValidationError('name must be a string when provided.');
  }
  if (typeof body.name === 'string') {
    patch.name = body.name;
  }

  const description = normalizePlanDescription(body.description);
  if (description !== undefined) {
    patch.description = description;
  }

  if (body.days !== undefined) {
    if (!isValidWeekPatternDayArray(body.days)) {
      throw new ReusablePatchValidationError('days must be an array of valid week-pattern day records.');
    }
    patch.days = body.days;
  }

  return patch;
}
