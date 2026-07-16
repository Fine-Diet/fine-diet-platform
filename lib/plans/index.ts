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
export type {
  SocialImportCreateInput,
  SocialImportDetail,
  SocialImportEvidenceSource,
  SocialImportExtraction,
  SocialImportExtractionPayload,
  SocialImportJob,
  SocialImportReviewItem,
} from './socialEvidenceImport/types';
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
  formatCanonicalFoodShoppingLabel,
  hasUserShoppingCustomization,
  resolveGroceryShoppingDisplayName,
} from './groceryShoppingDisplay';
export type {
  ConfirmSourcedGroceryPriceInput,
  GroceryHaulSummary,
  GroceryPriceObservation,
  GroceryPriceObservationSource,
  GroceryPriceProvider,
  GroceryPriceSearchInput,
  GroceryPriceSearchOffer,
  GroceryPriceSearchOutcome,
  GroceryPriceSearchQuota,
  GroceryPriceSearchResult,
  GroceryPriceSearchTier,
  SaveManualGroceryPriceInput,
} from './groceryPricingTypes';
export {
  GroceryPriceQuotaExceededClientError,
  fetchConfirmGroceryPrice,
  fetchGroceryHaulSummary,
  fetchGroceryPriceSearch,
  fetchManualGroceryPrice,
  loadGroceryPriceSearchPrefs,
  saveGroceryPriceSearchPrefs,
} from './groceryPricingClient';
export {
  formatGroceryCurrency,
  formatGroceryHaulCoverage,
  formatGroceryHaulSummaryHeadline,
  formatGroceryPriceQuotaMessage,
} from './groceryPricingFormat';
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
