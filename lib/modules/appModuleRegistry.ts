/**
 * Signed-in App Module System — Code-Owned Registry
 *
 * First-pass MVP inventory for Home, Programs, Log, Plans, and Profile.
 * This is governance metadata only; app pages are not wired to this registry yet.
 */

import type {
  AppModuleDataDependency,
  AppModuleDefinition,
  AppModuleFallbackState,
  AppModuleFieldOwnership,
  AppModulePhase,
  AppModuleSurfaceInventory,
  AppModuleTriggerBand,
  AppModuleType,
  AppSurface,
} from './appModuleTypes';

const DEFAULT_FALLBACK_STATES: AppModuleFallbackState[] = ['loading', 'empty', 'ready', 'error'];

interface AppModuleInput {
  id: string;
  name: string;
  surface: AppSurface;
  type: AppModuleType;
  designTemplate: string;
  priority: number;
  contentFields?: string[];
  dataDependencies?: AppModuleDataDependency[];
  triggerRules?: AppModuleTriggerBand[];
  visibilityRules?: string[];
  personalizationRules?: string[];
  fallbackStates?: AppModuleFallbackState[];
  ctaBehavior?: string;
  analyticsEvents?: string[];
  cmsEditableFields?: string[];
  developerOwnedFields?: string[];
  fieldOwnership?: AppModuleFieldOwnership[];
  safetyNotes?: string[];
  phase?: AppModulePhase;
}

function defineAppModule(input: AppModuleInput): AppModuleDefinition {
  const cmsEditableFields = input.cmsEditableFields ?? input.contentFields ?? [];
  const developerOwnedFields = input.developerOwnedFields ?? [
    'id',
    'version',
    'surface',
    'type',
    'designTemplate',
    'dataDependencies',
    'triggerRules',
    'fallbackStates',
  ];

  return {
    ...input,
    version: 1,
    contentFields: input.contentFields ?? [],
    dataDependencies: input.dataDependencies ?? [],
    triggerRules: input.triggerRules ?? ['contextual'],
    visibilityRules: input.visibilityRules ?? [],
    personalizationRules: input.personalizationRules ?? [],
    fallbackStates: input.fallbackStates ?? DEFAULT_FALLBACK_STATES,
    ctaBehavior: input.ctaBehavior ?? 'Route to the relevant canonical /app workflow.',
    analyticsEvents: input.analyticsEvents ?? [],
    cmsEditableFields,
    developerOwnedFields,
    fieldOwnership: [
      ...cmsEditableFields.map((field) => ({ field, owner: 'cms' as const })),
      ...developerOwnedFields.map((field) => ({ field, owner: 'code' as const })),
      ...(input.dataDependencies ?? []).map((field) => ({ field, owner: 'data' as const })),
      ...(input.fieldOwnership ?? []),
    ],
    phase: input.phase ?? 'MVP',
  };
}

