/**
 * Packet 8 — repeat one canonical planned meal onto selected open occasions.
 *
 * Destinations are explicit. Packet 7 remains the only structure-ensure
 * primitive. Packet 3 remains the only planned-meal attach semantics.
 * Existing destination planned truth always wins.
 */

import { isMealSlotKey } from '@/lib/journal/mealScheduleAssignment';
import { findMealsForScheduleSlot } from '@/lib/plans/matchScheduleSlot';
import { readSourceMealDocumentId } from '@/lib/plans/mealDocumentPlanPointer';
import { isRealCalendarDateKey } from '@/lib/plans/planDateRange';
import type {
  MealSlotKey,
  PlannedMeal,
  PlanSlot,
  ResolvedScheduleSlot,
} from '@/lib/plans/types';

export const PLAN_REPEAT_POLICY_ID = 'plan-repeat.selected-open' as const;
export const PLAN_REPEAT_POLICY_VERSION = 'v1' as const;
export const PLAN_REPEAT_MAX_DESTINATIONS = 42 as const;

export type PlanRepeatDestinationStatus =
  | 'attached'
  | 'reused'
  | 'occupied_skipped'
  | 'out_of_range'
  | 'occasion_not_enabled'
  | 'invalid'
  | 'failed';

export type PlanRepeatRequestReasonCode =
  | 'invalid_request'
  | 'no_active_plan'
  | 'not_canonical_active_plan'
  | 'plan_not_found'
  | 'source_not_found'
  | 'source_not_on_plan'
  | 'source_not_canonical'
  | 'missing_usable_meal_rhythm'
  | 'repeat_write_failed';

export interface PlanRepeatDestination {
  dateLocal: string;
  slotKey: MealSlotKey;
}

export interface RepeatSelectedOpenCommand {
  planId: string;
  sourcePlannedMealId: string;
  destinations: PlanRepeatDestination[];
}

export interface PlanRepeatDestinationResult {
  dateLocal: string;
  slotKey: MealSlotKey;
  status: PlanRepeatDestinationStatus;
  planDayId: string | null;
  planSlotId: string | null;
  plannedMealId: string | null;
}

export interface RepeatSelectedOpenResult {
  planId: string;
  sourcePlannedMealId: string;
  sourceMealDocumentId: string;
  destinations: PlanRepeatDestinationResult[];
  attachedCount: number;
  reusedCount: number;
  occupiedSkippedCount: number;
  invalidCount: number;
  failedCount: number;
  partial: boolean;
}

export class PlanRepeatCommandError extends Error {
  readonly status: 400 | 404;
  readonly reasonCode: PlanRepeatRequestReasonCode;

  constructor(
    message: string,
    reasonCode: PlanRepeatRequestReasonCode,
    status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'PlanRepeatCommandError';
    this.reasonCode = reasonCode;
    this.status = status;
    Object.setPrototypeOf(this, PlanRepeatCommandError.prototype);
  }
}

export function destinationKey(dateLocal: string, slotKey: string): string {
  return `${dateLocal}:${slotKey}`;
}

export function parseRepeatSelectedOpenCommand(
  body: unknown,
): RepeatSelectedOpenCommand | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.planId !== 'string' || record.planId.trim().length === 0) return null;
  if (
    typeof record.sourcePlannedMealId !== 'string' ||
    record.sourcePlannedMealId.trim().length === 0
  ) {
    return null;
  }
  if (!Array.isArray(record.destinations) || record.destinations.length === 0) return null;
  if (record.destinations.length > PLAN_REPEAT_MAX_DESTINATIONS) return null;

  const destinations: PlanRepeatDestination[] = [];
  const seen = new Set<string>();
  for (const item of record.destinations) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const dest = item as Record<string, unknown>;
    if (!isRealCalendarDateKey(dest.dateLocal)) return null;
    if (!isMealSlotKey(dest.slotKey)) return null;
    const key = destinationKey(dest.dateLocal, dest.slotKey);
    if (seen.has(key)) continue;
    seen.add(key);
    destinations.push({ dateLocal: dest.dateLocal, slotKey: dest.slotKey });
  }
  if (destinations.length === 0) return null;

  return {
    planId: record.planId.trim(),
    sourcePlannedMealId: record.sourcePlannedMealId.trim(),
    destinations,
  };
}

export function canSelectRepeatDestination(args: {
  status: 'open' | 'planned';
  canAttach: boolean;
  canEnsure: boolean;
}): boolean {
  return args.status === 'open' && (args.canAttach || args.canEnsure);
}

export function collectOccupyingMeals(args: {
  occasion: ResolvedScheduleSlot;
  dayMeals: PlannedMeal[];
  daySlots: PlanSlot[];
  planSlotId?: string | null;
}): PlannedMeal[] {
  const matched = findMealsForScheduleSlot(args.occasion, args.dayMeals, args.daySlots);
  const onSlot = args.planSlotId
    ? args.dayMeals.filter((meal) => meal.plan_slot_id === args.planSlotId)
    : [];
  const byId = new Map<string, PlannedMeal>();
  for (const meal of [...matched, ...onSlot]) {
    byId.set(meal.id, meal);
  }
  return Array.from(byId.values());
}

/**
 * Foreign planned truth, including pointer-less rows, always occupies the
 * destination. Same canonical document is an idempotent reuse, not an overwrite.
 */
export function classifyRepeatOccupancy(args: {
  occupyingMeals: Array<Pick<PlannedMeal, 'id' | 'payload'>>;
  sourceMealDocumentId: string;
}): 'open' | 'reused' | 'occupied' {
  if (args.occupyingMeals.length === 0) return 'open';
  const sourceId = args.sourceMealDocumentId.trim();
  const hasForeign = args.occupyingMeals.some(
    (meal) => readSourceMealDocumentId(meal.payload) !== sourceId,
  );
  if (hasForeign) return 'occupied';
  return 'reused';
}

