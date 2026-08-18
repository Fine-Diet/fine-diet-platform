/**
 * Grocery item provenance presentation. Reads existing list/item fields only.
 * Does not fabricate source plan/range/meals for manual rows.
 */

import { formatStoredGroceryRange } from '@/lib/plans/planGroceryHandoff/policy';
import type {
  GeneratedGroceryList,
  GroceryItem,
  GroceryItemSourceType,
} from '@/lib/plans/types';

export type GroceryItemOrigin = 'manual' | 'plan_derived' | 'other';

export interface GroceryItemProvenance {
  origin: GroceryItemOrigin;
  sourceType: GroceryItemSourceType | null;
  sourcePlanId: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  plannedMealIds: string[];
  label: string;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function detailRange(item: Pick<GroceryItem, 'source_detail_json'>): {
  dateStart: string | null;
  dateEnd: string | null;
} {
  const detail = (item.source_detail_json ?? {}) as Record<string, unknown>;
  return {
    dateStart: stringField(detail.date_range_start),
    dateEnd: stringField(detail.date_range_end),
  };
}

function plannedMealIds(item: Pick<GroceryItem, 'source_planned_meal_ids'>): string[] {
  return Array.isArray(item.source_planned_meal_ids)
    ? item.source_planned_meal_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
}

function rangeLabel(dateStart: string | null, dateEnd: string | null): string | null {
  return formatStoredGroceryRange({ dateStart, dateEnd });
}

function mealCountLabel(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return `${ids.length} planned meal${ids.length === 1 ? '' : 's'}`;
}

function joinProvenance(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

/**
 * Row-persisted plan-source evidence. Page context, list.plan_id alone,
 * pricing, purchasing choice, and shopping status are not evidence.
 */
export function hasPersistedPlanRowEvidence(
  item: Pick<GroceryItem, 'source_id' | 'source_detail_json' | 'source_planned_meal_ids'>,
): boolean {
  if (plannedMealIds(item).length > 0) return true;
  if (stringField(item.source_id)) return true;
  const range = detailRange(item);
  return Boolean(range.dateStart || range.dateEnd);
}

export function resolveGroceryItemProvenance(
  item: Pick<
    GroceryItem,
    'source_type' | 'source_id' | 'source_detail_json' | 'source_planned_meal_ids'
  >,
  list: Pick<GeneratedGroceryList, 'plan_id' | 'date_range_start' | 'date_range_end'> | null,
): GroceryItemProvenance {
  const meals = plannedMealIds(item);
  const sourceType = item.source_type ?? null;

  if (sourceType === 'planned_meal') {
    const fromDetail = detailRange(item);
    const dateStart = fromDetail.dateStart ?? list?.date_range_start ?? null;
    const dateEnd = fromDetail.dateEnd ?? list?.date_range_end ?? null;
    return {
      origin: 'plan_derived',
      sourceType: 'planned_meal',
      sourcePlanId: stringField(item.source_id),
      dateStart,
      dateEnd,
      plannedMealIds: meals,
      label: joinProvenance(['From a plan', rangeLabel(dateStart, dateEnd), mealCountLabel(meals)]),
    };
  }

  // Packet 9 generateGroceryList writes plan_id on the list and meal ids on
  // rows, but omits source_type. Foundation SQL defaults source_type to
  // 'manual'. Use list identity only when the row itself also has persisted
  // plan-source evidence. list.plan_id alone is not enough.
  if (list?.plan_id && hasPersistedPlanRowEvidence(item)) {
    const dateStart = list.date_range_start ?? null;
    const dateEnd = list.date_range_end ?? null;
    return {
      origin: 'plan_derived',
      sourceType,
      sourcePlanId: list.plan_id,
      dateStart,
      dateEnd,
      plannedMealIds: meals,
      label: joinProvenance(['From your plan', rangeLabel(dateStart, dateEnd), mealCountLabel(meals)]),
    };
  }

  if (sourceType === 'manual') {
    return {
      origin: 'manual',
      sourceType: 'manual',
      sourcePlanId: null,
      dateStart: null,
      dateEnd: null,
      plannedMealIds: meals,
      label: 'Added by you',
    };
  }

  if (sourceType && sourceType !== 'system') {
    return {
      origin: 'other',
      sourceType,
      sourcePlanId: stringField(item.source_id),
      dateStart: null,
      dateEnd: null,
      plannedMealIds: meals,
      label: sourceType.replace(/_/g, ' '),
    };
  }

  if (meals.length > 0) {
    return {
      origin: 'plan_derived',
      sourceType,
      sourcePlanId: stringField(item.source_id),
      dateStart: null,
      dateEnd: null,
      plannedMealIds: meals,
      label: joinProvenance(['From planned meals', mealCountLabel(meals)]),
    };
  }

  return {
    origin: 'manual',
    sourceType,
    sourcePlanId: null,
    dateStart: null,
    dateEnd: null,
    plannedMealIds: [],
    label: 'Added by you',
  };
}