export const HOME_APP_MODULES: AppModuleDefinition[] = [
  defineAppModule({
    id: 'app.home.today-overview.v1',
    name: 'Morning / Today Overview',
    surface: 'home',
    type: 'time_triggered',
    designTemplate: 'app_hero_summary',
    priority: 10,
    contentFields: ['headline', 'subheadline', 'ctaLabel'],
    dataDependencies: ['journal_entries', 'active_plan', 'program_assignment', 'tracking_preferences'],
    triggerRules: ['early_morning', 'morning', 'midday', 'evening'],
    personalizationRules: ['Adapt copy and next action to time of day and active plan state.'],
    ctaBehavior: 'Route to the highest-priority next action for today.',
    analyticsEvents: ['app_home_today_overview_viewed', 'app_home_today_overview_cta_clicked'],
  }),
  defineAppModule({
    id: 'app.home.todays-plan.v1',
    name: 'Today’s Plan',
    surface: 'home',
    type: 'readiness',
    designTemplate: 'readiness_card',
    priority: 20,
    contentFields: ['emptyHeadline', 'readyHeadline', 'partialHeadline', 'ctaLabel'],
    dataDependencies: ['active_plan', 'meal_slots', 'grocery_list', 'pantry_availability'],
    triggerRules: ['morning', 'midday', 'evening', 'contextual'],
    visibilityRules: ['Show when plan exists, is missing, or has actionable readiness gaps.'],
    ctaBehavior: 'Route to /app/plans or the relevant plan day.',
    analyticsEvents: ['app_home_todays_plan_viewed', 'app_home_todays_plan_cta_clicked'],
  }),
  defineAppModule({
    id: 'app.home.nds-so-far.v1',
    name: 'Nutrition Density So Far',
    surface: 'home',
    type: 'data_summary',
    designTemplate: 'metric_card',
    priority: 30,
    contentFields: ['headline', 'emptyCopy', 'ctaLabel'],
    dataDependencies: ['journal_entries', 'nds_result'],
    triggerRules: ['midday', 'afternoon', 'evening', 'contextual'],
    ctaBehavior: 'Route to /app/log for score context or /app/log/new when empty.',
    analyticsEvents: ['app_home_nds_so_far_viewed', 'app_home_nds_so_far_cta_clicked'],
  }),
  defineAppModule({
    id: 'app.home.quick-entry-row.v1',
    name: 'Quick Entry Row',
    surface: 'home',
    type: 'action',
    designTemplate: 'quick_entry_row',
    priority: 40,
    contentFields: ['prompt', 'mealLabel', 'hydrationLabel', 'moodLabel', 'movementLabel'],
    dataDependencies: ['tracking_preferences'],
    triggerRules: ['contextual'],
    visibilityRules: ['Only show actions supported by enabled tracking preferences.'],
    ctaBehavior: 'Open /app/log/new with matching tab query params.',
    analyticsEvents: ['app_home_quick_entry_clicked'],
  }),
  defineAppModule({
    id: 'app.home.prep-pantry.v1',
    name: 'Prep & Pantry',
    surface: 'home',
    type: 'readiness',
    designTemplate: 'image_backed_card',
    priority: 50,
    contentFields: ['headline', 'body', 'ctaLabel', 'image'],
    dataDependencies: ['active_plan', 'grocery_list', 'pantry_availability'],
    triggerRules: ['afternoon', 'evening', 'weekly_planning', 'contextual'],
    ctaBehavior: 'Route to pantry/grocery readiness surfaces when available.',
    phase: 'Phase 2',
  }),
  defineAppModule({
    id: 'app.home.program-focus.v1',
    name: 'Program Focus / Default Path',
    surface: 'home',
    type: 'program',
    designTemplate: 'program_focus_card',
    priority: 60,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['program_assignment', 'program_progress'],
    triggerRules: ['morning', 'weekly_planning', 'contextual'],
    ctaBehavior: 'Route to /app/programs or active program detail.',
  }),
  defineAppModule({
    id: 'app.home.contextual-insight.v1',
    name: 'Contextual Insight',
    surface: 'home',
    type: 'data_summary',
    designTemplate: 'insight_card',
    priority: 70,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['journal_entries', 'tracking_preferences', 'assessment_status'],
    triggerRules: ['contextual'],
    visibilityRules: ['Only show when backed by a safe user-data signal.'],
    safetyNotes: ['Insight copy must avoid medical claims unless safety-reviewed.'],
    phase: 'Phase 2',
  }),
];

