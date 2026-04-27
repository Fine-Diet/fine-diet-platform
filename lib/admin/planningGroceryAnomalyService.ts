/**
 * Packet 63 — read-only planning/grocery anomaly detection.
 *
 * The service uses direct SELECTs and read-only admin services only. It does
 * not call compatibility stores, grocery generation, cleanup, or repair paths.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import {
  getPlanningLegacyCleanupDryRun,
  type LegacyCleanupClassification,
} from './planningLegacyCleanupReadinessService';

export type PlanningGroceryAnomalyCategory =
  | 'reusable_planning'
  | 'grocery_state'
  | 'active_planning'
  | 'grocery_lists'
  | 'storage_provenance'
  | 'legacy_cleanup_readiness';

export type PlanningGroceryAnomalySeverity = 'info' | 'warning' | 'high';

export interface PlanningGroceryAnomaly {
  id: string;
  person_id: string | null;
  category: PlanningGroceryAnomalyCategory;
  severity: PlanningGroceryAnomalySeverity;
  code: string;
  title: string;
  message: string;
  evidence: string[];
  related_table?: string;
  related_row_id?: string;
  suggested_operator_action?: string;
  is_mutation_required?: false;
}

export interface PlanningGroceryAnomalyPersonSummary {
  person_id: string;
  anomaly_count: number;
  by_severity: Record<PlanningGroceryAnomalySeverity, number>;
  by_category: Record<PlanningGroceryAnomalyCategory, number>;
  highest_severity: PlanningGroceryAnomalySeverity;
}

export interface PlanningGroceryAnomalyFilters {
  person_id?: string | null;
  category?: PlanningGroceryAnomalyCategory | 'all' | null;
  severity?: PlanningGroceryAnomalySeverity | 'all' | null;
  code?: string | null;
  limit?: number | null;
}

export interface PlanningGroceryAnomalyReport {
  generated_at: string;
  summary: {
    person_count: number;
    anomaly_count: number;
    by_severity: Record<PlanningGroceryAnomalySeverity, number>;
    by_category: Record<PlanningGroceryAnomalyCategory, number>;
    by_code: Record<string, number>;
    notes: string[];
  };
  persons: PlanningGroceryAnomalyPersonSummary[];
  anomalies: PlanningGroceryAnomaly[];
  filters_applied: {
    person_id: string | null;
    category: PlanningGroceryAnomalyCategory | 'all';
    severity: PlanningGroceryAnomalySeverity | 'all';
    code: string | null;
    limit: number;
  };
}

interface BaseStorageRow {
  id: string;
  person_id: string | null;
  storage_source: string | null;
  legacy_metadata_backfilled_at: string | null;
}

interface DayTemplateRow extends BaseStorageRow {
  slots_json: unknown;
  unassigned_meals_json: unknown;
}

interface WeekPatternRow extends BaseStorageRow {
  days_json: unknown;
}

interface PantryRow extends BaseStorageRow {
  key: string | null;
  food_object_id: string | null;
  quantity: number | string | null;
  unit: string | null;
}

interface ResolutionRow extends BaseStorageRow {
  key: string | null;
  food_object_id: string | null;
}

interface PlannedMealRow {
  id: string;
  person_id: string | null;
  name: string | null;
  payload: unknown;
  source_imported_meal_id: string | null;
  reusable_provenance: unknown;
  execution_state: 'pending' | 'eaten' | 'skipped' | null;
  journal_entry_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface GroceryListRow {
  id: string;
  person_id: string | null;
  title: string | null;
  status: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface GroceryItemRow {
  id: string;
  grocery_list_id: string;
  person_id: string | null;
  name: string | null;
  quantity: number | string | null;
  unit: string | null;
  food_object_id: string | null;
  source_planned_meal_ids: string[] | null;
  status: string | null;
  notes: string | null;
}

interface AnomalySourceRows {
  dayTemplates: DayTemplateRow[];
  weekPatterns: WeekPatternRow[];
  pantryItems: PantryRow[];
  resolutions: ResolutionRow[];
  plannedMeals: PlannedMealRow[];
  groceryLists: GroceryListRow[];
  groceryItems: GroceryItemRow[];
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const CATEGORIES: PlanningGroceryAnomalyCategory[] = [
  'reusable_planning',
  'grocery_state',
  'active_planning',
  'grocery_lists',
  'storage_provenance',
  'legacy_cleanup_readiness',
];

const SEVERITIES: PlanningGroceryAnomalySeverity[] = ['info', 'warning', 'high'];

function normalizeLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

function emptySeverityCounts(): Record<PlanningGroceryAnomalySeverity, number> {
  return { info: 0, warning: 0, high: 0 };
}

function emptyCategoryCounts(): Record<PlanningGroceryAnomalyCategory, number> {
  return {
    reusable_planning: 0,
    grocery_state: 0,
    active_planning: 0,
    grocery_lists: 0,
    storage_provenance: 0,
    legacy_cleanup_readiness: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function normalizeNumber(value: number | string | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function makeId(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? 'none').replace(/[^a-zA-Z0-9_-]/g, '-'))
    .join(':');
}

function addAnomaly(
  anomalies: PlanningGroceryAnomaly[],
  anomaly: Omit<PlanningGroceryAnomaly, 'id' | 'is_mutation_required'>,
): void {
  anomalies.push({
    ...anomaly,
    id: makeId([
      anomaly.category,
      anomaly.code,
      anomaly.person_id,
      anomaly.related_table,
      anomaly.related_row_id,
    ]),
    is_mutation_required: false,
  });
}

function countTemplateMeals(slotsJson: unknown, unassignedMealsJson: unknown): {
  slots: number;
  meals: number;
  unassignedMeals: number;
} {
  const slots = arrayOfRecords(slotsJson);
  const meals = slots.reduce((sum, slot) => {
    return sum + (Array.isArray(slot.meals) ? slot.meals.length : 0);
  }, 0);
  const unassignedMeals = Array.isArray(unassignedMealsJson) ? unassignedMealsJson.length : 0;
  return { slots: slots.length, meals, unassignedMeals };
}

function countWeekPattern(daysJson: unknown): {
  days: number;
  slots: number;
  meals: number;
  unassignedMeals: number;
} {
  const days = arrayOfRecords(daysJson);
  let slots = 0;
  let meals = 0;
  let unassignedMeals = 0;
  for (const day of days) {
    const daySlots = arrayOfRecords(day.slots);
    slots += daySlots.length;
    for (const slot of daySlots) {
      meals += Array.isArray(slot.meals) ? slot.meals.length : 0;
    }
    unassignedMeals += Array.isArray(day.unassigned_meals) ? day.unassigned_meals.length : 0;
  }
  return { days: days.length, slots, meals, unassignedMeals };
}

function storageSourceKnown(value: string | null): boolean {
  return value === 'table_direct' || value === 'legacy_metadata';
}

async function selectRows<T>(label: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${label}: ${message}`);
  }
  return (data ?? []) as T[];
}

async function fetchSourceRows(personId: string | null): Promise<AnomalySourceRows> {
  let dayTemplateQuery = supabaseAdmin
    .from('reusable_plan_day_templates')
    .select('id, person_id, slots_json, unassigned_meals_json, storage_source, legacy_metadata_backfilled_at');
  let weekPatternQuery = supabaseAdmin
    .from('reusable_plan_week_patterns')
    .select('id, person_id, days_json, storage_source, legacy_metadata_backfilled_at');
  let pantryQuery = supabaseAdmin
    .from('pantry_on_hand_items')
    .select('id, person_id, key, food_object_id, quantity, unit, storage_source, legacy_metadata_backfilled_at');
  let resolutionQuery = supabaseAdmin
    .from('grocery_ingredient_resolutions')
    .select('id, person_id, key, food_object_id, storage_source, legacy_metadata_backfilled_at');
  let plannedMealQuery = supabaseAdmin
    .from('planned_meals')
    .select('id, person_id, name, payload, source_imported_meal_id, reusable_provenance, execution_state, journal_entry_id, created_at, updated_at');
  let groceryListQuery = supabaseAdmin
    .from('generated_grocery_lists')
    .select('id, person_id, title, status, date_range_start, date_range_end, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  let groceryItemQuery = supabaseAdmin
    .from('grocery_items')
    .select('id, grocery_list_id, person_id, name, quantity, unit, food_object_id, source_planned_meal_ids, status, notes')
    .limit(1000);

  if (personId) {
    dayTemplateQuery = dayTemplateQuery.eq('person_id', personId);
    weekPatternQuery = weekPatternQuery.eq('person_id', personId);
    pantryQuery = pantryQuery.eq('person_id', personId);
    resolutionQuery = resolutionQuery.eq('person_id', personId);
    plannedMealQuery = plannedMealQuery.eq('person_id', personId);
    groceryListQuery = groceryListQuery.eq('person_id', personId);
    groceryItemQuery = groceryItemQuery.eq('person_id', personId);
  }

  const [
    dayTemplates,
    weekPatterns,
    pantryItems,
    resolutions,
    plannedMeals,
    groceryLists,
    groceryItems,
  ] = await Promise.all([
    selectRows<DayTemplateRow>('reusable_plan_day_templates', dayTemplateQuery),
    selectRows<WeekPatternRow>('reusable_plan_week_patterns', weekPatternQuery),
    selectRows<PantryRow>('pantry_on_hand_items', pantryQuery),
    selectRows<ResolutionRow>('grocery_ingredient_resolutions', resolutionQuery),
    selectRows<PlannedMealRow>('planned_meals', plannedMealQuery),
    selectRows<GroceryListRow>('generated_grocery_lists', groceryListQuery),
    selectRows<GroceryItemRow>('grocery_items', groceryItemQuery),
  ]);

  return {
    dayTemplates,
    weekPatterns,
    pantryItems,
    resolutions,
    plannedMeals,
    groceryLists,
    groceryItems,
  };
}

function detectStorageProvenance(
  anomalies: PlanningGroceryAnomaly[],
  row: BaseStorageRow,
  table: string,
): void {
  if (!row.person_id) {
    addAnomaly(anomalies, {
      person_id: null,
      category: 'storage_provenance',
      severity: 'high',
      code: 'missing_person_id',
      title: 'Migrated row is missing person_id',
      message: `${table} row has no person_id.`,
      evidence: [`row_id=${row.id}`],
      related_table: table,
      related_row_id: row.id,
      suggested_operator_action: 'Review row ownership before any support decision.',
    });
  }

  if (!storageSourceKnown(row.storage_source)) {
    addAnomaly(anomalies, {
      person_id: row.person_id,
      category: 'storage_provenance',
      severity: 'warning',
      code: 'unknown_storage_source',
      title: 'Migrated row has unknown storage source',
      message: `${table} row has storage_source ${row.storage_source ?? 'null'}.`,
      evidence: [`row_id=${row.id}`, `storage_source=${row.storage_source ?? 'null'}`],
      related_table: table,
      related_row_id: row.id,
      suggested_operator_action: 'Review storage provenance before relying on migration posture.',
    });
  }

  if (row.storage_source === 'legacy_metadata' && !row.legacy_metadata_backfilled_at) {
    addAnomaly(anomalies, {
      person_id: row.person_id,
      category: 'storage_provenance',
      severity: 'warning',
      code: 'legacy_source_without_backfilled_at',
      title: 'Legacy-backfilled row lacks backfill timestamp',
      message: `${table} row is legacy_metadata without legacy_metadata_backfilled_at.`,
      evidence: [`row_id=${row.id}`, 'storage_source=legacy_metadata'],
      related_table: table,
      related_row_id: row.id,
      suggested_operator_action: 'Review migration history for this row.',
    });
  }

  if (row.storage_source === 'table_direct' && row.legacy_metadata_backfilled_at) {
    addAnomaly(anomalies, {
      person_id: row.person_id,
      category: 'storage_provenance',
      severity: 'info',
      code: 'table_direct_with_backfilled_at',
      title: 'Table-direct row has legacy backfill timestamp',
      message: `${table} row is table_direct but has legacy_metadata_backfilled_at.`,
      evidence: [`row_id=${row.id}`, `legacy_metadata_backfilled_at=${row.legacy_metadata_backfilled_at}`],
      related_table: table,
      related_row_id: row.id,
      suggested_operator_action: 'Review provenance fields if cleanup-readiness depends on origin.',
    });
  }
}

function detectReusableAnomalies(rows: AnomalySourceRows): PlanningGroceryAnomaly[] {
  const anomalies: PlanningGroceryAnomaly[] = [];

  for (const row of rows.dayTemplates) {
    detectStorageProvenance(anomalies, row, 'reusable_plan_day_templates');
    const counts = countTemplateMeals(row.slots_json, row.unassigned_meals_json);
    if (counts.meals === 0 && counts.unassignedMeals === 0) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'reusable_planning',
        severity: 'warning',
        code: 'reusable_template_empty',
        title: 'Reusable day template has no meal snapshots',
        message: 'Day template contains zero slotted meals and zero unassigned meals.',
        evidence: [`slots=${counts.slots}`, `meals=${counts.meals}`, `unassigned_meals=${counts.unassignedMeals}`],
        related_table: 'reusable_plan_day_templates',
        related_row_id: row.id,
        suggested_operator_action: 'Review whether this template is intentional before recommending reuse.',
      });
    }
    if (counts.slots === 0 && counts.meals > 0) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'reusable_planning',
        severity: 'warning',
        code: 'reusable_snapshot_missing_slots',
        title: 'Reusable template snapshot has meals without usable slots',
        message: 'Template appears to include meal snapshots but no usable slot array.',
        evidence: [`slots=${counts.slots}`, `meals=${counts.meals}`],
        related_table: 'reusable_plan_day_templates',
        related_row_id: row.id,
        suggested_operator_action: 'Review template snapshot shape.',
      });
    }
  }

  for (const row of rows.weekPatterns) {
    detectStorageProvenance(anomalies, row, 'reusable_plan_week_patterns');
    const counts = countWeekPattern(row.days_json);
    if (counts.days === 0 || counts.meals + counts.unassignedMeals === 0) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'reusable_planning',
        severity: 'warning',
        code: 'reusable_week_pattern_empty',
        title: 'Reusable week pattern has no meal snapshots',
        message: 'Week pattern has zero days or no meal snapshots.',
        evidence: [
          `days=${counts.days}`,
          `slots=${counts.slots}`,
          `meals=${counts.meals}`,
          `unassigned_meals=${counts.unassignedMeals}`,
        ],
        related_table: 'reusable_plan_week_patterns',
        related_row_id: row.id,
        suggested_operator_action: 'Review whether this pattern is intentional before recommending reuse.',
      });
    }
  }

  return anomalies;
}

function detectGroceryStateAnomalies(rows: AnomalySourceRows): PlanningGroceryAnomaly[] {
  const anomalies: PlanningGroceryAnomaly[] = [];

  for (const row of rows.pantryItems) {
    detectStorageProvenance(anomalies, row, 'pantry_on_hand_items');
    const quantity = normalizeNumber(row.quantity);
    if (quantity != null && quantity < 0) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'grocery_state',
        severity: 'warning',
        code: 'pantry_negative_quantity',
        title: 'Pantry item has negative quantity',
        message: 'Conservative pantry deduction should not rely on negative on-hand quantities.',
        evidence: [`key=${row.key ?? '-'}`, `quantity=${row.quantity}`],
        related_table: 'pantry_on_hand_items',
        related_row_id: row.id,
        suggested_operator_action: 'Review pantry row before using it in support guidance.',
      });
    }
    if (!row.food_object_id) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'grocery_state',
        severity: 'warning',
        code: 'pantry_missing_food_object',
        title: 'Pantry item is missing linked food object',
        message: 'Pantry row cannot be confidently matched to grocery demand without food_object_id.',
        evidence: [`key=${row.key ?? '-'}`],
        related_table: 'pantry_on_hand_items',
        related_row_id: row.id,
        suggested_operator_action: 'Review pantry row identity.',
      });
    }
    if (!row.unit) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'grocery_state',
        severity: 'info',
        code: 'pantry_missing_unit',
        title: 'Pantry item has no unit',
        message: 'Rows without units may need review before conservative deduction.',
        evidence: [`key=${row.key ?? '-'}`, `quantity=${row.quantity ?? 'null'}`],
        related_table: 'pantry_on_hand_items',
        related_row_id: row.id,
        suggested_operator_action: 'Review unit compatibility if this item affects support guidance.',
      });
    }
  }

  for (const row of rows.resolutions) {
    detectStorageProvenance(anomalies, row, 'grocery_ingredient_resolutions');
    if (!row.key) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'grocery_state',
        severity: 'warning',
        code: 'resolution_missing_key',
        title: 'Ingredient resolution is missing key',
        message: 'Resolution row cannot be reliably reused without a key.',
        evidence: [`row_id=${row.id}`],
        related_table: 'grocery_ingredient_resolutions',
        related_row_id: row.id,
        suggested_operator_action: 'Review resolution identity.',
      });
    }
    if (!row.food_object_id) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'grocery_state',
        severity: 'warning',
        code: 'resolution_missing_food_object',
        title: 'Ingredient resolution is missing linked food object',
        message: 'Resolution row cannot ground grocery demand without food_object_id.',
        evidence: [`key=${row.key ?? '-'}`],
        related_table: 'grocery_ingredient_resolutions',
        related_row_id: row.id,
        suggested_operator_action: 'Review resolution mapping.',
      });
    }
  }

  return anomalies;
}

function detectPlannedMealAnomalies(rows: AnomalySourceRows): PlanningGroceryAnomaly[] {
  const anomalies: PlanningGroceryAnomaly[] = [];
  for (const row of rows.plannedMeals) {
    if (!row.execution_state) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'active_planning',
        severity: 'warning',
        code: 'planned_meal_missing_execution_state',
        title: 'Planned meal is missing execution state',
        message: 'Execution-aware demand expects pending/eaten/skipped.',
        evidence: [`planned_meal_id=${row.id}`],
        related_table: 'planned_meals',
        related_row_id: row.id,
        suggested_operator_action: 'Review execution-state migration posture.',
      });
    }
    if (row.execution_state === 'eaten' && !row.journal_entry_id) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'active_planning',
        severity: 'warning',
        code: 'planned_meal_eaten_without_journal_entry',
        title: 'Eaten planned meal has no journal entry link',
        message: 'Eaten meals are expected to link to a journal entry; skipped meals are not flagged by this rule.',
        evidence: [`planned_meal_id=${row.id}`, 'execution_state=eaten', 'journal_entry_id=null'],
        related_table: 'planned_meals',
        related_row_id: row.id,
        suggested_operator_action: 'Review journal linkage for this eaten planned meal.',
      });
    }
    if (row.reusable_provenance != null && !isRecord(row.reusable_provenance)) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'active_planning',
        severity: 'warning',
        code: 'planned_meal_reusable_provenance_unparseable',
        title: 'Reusable provenance is not parseable',
        message: 'Reusable provenance exists but is not an object.',
        evidence: [`planned_meal_id=${row.id}`, `type=${typeof row.reusable_provenance}`],
        related_table: 'planned_meals',
        related_row_id: row.id,
        suggested_operator_action: 'Review reusable provenance JSON shape.',
      });
    }
    if (row.source_imported_meal_id && row.reusable_provenance != null) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'active_planning',
        severity: 'info',
        code: 'planned_meal_import_and_reusable_provenance_present',
        title: 'Planned meal has import ancestry and reusable provenance',
        message: 'This can be valid: imported ancestry and reusable instantiation provenance are distinct. It is surfaced for operator context.',
        evidence: [`source_imported_meal_id=${row.source_imported_meal_id}`, 'reusable_provenance=present'],
        related_table: 'planned_meals',
        related_row_id: row.id,
        suggested_operator_action: 'Use both fields separately when explaining provenance.',
      });
    }
    if (!isRecord(row.payload) || Object.keys(row.payload).length === 0) {
      addAnomaly(anomalies, {
        person_id: row.person_id,
        category: 'active_planning',
        severity: 'warning',
        code: 'planned_meal_missing_payload',
        title: 'Planned meal has empty or missing payload',
        message: 'Meal payload is expected to carry the meal/item snapshot for plan truth.',
        evidence: [`planned_meal_id=${row.id}`],
        related_table: 'planned_meals',
        related_row_id: row.id,
        suggested_operator_action: 'Review plan meal payload before relying on support interpretation.',
      });
    }
  }
  return anomalies;
}

function detectGroceryListAnomalies(rows: AnomalySourceRows): PlanningGroceryAnomaly[] {
  const anomalies: PlanningGroceryAnomaly[] = [];
  const plannedMealById = new Map(rows.plannedMeals.map((meal) => [meal.id, meal]));

  for (const item of rows.groceryItems) {
    const quantity = normalizeNumber(item.quantity);
    if (quantity != null && quantity < 0) {
      addAnomaly(anomalies, {
        person_id: item.person_id,
        category: 'grocery_lists',
        severity: 'warning',
        code: 'grocery_item_negative_quantity',
        title: 'Grocery item has negative quantity',
        message: 'Required grocery quantities should not be negative.',
        evidence: [`grocery_item_id=${item.id}`, `quantity=${item.quantity}`],
        related_table: 'grocery_items',
        related_row_id: item.id,
        suggested_operator_action: 'Review generated grocery item quantity.',
      });
    }
    if (quantity != null && quantity > 0 && !item.unit) {
      addAnomaly(anomalies, {
        person_id: item.person_id,
        category: 'grocery_lists',
        severity: 'info',
        code: 'grocery_item_missing_unit_with_quantity',
        title: 'Grocery item has quantity without unit',
        message: 'Quantity without unit may need operator review before shopping guidance.',
        evidence: [`grocery_item_id=${item.id}`, `quantity=${item.quantity}`],
        related_table: 'grocery_items',
        related_row_id: item.id,
        suggested_operator_action: 'Review item unit before interpreting required amount.',
      });
    }
    if (!item.food_object_id) {
      addAnomaly(anomalies, {
        person_id: item.person_id,
        category: 'grocery_lists',
        severity: 'info',
        code: 'grocery_item_unresolved_with_on_hand_attempt_impossible',
        title: 'Grocery item is unresolved',
        message: 'Unresolved rows intentionally block pantry deduction; this is informational support context.',
        evidence: [`grocery_item_id=${item.id}`, `name=${item.name ?? '-'}`],
        related_table: 'grocery_items',
        related_row_id: item.id,
        suggested_operator_action: 'Resolve ingredient identity before expecting pantry deduction.',
      });
    }
    if (item.quantity == null) {
      addAnomaly(anomalies, {
        person_id: item.person_id,
        category: 'grocery_lists',
        severity: 'info',
        code: 'grocery_item_required_amount_review',
        title: 'Grocery item required amount needs review',
        message: 'The grocery item has no numeric quantity, so required amount may need review.',
        evidence: [`grocery_item_id=${item.id}`, `unit=${item.unit ?? 'null'}`],
        related_table: 'grocery_items',
        related_row_id: item.id,
        suggested_operator_action: 'Review source ingredient amount before interpreting shopping demand.',
      });
    }

    const sourceIds = item.source_planned_meal_ids ?? [];
    const missingSourceIds = sourceIds.filter((id) => !plannedMealById.has(id));
    if (missingSourceIds.length > 0) {
      addAnomaly(anomalies, {
        person_id: item.person_id,
        category: 'grocery_lists',
        severity: 'warning',
        code: 'grocery_item_source_meal_missing',
        title: 'Grocery item references missing planned meal',
        message: 'A grocery item source planned meal id was not found.',
        evidence: [`grocery_item_id=${item.id}`, `missing_source_ids=${missingSourceIds.join(',')}`],
        related_table: 'grocery_items',
        related_row_id: item.id,
        suggested_operator_action: 'Review grocery list provenance before explaining demand.',
      });
    }

    const sourceMeals = sourceIds
      .map((id) => plannedMealById.get(id))
      .filter((meal): meal is PlannedMealRow => !!meal);
    if (
      sourceMeals.length > 0 &&
      sourceMeals.every((meal) => (meal.execution_state ?? 'pending') !== 'pending')
    ) {
      addAnomaly(anomalies, {
        person_id: item.person_id,
        category: 'grocery_lists',
        severity: 'info',
        code: 'grocery_item_stale_handled_source',
        title: 'Grocery item references only handled planned meals',
        message: 'Execution-aware grocery demand should not actively count eaten/skipped meals; this row may represent an older generated list.',
        evidence: [
          `grocery_item_id=${item.id}`,
          `source_count=${sourceMeals.length}`,
          `source_states=${sourceMeals.map((meal) => meal.execution_state ?? 'pending').join(',')}`,
        ],
        related_table: 'grocery_items',
        related_row_id: item.id,
        suggested_operator_action: 'Review whether this grocery list is stale before treating it as active demand.',
      });
    }
  }

  return anomalies;
}

async function detectLegacyCleanupAnomalies(personId: string | null): Promise<PlanningGroceryAnomaly[]> {
  const dryRun = await getPlanningLegacyCleanupDryRun({ person_id: personId, limit: MAX_LIMIT });
  const anomalies: PlanningGroceryAnomaly[] = [];
  const codeByClassification: Partial<Record<LegacyCleanupClassification, string>> = {
    review_required: 'legacy_metadata_review_required',
    unmatched_legacy: 'legacy_metadata_unmatched',
    malformed_legacy: 'legacy_metadata_malformed',
    table_conflict: 'legacy_metadata_table_conflict',
  };

  for (const record of dryRun.records) {
    if (record.classification === 'cleanup_candidate') continue;
    const code = codeByClassification[record.classification];
    if (!code) continue;
    addAnomaly(anomalies, {
      person_id: record.person_id,
      category: 'legacy_cleanup_readiness',
      severity: record.classification === 'table_conflict' ? 'high' : 'warning',
      code,
      title: 'Legacy metadata dry-run record needs review',
      message: `Legacy cleanup dry-run classified ${record.metadata_key} record as ${record.classification}.`,
      evidence: [
        `metadata_key=${record.metadata_key}`,
        `legacy_identifier=${record.legacy_identifier ?? 'null'}`,
        ...record.evidence,
      ],
      related_table: record.matching_table ?? undefined,
      related_row_id: record.matching_table_row_id ?? undefined,
      suggested_operator_action: 'Review cleanup-readiness dry-run before any future policy decision.',
    });
  }

  return anomalies;
}

function filterAnomalies(
  anomalies: PlanningGroceryAnomaly[],
  filters: Required<Omit<PlanningGroceryAnomalyFilters, 'limit'>> & { limit: number },
): PlanningGroceryAnomaly[] {
  return anomalies
    .filter((anomaly) => !filters.person_id || anomaly.person_id === filters.person_id)
    .filter((anomaly) => filters.category === 'all' || anomaly.category === filters.category)
    .filter((anomaly) => filters.severity === 'all' || anomaly.severity === filters.severity)
    .filter((anomaly) => !filters.code || anomaly.code === filters.code)
    .slice(0, filters.limit);
}

function buildPersonSummaries(
  anomalies: PlanningGroceryAnomaly[],
): PlanningGroceryAnomalyPersonSummary[] {
  const byPerson = new Map<string, PlanningGroceryAnomalyPersonSummary>();
  for (const anomaly of anomalies) {
    if (!anomaly.person_id) continue;
    const current =
      byPerson.get(anomaly.person_id) ??
      ({
        person_id: anomaly.person_id,
        anomaly_count: 0,
        by_severity: emptySeverityCounts(),
        by_category: emptyCategoryCounts(),
        highest_severity: 'info',
      } satisfies PlanningGroceryAnomalyPersonSummary);
    current.anomaly_count += 1;
    current.by_severity[anomaly.severity] += 1;
    current.by_category[anomaly.category] += 1;
    if (anomaly.severity === 'high') current.highest_severity = 'high';
    if (anomaly.severity === 'warning' && current.highest_severity === 'info') {
      current.highest_severity = 'warning';
    }
    byPerson.set(anomaly.person_id, current);
  }

  return Array.from(byPerson.values()).sort((a, b) => {
    const severityRank = { high: 3, warning: 2, info: 1 };
    const rankDelta = severityRank[b.highest_severity] - severityRank[a.highest_severity];
    if (rankDelta !== 0) return rankDelta;
    if (b.anomaly_count !== a.anomaly_count) return b.anomaly_count - a.anomaly_count;
    return a.person_id.localeCompare(b.person_id);
  });
}

function countByCode(anomalies: PlanningGroceryAnomaly[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const anomaly of anomalies) {
    counts[anomaly.code] = (counts[anomaly.code] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

export async function getPlanningGroceryAnomalies(
  filters: PlanningGroceryAnomalyFilters = {},
): Promise<PlanningGroceryAnomalyReport> {
  const normalizedFilters = {
    person_id: filters.person_id?.trim() || null,
    category: filters.category ?? 'all',
    severity: filters.severity ?? 'all',
    code: filters.code?.trim() || null,
    limit: normalizeLimit(filters.limit),
  };

  const rows = await fetchSourceRows(normalizedFilters.person_id);
  const allAnomalies = [
    ...detectReusableAnomalies(rows),
    ...detectGroceryStateAnomalies(rows),
    ...detectPlannedMealAnomalies(rows),
    ...detectGroceryListAnomalies(rows),
    ...(await detectLegacyCleanupAnomalies(normalizedFilters.person_id)),
  ];
  const filtered = filterAnomalies(allAnomalies, normalizedFilters);

  const bySeverity = emptySeverityCounts();
  const byCategory = emptyCategoryCounts();
  const personIds = new Set<string>();
  for (const anomaly of filtered) {
    bySeverity[anomaly.severity] += 1;
    byCategory[anomaly.category] += 1;
    if (anomaly.person_id) personIds.add(anomaly.person_id);
  }

  return {
    generated_at: new Date().toISOString(),
    summary: {
      person_count: personIds.size,
      anomaly_count: filtered.length,
      by_severity: bySeverity,
      by_category: byCategory,
      by_code: countByCode(filtered),
      notes: [
        'Read-only anomaly report. Findings are review prompts, not repair instructions.',
        'No cleanup, repair, backfill, generation, or mutation action is performed by this tool.',
      ],
    },
    persons: buildPersonSummaries(filtered),
    anomalies: filtered,
    filters_applied: normalizedFilters,
  };
}
