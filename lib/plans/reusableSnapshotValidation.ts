/**
 * Shared structural validators for reusable planning snapshot JSON.
 * Used by PATCH payload validation before persistence.
 */

import type {
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlanWeekPatternDay,
} from '@/lib/plans/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNdsConfidence(value: unknown): value is PlanDayTemplateMeal['nds_confidence'] {
  return value === 'high' || value === 'medium' || value === 'low';
}

function isPlannedMealType(value: unknown): value is PlanDayTemplateMeal['meal_type'] {
  return (
    value === 'breakfast' ||
    value === 'lunch' ||
    value === 'dinner' ||
    value === 'snack' ||
    value === 'other'
  );
}

function isPlanSlotBlock(value: unknown): value is PlanDayTemplateSlot['slot_block'] {
  return value === null || value === 'morning' || value === 'midday' || value === 'evening';
}

export function isValidTemplateMeal(value: unknown): value is PlanDayTemplateMeal {
  if (!isRecord(value)) return false;
  return (
    typeof value.source_planned_meal_id === 'string' &&
    isNullableString(value.name) &&
    isPlannedMealType(value.meal_type) &&
    isRecord(value.payload) &&
    isNullableNumber(value.protein_score_10) &&
    typeof value.is_main_meal === 'boolean' &&
    typeof value.psq_multiplier === 'number' &&
    Number.isFinite(value.psq_multiplier) &&
    isRecord(value.meal_derived_data) &&
    isNdsConfidence(value.nds_confidence) &&
    isNullableString(value.source_template_id) &&
    isNullableString(value.source_imported_meal_id) &&
    typeof value.nds_version === 'string' &&
    typeof value.classifier_version === 'string'
  );
}

export function isValidTemplateSlot(value: unknown): value is PlanDayTemplateSlot {
  if (!isRecord(value)) return false;
  return (
    typeof value.source_plan_slot_id === 'string' &&
    typeof value.slot_ordinal === 'number' &&
    Number.isInteger(value.slot_ordinal) &&
    isPlanSlotBlock(value.slot_block) &&
    isNullableString(value.slot_label) &&
    isNullableString(value.target_time) &&
    Array.isArray(value.meals) &&
    value.meals.every(isValidTemplateMeal)
  );
}

function isValidTemplateMealArray(value: unknown): value is PlanDayTemplateMeal[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isValidTemplateMeal));
}

export function isValidWeekPatternDay(value: unknown): value is PlanWeekPatternDay {
  if (!isRecord(value)) return false;
  return (
    typeof value.day_offset === 'number' &&
    Number.isInteger(value.day_offset) &&
    typeof value.source_plan_day_id === 'string' &&
    typeof value.source_date_local === 'string' &&
    (value.source_day_template_id === undefined ||
      value.source_day_template_id === null ||
      typeof value.source_day_template_id === 'string') &&
    Array.isArray(value.slots) &&
    value.slots.every(isValidTemplateSlot) &&
    isValidTemplateMealArray(value.unassigned_meals)
  );
}

export function isValidTemplateSlotArray(value: unknown): value is PlanDayTemplateSlot[] {
  return Array.isArray(value) && value.every(isValidTemplateSlot);
}

export function isValidWeekPatternDayArray(value: unknown): value is PlanWeekPatternDay[] {
  return Array.isArray(value) && value.every(isValidWeekPatternDay);
}