export const PROGRAMS_APP_MODULES: AppModuleDefinition[] = [
  defineAppModule({
    id: 'app.programs.active-program.v1',
    name: 'Active Program',
    surface: 'programs',
    type: 'program',
    designTemplate: 'program_progress_card',
    priority: 10,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['program_assignment', 'program_progress'],
    ctaBehavior: 'Route to active program detail or current step.',
  }),
  defineAppModule({
    id: 'app.programs.baseline-start.v1',
    name: 'Baseline / Fine Diet Method Starting Point',
    surface: 'programs',
    type: 'static_education',
    designTemplate: 'program_card',
    priority: 20,
    contentFields: ['headline', 'body', 'ctaLabel', 'image'],
    dataDependencies: ['program_assignment'],
    ctaBehavior: 'Route to Baseline or Fine Diet Method entry point.',
  }),
  defineAppModule({
    id: 'app.programs.assessments.v1',
    name: 'Assessments',
    surface: 'programs',
    type: 'action',
    designTemplate: 'assessment_card',
    priority: 30,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['assessment_status'],
    ctaBehavior: 'Route to the next assessment or assessment results.',
  }),
  defineAppModule({
    id: 'app.programs.library.v1',
    name: 'Program Library',
    surface: 'programs',
    type: 'program',
    designTemplate: 'program_grid',
    priority: 40,
    contentFields: ['sectionTitle', 'emptyCopy'],
    dataDependencies: ['entitlements'],
    fallbackStates: [...DEFAULT_FALLBACK_STATES, 'locked'],
    ctaBehavior: 'Route to selected program detail.',
  }),
  defineAppModule({
    id: 'app.programs.locked-future-programs.v1',
    name: 'Locked Future Programs',
    surface: 'programs',
    type: 'program',
    designTemplate: 'locked_module',
    priority: 50,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['entitlements'],
    fallbackStates: ['locked', 'ready'],
    ctaBehavior: 'Route to upgrade or waitlist when available.',
    phase: 'Phase 2',
  }),
  defineAppModule({
    id: 'app.programs.integrative-care-upgrade.v1',
    name: 'Integrative Care Upgrade',
    surface: 'programs',
    type: 'program',
    designTemplate: 'offer_card',
    priority: 60,
    contentFields: ['headline', 'body', 'ctaLabel', 'image'],
    dataDependencies: ['entitlements'],
    safetyNotes: ['Offer visibility must respect entitlements and healthcare-claim guardrails.'],
    phase: 'Phase 2',
  }),
  defineAppModule({
    id: 'app.programs.partner-placeholder.v1',
    name: 'Partner Program Placeholder',
    surface: 'programs',
    type: 'program',
    designTemplate: 'partner_program_card',
    priority: 70,
    contentFields: ['headline', 'body', 'partnerName', 'ctaLabel', 'image'],
    dataDependencies: ['entitlements'],
    phase: 'Phase 3',
  }),
];

export const LOG_APP_MODULES: AppModuleDefinition[] = [
  defineAppModule({
    id: 'app.log.nutrition-density.v1',
    name: 'Nutrition Density',
    surface: 'log',
    type: 'data_summary',
    designTemplate: 'nds_gauge',
    priority: 10,
    contentFields: ['label', 'emptyCopy'],
    dataDependencies: ['journal_entries', 'nds_result'],
    ctaBehavior: 'Route to /app/log/new when food is empty; otherwise show score context.',
  }),
  defineAppModule({
    id: 'app.log.macro-summary.v1',
    name: 'Macro Summary',
    surface: 'log',
    type: 'data_summary',
    designTemplate: 'macro_summary',
    priority: 20,
    contentFields: ['proteinLabel', 'carbsLabel', 'fatLabel'],
    dataDependencies: ['journal_entries', 'user_goals'],
    ctaBehavior: 'Route to /app/log/new?tab=food.',
  }),
  defineAppModule({
    id: 'app.log.meals.v1',
    name: 'Meals / Nutrition Entries',
    surface: 'log',
    type: 'data_summary',
    designTemplate: 'meal_blocks',
    priority: 30,
    contentFields: ['morningLabel', 'middayLabel', 'eveningLabel', 'emptyCtaLabel'],
    dataDependencies: ['journal_entries', 'nds_result'],
    ctaBehavior: 'Route to /app/log/new with date, block, and food tab.',
  }),
  defineAppModule({
    id: 'app.log.tracking-preference-cards.v1',
    name: 'Tracking Preference Cards',
    surface: 'log',
    type: 'tracking_preference',
    designTemplate: 'tracking_card_grid',
    priority: 40,
    contentFields: ['sectionTitle', 'emptyStateCopy', 'ctaLabels'],
    dataDependencies: ['journal_entries', 'tracking_preferences'],
    visibilityRules: ['Generate only from enabled tracking preferences. Disabled modules must not render.'],
    ctaBehavior: 'Route each card to /app/log/new with its matching tab.',
  }),
  defineAppModule({
    id: 'app.log.daily-summary.v1',
    name: 'Daily Summary',
    surface: 'log',
    type: 'data_summary',
    designTemplate: 'daily_summary_chips',
    priority: 50,
    contentFields: ['sectionTitle', 'chipLabels'],
    dataDependencies: ['journal_entries', 'tracking_preferences'],
    ctaBehavior: 'Route to relevant log tabs or disabled coming-soon states.',
  }),
  defineAppModule({
    id: 'app.log.quick-entry.v1',
    name: 'Quick Entry',
    surface: 'log',
    type: 'action',
    designTemplate: 'footer_quick_entry',
    priority: 60,
    contentFields: ['menuHeader', 'optionLabels'],
    dataDependencies: ['tracking_preferences'],
    ctaBehavior: 'Open the footer Quick Entry menu without route change; route after option selection.',
  }),
];

