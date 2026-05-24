/**
 * Signed-in App Module System — Type Contracts
 *
 * These types describe app-surface module inventory and governance metadata.
 * They do not power runtime rendering yet; the current goal is a code-owned
 * registry that can guide Home, Programs, Log, Plans, and Profile builds.
 */

export type AppSurface =
  | 'home'
  | 'programs'
  | 'log'
  | 'plans'
  | 'profile'
  | 'quick_entry'
  | 'pantry_grocery'
  | 'program_detail'
  | 'assessment_detail';

export type AppModuleType =
  | 'static_education'
  | 'data_summary'
  | 'action'
  | 'time_triggered'
  | 'program'
  | 'readiness'
  | 'tracking_preference';

export type AppModulePhase = 'MVP' | 'Phase 2' | 'Phase 3';

export type AppModuleFallbackState =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'error'
  | 'locked'
  | 'unavailable';

export type AppModuleTriggerBand =
  | 'early_morning'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'weekly_planning'
  | 'contextual';

export type AppModuleFieldOwner =
  | 'cms'
  | 'code'
  | 'data'
  | 'safety';

export type AppModuleDataDependency =
  | 'journal_entries'
  | 'nds_result'
  | 'today_meals'
  | 'tracking_preferences'
  | 'user_goals'
  | 'meal_schedule'
  | 'active_plan'
  | 'meal_slots'
  | 'grocery_list'
  | 'pantry_availability'
  | 'program_assignment'
  | 'program_progress'
  | 'assessment_status'
  | 'entitlements'
  | 'profile_basics'
  | 'food_preferences'
  | 'health_context'
  | 'notifications'
  | 'account_status';

export interface AppModuleFieldOwnership {
  field: string;
  owner: AppModuleFieldOwner;
  notes?: string;
}

export interface AppModuleDefinition {
  /** Stable module identifier. Prefer app.{surface}.{slug}.v{version}. */
  id: string;
  name: string;
  version: number;
  surface: AppSurface;
  type: AppModuleType;
  designTemplate: string;
  priority: number;
  contentFields: string[];
  dataDependencies: AppModuleDataDependency[];
  triggerRules: AppModuleTriggerBand[];
  visibilityRules: string[];
  personalizationRules: string[];
  fallbackStates: AppModuleFallbackState[];
  ctaBehavior: string;
  analyticsEvents: string[];
  cmsEditableFields: string[];
  developerOwnedFields: string[];
  fieldOwnership: AppModuleFieldOwnership[];
  safetyNotes?: string[];
  phase: AppModulePhase;
}

export interface AppModuleSurfaceInventory {
  surface: AppSurface;
  modules: AppModuleDefinition[];
}
