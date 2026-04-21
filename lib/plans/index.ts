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