export const PLANS_APP_MODULES: AppModuleDefinition[] = [
  defineAppModule({
    id: 'app.plans.today-plan.v1',
    name: 'Today’s Plan',
    surface: 'plans',
    type: 'readiness',
    designTemplate: 'plan_today_card',
    priority: 10,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['active_plan', 'meal_slots'],
    ctaBehavior: 'Route to /app/plans/day/[date] or active plan view.',
  }),
  defineAppModule({
    id: 'app.plans.weekly-rhythm.v1',
    name: 'Weekly Rhythm',
    surface: 'plans',
    type: 'time_triggered',
    designTemplate: 'weekly_rhythm',
    priority: 20,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['active_plan', 'meal_schedule'],
    triggerRules: ['weekly_planning', 'contextual'],
    ctaBehavior: 'Route to weekly planning workflow.',
  }),
  defineAppModule({
    id: 'app.plans.meal-schedule.v1',
    name: 'Meal Schedule',
    surface: 'plans',
    type: 'data_summary',
    designTemplate: 'schedule_summary',
    priority: 30,
    contentFields: ['headline', 'emptyCopy'],
    dataDependencies: ['meal_schedule'],
    ctaBehavior: 'Route to profile meal schedule settings or plan schedule.',
  }),
  defineAppModule({
    id: 'app.plans.meal-slots.v1',
    name: 'Meal Slots',
    surface: 'plans',
    type: 'data_summary',
    designTemplate: 'meal_slot_list',
    priority: 40,
    contentFields: ['emptyCopy', 'addMealLabel'],
    dataDependencies: ['active_plan', 'meal_slots'],
    ctaBehavior: 'Route to slot editor or import workflow.',
  }),
  defineAppModule({
    id: 'app.plans.recipes-imports.v1',
    name: 'Recipes / Imports',
    surface: 'plans',
    type: 'action',
    designTemplate: 'recipe_import_card',
    priority: 50,
    contentFields: ['headline', 'body', 'ctaLabel'],
    dataDependencies: ['active_plan'],
    ctaBehavior: 'Route to /app/plans/imports/new.',
  }),
  defineAppModule({
    id: 'app.plans.grocery-list.v1',
    name: 'Grocery List',
    surface: 'plans',
    type: 'readiness',
    designTemplate: 'grocery_summary',
    priority: 60,
    contentFields: ['headline', 'emptyCopy', 'ctaLabel'],
    dataDependencies: ['active_plan', 'grocery_list'],
    ctaBehavior: 'Route to /app/plans/grocery/[planId].',
  }),
  defineAppModule({
    id: 'app.plans.pantry-readiness.v1',
    name: 'Pantry Readiness',
    surface: 'plans',
    type: 'readiness',
    designTemplate: 'pantry_readiness_card',
    priority: 70,
    contentFields: ['readyCopy', 'partialCopy', 'emptyCopy', 'ctaLabel'],
    dataDependencies: ['active_plan', 'grocery_list', 'pantry_availability'],
    ctaBehavior: 'Route to pantry readiness or grocery review.',
    phase: 'Phase 2',
  }),
];