export type RepeatRaceRow = Pick<PlannedMeal, 'id' | 'created_at' | 'payload'>;

export type RepeatRaceResolution =
  | { action: 'keep_attached'; winnerMealId: string; deleteMealId: null }
  | { action: 'delete_inserted_and_reuse'; winnerMealId: string; deleteMealId: string }
  | { action: 'delete_inserted_and_skip'; winnerMealId: string; deleteMealId: string };

/**
 * First-writer-wins without a unique index. Earliest `created_at`, then
 * lowest id, is the destination winner. A concurrent insert may delete only
 * its own new row. Pre-existing rows are never deleted.
 */
export function compareRepeatRaceOrder(a: RepeatRaceRow, b: RepeatRaceRow): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function selectRepeatRaceWinner(
  occupyingMeals: readonly RepeatRaceRow[],
): RepeatRaceRow | null {
  if (occupyingMeals.length === 0) return null;
  return occupyingMeals.slice().sort(compareRepeatRaceOrder)[0] ?? null;
}

export function resolveRepeatInsertRace(args: {
  insertedMealId: string;
  occupyingMeals: readonly RepeatRaceRow[];
  sourceMealDocumentId: string;
}): RepeatRaceResolution {
  const winner =
    selectRepeatRaceWinner(args.occupyingMeals) ??
    ({
      id: args.insertedMealId,
      created_at: '',
      payload: { source_meal_document_id: args.sourceMealDocumentId },
    } satisfies RepeatRaceRow);

  if (winner.id === args.insertedMealId) {
    return { action: 'keep_attached', winnerMealId: winner.id, deleteMealId: null };
  }

  const sameDocument =
    readSourceMealDocumentId(winner.payload) === args.sourceMealDocumentId.trim();
  return {
    action: sameDocument ? 'delete_inserted_and_reuse' : 'delete_inserted_and_skip',
    winnerMealId: winner.id,
    deleteMealId: args.insertedMealId,
  };
}

/**
 * Apply independent post-insert race decisions. Each writer may delete only
 * its own insert. Used to prove two concurrent writers cannot empty the slot.
 */
export function remainingMealsAfterRepeatRaces(args: {
  occupyingMeals: RepeatRaceRow[];
  inserts: Array<{ insertedMealId: string; sourceMealDocumentId: string }>;
}): {
  remainingIds: string[];
  deletedIds: string[];
  outcomes: Array<{ insertedMealId: string; resolution: RepeatRaceResolution }>;
} {
  const outcomes = args.inserts.map((insert) => ({
    insertedMealId: insert.insertedMealId,
    resolution: resolveRepeatInsertRace({
      insertedMealId: insert.insertedMealId,
      occupyingMeals: args.occupyingMeals,
      sourceMealDocumentId: insert.sourceMealDocumentId,
    }),
  }));
  const deleted = new Set(
    outcomes
      .map((item) => item.resolution.deleteMealId)
      .filter((id): id is string => typeof id === 'string'),
  );
  const remainingIds = args.occupyingMeals
    .filter((meal) => !deleted.has(meal.id))
    .sort(compareRepeatRaceOrder)
    .map((meal) => meal.id);
  return {
    remainingIds,
    deletedIds: Array.from(deleted),
    outcomes,
  };
}

export function summarizeRepeatDestinations(
  destinations: PlanRepeatDestinationResult[],
): Pick<
  RepeatSelectedOpenResult,
  | 'attachedCount'
  | 'reusedCount'
  | 'occupiedSkippedCount'
  | 'invalidCount'
  | 'failedCount'
  | 'partial'
> {
  const attachedCount = destinations.filter((item) => item.status === 'attached').length;
  const reusedCount = destinations.filter((item) => item.status === 'reused').length;
  const occupiedSkippedCount = destinations.filter(
    (item) => item.status === 'occupied_skipped',
  ).length;
  const invalidCount = destinations.filter(
    (item) =>
      item.status === 'invalid' ||
      item.status === 'out_of_range' ||
      item.status === 'occasion_not_enabled',
  ).length;
  const failedCount = destinations.filter((item) => item.status === 'failed').length;
  const succeeded = attachedCount + reusedCount;
  const blocked = occupiedSkippedCount + invalidCount + failedCount;
  return {
    attachedCount,
    reusedCount,
    occupiedSkippedCount,
    invalidCount,
    failedCount,
    partial: succeeded > 0 && blocked > 0,
  };
}

export function formatRepeatResultCopy(result: RepeatSelectedOpenResult): string {
  const succeeded = result.attachedCount + result.reusedCount;
  const skipped = result.occupiedSkippedCount;
  const rejected = result.invalidCount + result.failedCount;
  if (succeeded > 0 && skipped === 0 && rejected === 0) {
    return succeeded === 1
      ? 'Repeated to 1 open occasion.'
      : `Repeated to ${succeeded} open occasions.`;
  }
  if (succeeded > 0 && skipped > 0 && rejected === 0) {
    return `Repeated to ${succeeded} occasion${succeeded === 1 ? '' : 's'}. Skipped ${skipped} already planned.`;
  }
  if (succeeded > 0) {
    return `Repeated to ${succeeded} occasion${succeeded === 1 ? '' : 's'}. Some selected occasions were skipped.`;
  }
  if (skipped > 0 && rejected === 0) {
    return 'Those occasions were already planned. Nothing was overwritten.';
  }
  return 'Could not repeat to those occasions.';
}
