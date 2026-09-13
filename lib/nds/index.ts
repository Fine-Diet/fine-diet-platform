/**
 * NDS (Nutrition Density Score) Module
 * 
 * Daily "so far today" score (0-100) composed of 7 subscores.
 */

// Types
export * from './types';

// NOVA mapping
export {
  PROCESSING_CLASS_TO_NOVA,
  NOVA_WFR_CREDIT,
  NOVA_MAPPING_VERSION,
  getEffectiveProcessingClass,
  getNOVA,
  getWFRCredit,
  getFoodWFRCredit,
  getNOVALabel,
  getProcessingClassLabel,
  getNOVAColorClass,
} from './novaMapping';

// Processing classifier
export {
  classifyProcessingLevel,
  containsProteinPowder,
  isProteinBarOrRTD,
  classifyBatch,
  PROTEIN_POWDER_KEYWORDS,
} from './processingClassifier';
export type { ClassifierInput, ClassifierOutput } from './processingClassifier';

// Tier calculations
export {
  calculatePAGAPoints,
  calculatePCCPoints,
  calculateWFRPoints,
  calculateFPPoints,
  calculateASPoints,
  calculateMNCPoints,
  calculatePNDPoints,
  calculateOBPointsFromRatio,
  calculateOBPointsFallback,
  calculateMealProteinScore,
} from './tiers';

// Plant colors (for PND)
export {
  PLANT_COLORS,
  COLOR_KEYWORDS,
  detectPlantColors,
  isLikelyPlantFood,
  countUniquePlantColors,
  getPlantColorLabel,
  getPlantColorClass,
} from './plantColors';
export type { PlantColor } from './plantColors';

// Omega sources (for OB)
export {
  FISH_KEYWORDS,
  OMEGA3_PLANT_KEYWORDS,
  containsFish,
  isOmega3PlantSource,
  detectOmegaSources,
  countOmegaSources,
} from './omegaSources';
export type { OmegaSourceType, OmegaSourceMatch } from './omegaSources';

// Meal derived computations
export {
  computeMealDerivedData,
  computeMealDerivedFromPayload,
  analyzePSQ,
} from './mealDerived';
export type { MealFoodItem, PSQAnalysis } from './mealDerived';

// Daily calculator
export {
  calculateDailyNDS,
  getEmptyNDS,
} from './dailyCalculator';
export type { 
  DailyMealData, 
  DailyFoodData, 
  DailyNDSResult,
  NDSDebugData,
} from './dailyCalculator';

// React hook (client-side)
export {
  useNDS,
  notifyNdsSourceChanged,
  resetNdsDayStore,
  getNDSColorClass,
  getNDSLabel,
  SUBSCORE_INFO,
  getSubscoreColorClass,
} from './useNDS';
export type { NDSData, NDSReadings, UseNDSOptions, UseNDSResult } from './useNDS';

// The daily response contract (safe on both client and server)
export {
  hasPrintableScore,
  isProvisional,
  dayIsVerifiedLocal,
  emptyReadings,
} from './dailyNdsState';
export type {
  DailyNdsState,
  DailyNdsStateKind,
  DailyNdsCoverage,
  DailyNdsLimitation,
  DailyNdsReadings,
  DailyNdsSubscores,
  DailyNdsVersions,
} from './dailyNdsState';