export const PROFILE_APP_MODULES: AppModuleDefinition[] = [
  defineAppModule({
    id: 'app.profile.basics.v1',
    name: 'Profile Basics',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 10,
    contentFields: ['sectionTitle'],
    dataDependencies: ['profile_basics'],
    ctaBehavior: 'Update profile basics in place.',
  }),
  defineAppModule({
    id: 'app.profile.goals.v1',
    name: 'Goals',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 20,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['user_goals'],
    ctaBehavior: 'Update goals in place.',
  }),
  defineAppModule({
    id: 'app.profile.food-preferences.v1',
    name: 'Diet Type / Food Preferences',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 30,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['food_preferences'],
    ctaBehavior: 'Update preferences in place.',
  }),
  defineAppModule({
    id: 'app.profile.meal-schedule.v1',
    name: 'Meal Schedule',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 40,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['meal_schedule'],
    ctaBehavior: 'Update meal schedule in place.',
  }),
  defineAppModule({
    id: 'app.profile.tracking-preferences.v1',
    name: 'Tracking Preferences',
    surface: 'profile',
    type: 'tracking_preference',
    designTemplate: 'tracking_toggle_list',
    priority: 50,
    contentFields: ['sectionTitle', 'helperCopy', 'toggleLabels'],
    dataDependencies: ['tracking_preferences'],
    ctaBehavior: 'Update enabled tracking preferences.',
  }),
  defineAppModule({
    id: 'app.profile.health-context.v1',
    name: 'Health Context',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 60,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['health_context'],
    safetyNotes: ['Health context copy and storage must stay safety-reviewed.'],
  }),
  defineAppModule({
    id: 'app.profile.program-preferences.v1',
    name: 'Program Preferences',
    surface: 'profile',
    type: 'program',
    designTemplate: 'settings_card',
    priority: 70,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['program_assignment'],
    ctaBehavior: 'Route to /app/programs when program selection is needed.',
  }),
  defineAppModule({
    id: 'app.profile.notifications.v1',
    name: 'Notifications',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 80,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['notifications'],
    phase: 'Phase 2',
  }),
  defineAppModule({
    id: 'app.profile.account-billing.v1',
    name: 'Account / Billing',
    surface: 'profile',
    type: 'data_summary',
    designTemplate: 'settings_card',
    priority: 90,
    contentFields: ['sectionTitle', 'helperCopy'],
    dataDependencies: ['account_status', 'entitlements'],
    fallbackStates: [...DEFAULT_FALLBACK_STATES, 'locked'],
    ctaBehavior: 'Route to account, billing, or entitlement management.',
  }),
];

export const APP_MODULE_REGISTRY: AppModuleDefinition[] = [
  ...HOME_APP_MODULES,
  ...PROGRAMS_APP_MODULES,
  ...LOG_APP_MODULES,
  ...PLANS_APP_MODULES,
  ...PROFILE_APP_MODULES,
];

export const APP_MODULE_SURFACE_INVENTORY: AppModuleSurfaceInventory[] = [
  { surface: 'home', modules: HOME_APP_MODULES },
  { surface: 'programs', modules: PROGRAMS_APP_MODULES },
  { surface: 'log', modules: LOG_APP_MODULES },
  { surface: 'plans', modules: PLANS_APP_MODULES },
  { surface: 'profile', modules: PROFILE_APP_MODULES },
];

export function getAppModulesForSurface(surface: AppSurface): AppModuleDefinition[] {
  return APP_MODULE_REGISTRY
    .filter((module) => module.surface === surface)
    .sort((a, b) => a.priority - b.priority);
}

export function getAppModuleById(id: string): AppModuleDefinition | undefined {
  return APP_MODULE_REGISTRY.find((module) => module.id === id);
}
