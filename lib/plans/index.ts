/**
 * Plans — barrel exports (Phase 2).
 *
 * Re-exports types, client service, and the confidence/recommendation
 * helpers that UI components legitimately need. Server-only modules
 * (planServerService, aiGateway) are NOT re-exported here to avoid
 * accidental client bundling.
 */

export * from './types';
export { planService } from './planService';
export type {
  PlanListResponse,
  PlanDetailResponse,
  GeneratePlanRequest,
  RegenerateSlotRequest,
  RegenerateSlotResponse,
  MovePlannedMealResponse,
  CopyPlannedMealResponse,
  InstantiatePlanDayTemplateResponse,
  InstantiatePlanWeekPatternResponse,
  PlanDisplayPrefs,
  HeightDisplayUnit,
  WeightDisplayUnit,
  LivePlanSnapshotResponse,
  SourceSearchCandidate,
} from './planService';
export {
  coverageForMealItems,
  confidenceForCoverage,
  confidenceForMealItems,
  confidenceForDay,
  projectionConfidenceForPlannedMeals,
} from './ndsConfidence';
export type { MealCoverage } from './ndsConfidence';
export type { PlannedMealExecutionState } from './types';
export type { MealReadiness, MealReadinessResult } from './readinessUtils';
export { computeMealReadiness, computeReadinessMap } from './readinessUtils';
export type { GroceryItemReadModel, GroceryStillToBuyState } from './groceryReadModel';
export {
  buildGroceryItemReadModel,
  formatGroceryAmount,
  groceryPantryKey,
  normalizeGroceryDisplayUnit,
} from './groceryReadModel';
export {
  cmToIn,
  inToCm,
  kgToLb,
  lbToKg,
  splitFeetInches,
  feetInchesToTotalInches,
  trimTrailingZero,
  formatHeightForDisplay,
  formatWeightForDisplay,
} from './bodyFormat';
