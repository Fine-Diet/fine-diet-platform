/**
 * Plans — Client-Side Service (Phase 2)
 *
 * Fetch wrappers for the /api/journal/plans/** routes. Mirrors the style
 * of lib/journal/journalService.ts — thin, typed, no global state.
 *
 * Safe to import from client components.
 */

import type { ReusablePlacementConflict } from './reusableSlotMatching';
import type { GroceryDemandEmptyReason } from './pullFromPlanSelection';
import type {
  Plan,
  PlanDay,
  PlanSlot,
  PlannedMeal,
  PlannedMealType,
  PlanShape,
  PlanInputSnapshot,
  MealSchedule,
  MealSlotKey,
  ScheduleConflict,
  ImportedMeal,
  ImportedMealDraftPayload,
  NutritionEstimate,
  IngredientMatchEntry,
  ImportedMealParseStatus,
  ImportedMenu,
  PlannedEatOutEvent,
  EatOutRecommendationPayload,
  EatOutVenueType,
  GeneratedGroceryList,
  GroceryActiveListContext,
  GroceryHaul,
  GroceryHaulCreateResult,
  GroceryHaulItem,
  GroceryItem,
  GroceryItemStatus,
  GroceryShoppingOverride,
  GroceryShoppingOverrideBundle,
  GroceryItemResolutionChangeResult,
  PantryOnHandItem,
  PantryReadinessSummary,
  PlanDayTemplate,
  PlanWeekPattern,
} from './types';
import type {
  AiSubstitutionResponse,
} from './validators';
import type {
  SocialImportCreateInput,
  SocialImportDetail,
} from './socialEvidenceImport/types';

export type HeightDisplayUnit = 'in' | 'cm';
export type WeightDisplayUnit = 'lb' | 'kg';

export interface PlanDisplayPrefs {
  height_display_unit: HeightDisplayUnit;
  weight_display_unit: WeightDisplayUnit;
}

export interface LivePlanSnapshotResponse {
  snapshot: PlanInputSnapshot;
  display: PlanDisplayPrefs;
}

export type ImportRecipeResponse =
  | { imported_meal: ImportedMeal; ai_run_id: string; routed_to?: undefined }
  | { social_import: SocialImportDetail; routed_to: 'social_import' };

// ============================================================================
// Shared fetch helper
// ============================================================================

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.error === 'string' ? body.error : undefined;
    } catch {
      // ignore
    }
    throw new Error(detail ?? `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ============================================================================
// Types
// ============================================================================

export interface PlanListResponse {
  plans: Plan[];
}

export interface PlanDetailResponse {
  plan: Plan;
  days: PlanDay[];
  slots: PlanSlot[];
  meals: PlannedMeal[];
}

export interface GeneratePlanRequest {
  plan_shape: PlanShape;
  start_date: string;
  end_date?: string | null;
  user_prompt?: string | null;
}

export interface RegenerateSlotRequest {
  planned_meal_id: string;
  constraints?: {
    prefer_higher_subscore?:
      | 'wfr_10'
      | 'ps_10'
      | 'pnd_10'
      | 'fp_10'
      | 'as_10'
      | 'mnc_10'
      | 'ob_10'
      | null;
    avoid?: string[];
    max_calories?: number;
  };
}

export interface RegenerateSlotResponse {
  top: AiSubstitutionResponse;
  alternates: AiSubstitutionResponse[];
}

export interface MovePlannedMealResponse {
  meal: PlannedMeal;
  source_plan_day_id: string;
  target_plan_day_id: string;
}

export interface CopyPlannedMealResponse {
  meal: PlannedMeal;
  source_planned_meal_id: string;
  target_plan_day_id: string;
}

export interface InstantiatePlanDayTemplateResponse {
  template: PlanDayTemplate;
  meals: PlannedMeal[];
  target_plan_day_id: string;
  /** Package 5B — explicit reusable placement conflicts (compat additive). */
  placement_conflicts?: ReusablePlacementConflict[];
}

export interface InstantiatePlanWeekPatternResponse {
  pattern: PlanWeekPattern;
  meals: PlannedMeal[];
  target_plan_day_ids: string[];
  appended_to_existing_meal_count: number;
  application_count?: number;
  /** Package 5B — explicit reusable placement conflicts (compat additive). */
  placement_conflicts?: ReusablePlacementConflict[];
}

/**
 * Packet 29 — Shape returned by the row-level trusted-source search
 * endpoint. Kept light on purpose: enough to preview a candidate
 * (name / brand / calories / protein) without joining the whole
 * food-object row.
 */
export interface SourceSearchCandidate {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  serving_size_g: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  is_verified: boolean;
  source_provider: string | null;
  source_type: string | null;
  nutrient_confidence: 'high' | 'medium' | 'low' | null;
}

// ============================================================================
// Service
// ============================================================================

export const planService = {
  async list(): Promise<Plan[]> {
    const res = await request<PlanListResponse>('/api/journal/plans');
    return res.plans;
  },

  async getDetail(planId: string): Promise<PlanDetailResponse> {
    return await request<PlanDetailResponse>(`/api/journal/plans/${planId}`);
  },

  async archive(planId: string): Promise<Plan> {
    const res = await request<{ plan: Plan; was_current?: boolean }>(
      `/api/journal/plans/${planId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'archive' }),
      },
    );
    return res.plan;
  },

  async activate(planId: string): Promise<Plan> {
    const res = await request<{ plan: Plan }>(`/api/journal/plans/${planId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'activate' }),
    });
    return res.plan;
  },

  async generate(req: GeneratePlanRequest): Promise<PlanDetailResponse> {
    return await request<PlanDetailResponse>('/api/journal/plans/ai/generate', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  async regenerateSlot(req: RegenerateSlotRequest): Promise<RegenerateSlotResponse> {
    return await request<RegenerateSlotResponse>(
      '/api/journal/plans/ai/regenerate-slot',
      { method: 'POST', body: JSON.stringify(req) },
    );
  },

  async updateMeal(
    mealId: string,
    patch: Partial<Pick<PlannedMeal, 'name' | 'meal_type' | 'payload'>>,
  ): Promise<PlannedMeal> {
    const res = await request<{ meal: PlannedMeal }>(
      `/api/journal/plans/meals/${mealId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.meal;
  },

  async deleteMeal(mealId: string): Promise<void> {
    await request(`/api/journal/plans/meals/${mealId}`, { method: 'DELETE' });
  },

  async replaceMeal(
    mealId: string,
    replacement: AiSubstitutionResponse['replacement_meal'],
  ): Promise<PlannedMeal> {
    const res = await request<{ meal: PlannedMeal }>(
      `/api/journal/plans/meals/${mealId}`,
      { method: 'PATCH', body: JSON.stringify({ ai_replacement: replacement }) },
    );
    return res.meal;
  },

  async moveMeal(
    mealId: string,
    input: {
      target_plan_day_id: string;
      target_plan_slot_id: string | null;
    },
  ): Promise<MovePlannedMealResponse> {
    return await request<MovePlannedMealResponse>(
      `/api/journal/plans/meals/${mealId}/move`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async copyMeal(
    mealId: string,
    input: {
      target_plan_day_id: string;
      target_plan_slot_id: string | null;
    },
  ): Promise<CopyPlannedMealResponse> {
    return await request<CopyPlannedMealResponse>(
      `/api/journal/plans/meals/${mealId}/copy`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async createMeal(input: {
    plan_id: string;
    plan_day_id: string;
    plan_slot_id: string;
    name: string;
    meal_type: PlannedMealType;
    payload: PlannedMeal['payload'];
    /** Packet 35 — provenance: the imported_meals row this meal was attached from. */
    source_imported_meal_id?: string | null;
    /** Provenance: the journal_meal_template this meal was attached from. */
    source_template_id?: string | null;
  }): Promise<PlannedMeal> {
    const res = await request<{ meal: PlannedMeal }>('/api/journal/plans/meals', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.meal;
  },

  async listPlanDayTemplates(): Promise<PlanDayTemplate[]> {
    const res = await request<{ templates: PlanDayTemplate[] }>(
      '/api/journal/plans/templates',
    );
    return res.templates;
  },

  async savePlanDayTemplate(input: {
    plan_id?: string;
    plan_day_id?: string;
    name?: string | null;
    include_meals?: boolean;
    mode?: 'blank';
  }): Promise<PlanDayTemplate> {
    const res = await request<{ template: PlanDayTemplate }>(
      '/api/journal/plans/templates',
      { method: 'POST', body: JSON.stringify(input) },
    );
    return res.template;
  },

  async getPlanDayTemplate(templateId: string): Promise<PlanDayTemplate> {
    const res = await request<{ template: PlanDayTemplate }>(
      `/api/journal/plans/templates/${templateId}`,
    );
    return res.template;
  },

  async updatePlanDayTemplate(
    templateId: string,
    patch: {
      name?: string | null;
      slots?: PlanDayTemplate['slots'];
      unassigned_meals?: PlanDayTemplate['unassigned_meals'];
    },
  ): Promise<PlanDayTemplate> {
    const res = await request<{ template: PlanDayTemplate }>(
      `/api/journal/plans/templates/${templateId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.template;
  },

  async deletePlanDayTemplate(templateId: string): Promise<void> {
    await request<void>(`/api/journal/plans/templates/${templateId}`, { method: 'DELETE' });
  },

  async duplicatePlanDayTemplate(templateId: string): Promise<PlanDayTemplate> {
    const res = await request<{ template: PlanDayTemplate }>(
      `/api/journal/plans/templates/${templateId}/duplicate`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    return res.template;
  },

  async instantiatePlanDayTemplate(
    templateId: string,
    input: {
      plan_id: string;
      target_plan_day_id: string;
      apply_policy?: 'append';
      allow_duplicate_append?: boolean;
    },
  ): Promise<InstantiatePlanDayTemplateResponse> {
    return await request<InstantiatePlanDayTemplateResponse>(
      `/api/journal/plans/templates/${templateId}/instantiate`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async listPlanWeekPatterns(): Promise<PlanWeekPattern[]> {
    const res = await request<{ patterns: PlanWeekPattern[] }>(
      '/api/journal/plans/templates/week-patterns',
    );
    return res.patterns;
  },

  async savePlanWeekPattern(input: {
    plan_id?: string;
    source_plan_day_ids?: string[];
    name?: string | null;
    mode?: 'from_plan_days' | 'blank';
    day_count?: number;
  }): Promise<PlanWeekPattern> {
    const res = await request<{ pattern: PlanWeekPattern }>(
      '/api/journal/plans/templates/week-patterns',
      { method: 'POST', body: JSON.stringify(input) },
    );
    return res.pattern;
  },

  async getPlanWeekPattern(patternId: string): Promise<PlanWeekPattern> {
    const res = await request<{ pattern: PlanWeekPattern }>(
      `/api/journal/plans/templates/week-patterns/${patternId}`,
    );
    return res.pattern;
  },

  async updatePlanWeekPattern(
    patternId: string,
    patch: {
      name?: string | null;
      days?: PlanWeekPattern['days'];
    },
  ): Promise<PlanWeekPattern> {
    const res = await request<{ pattern: PlanWeekPattern }>(
      `/api/journal/plans/templates/week-patterns/${patternId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.pattern;
  },

  async deletePlanWeekPattern(patternId: string): Promise<void> {
    await request<void>(`/api/journal/plans/templates/week-patterns/${patternId}`, {
      method: 'DELETE',
    });
  },

  async duplicatePlanWeekPattern(patternId: string): Promise<PlanWeekPattern> {
    const res = await request<{ pattern: PlanWeekPattern }>(
      `/api/journal/plans/templates/week-patterns/${patternId}/duplicate`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    return res.pattern;
  },

  async instantiatePlanWeekPattern(
    patternId: string,
    input: {
      plan_id: string;
      target_start_plan_day_id: string;
      apply_policy?: 'append';
      allow_duplicate_append?: boolean;
      application_mode?: 'once' | 'repeat_weeks' | 'until_date';
      repeat_weeks?: number;
      until_date_local?: string;
    },
  ): Promise<InstantiatePlanWeekPatternResponse> {
    return await request<InstantiatePlanWeekPatternResponse>(
      `/api/journal/plans/templates/week-patterns/${patternId}/instantiate`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  /**
   * Packet 35 — Fetch the day detail (day + slots + meals) for a specific
   * date within a plan. Used by the import-draft "Add to Plan" panel to
   * surface available slots for a chosen date without loading the full plan.
   */
  async getDayDetail(
    planId: string,
    date: string,
  ): Promise<{ day: PlanDay; slots: PlanSlot[]; meals: PlannedMeal[]; eat_out_events: unknown[] }> {
    return await request<{ day: PlanDay; slots: PlanSlot[]; meals: PlannedMeal[]; eat_out_events: unknown[] }>(
      `/api/journal/plans/${planId}/days/${date}`,
    );
  },

  async getLiveSnapshot(): Promise<LivePlanSnapshotResponse> {
    return await request<LivePlanSnapshotResponse>('/api/journal/plans/snapshot');
  },

  async updateSlot(
    slotId: string,
    patch: { target_time?: string | null; slot_label?: string | null },
  ): Promise<PlanSlot> {
    const res = await request<{ slot: PlanSlot }>(
      `/api/journal/plans/slots/${slotId}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.slot;
  },

  /**
   * Apply a resolver-emitted suggestion to the user's baseline meal
   * schedule. This mutates people.metadata.meal_schedule via the
   * profile POST endpoint — Plans never auto-applies; the user has to
   * click Apply. Target times are owned by Profile per the Phase 3
   * contract, which is why this writes to profile rather than to
   * plan_slots.
   */
  // ==========================================================================
  // Phase 4 — Recipe / meal imports
  //
  // Imports are a first-class Plans surface: users paste recipes or URLs,
  // we create a structured DRAFT (imported_meals), then promote durable
  // favorites into the saved-meal bank (journal_meal_templates). The draft
  // can also be attached directly to a plan_slot via planService.createMeal
  // with `source_imported_meal_id` carried in the payload.
  // ==========================================================================

  async importRecipe(input: {
    text?: string | null;
    url?: string | null;
    source_platform?: string | null;
    user_hint?: string | null;
    /**
     * Packet 21 — user-supplied caption / recipe text for an
     * unsupported or transcript-poor social/video URL. Routed through
     * the same normalization and import pipeline as an auto-acquired
     * transcript, but audited as user-assisted.
     */
    assisted_text?: string | null;
    /**
     * Packet 22 — optional on-screen visible text the user saw in
     * the video (ingredient overlay, recipe card, step cards).
     * Merged with transcript/caption text as a secondary assist
     * before normalization; audited under a distinct
     * `onscreen_text_extract` run type.
     */
    onscreen_text?: string | null;
  }): Promise<ImportRecipeResponse> {
    return await request<ImportRecipeResponse>(
      '/api/journal/plans/ai/import-recipe',
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async listImports(): Promise<ImportedMeal[]> {
    const res = await request<{ imported_meals: ImportedMeal[] }>(
      '/api/journal/plans/imports/meals',
    );
    return res.imported_meals;
  },

  /** Parsed imports that still need Save to Meals & Recipes. */
  async listImportsNeedingLibrarySave(): Promise<ImportedMeal[]> {
    const res = await request<{ imported_meals: ImportedMeal[] }>(
      '/api/journal/plans/imports/meals?needs_library_save=1',
    );
    return res.imported_meals;
  },

  async getImport(id: string): Promise<ImportedMeal> {
    const res = await request<{ imported_meal: ImportedMeal }>(
      `/api/journal/plans/imports/meals/${id}`,
    );
    return res.imported_meal;
  },

  async updateImport(
    id: string,
    patch: {
      title?: string;
      source_url?: string | null;
      payload?: ImportedMeal['payload'];
      parsed_payload_json?: ImportedMealDraftPayload | null;
      nutrition_estimate_json?: NutritionEstimate | null;
      ingredient_match_json?: IngredientMatchEntry[] | null;
      parse_status?: ImportedMealParseStatus;
    },
  ): Promise<ImportedMeal> {
    const res = await request<{ imported_meal: ImportedMeal }>(
      `/api/journal/plans/imports/meals/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.imported_meal;
  },

  async promoteImport(
    id: string,
    body: { name?: string } = {},
  ): Promise<{ template_id: string; imported_meal_id: string }> {
    return await request<{ template_id: string; imported_meal_id: string }>(
      `/api/journal/plans/imports/meals/${id}/save`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  async createSocialImport(
    input: SocialImportCreateInput,
  ): Promise<SocialImportDetail> {
    const res = await request<{ social_import: SocialImportDetail }>(
      '/api/journal/plans/social-imports',
      { method: 'POST', body: JSON.stringify(input) },
    );
    return res.social_import;
  },

  async getSocialImport(id: string): Promise<SocialImportDetail> {
    const res = await request<{ social_import: SocialImportDetail }>(
      `/api/journal/plans/social-imports/${id}`,
    );
    return res.social_import;
  },

  async rerunSocialImport(
    id: string,
    input: Partial<SocialImportCreateInput>,
  ): Promise<SocialImportDetail> {
    const res = await request<{ social_import: SocialImportDetail }>(
      `/api/journal/plans/social-imports/${id}/rerun`,
      { method: 'POST', body: JSON.stringify(input) },
    );
    return res.social_import;
  },

  /**
   * Packet 28 — Suggested source adoption workflow.
   *
   * Apply / reject / undo a row-level food-object source on an
   * import-draft ingredient. The server re-derives payload,
   * nutrition estimate, and NDS from the updated override set and
   * returns the refreshed `ImportedMeal`.
   *
   *   - `apply`   commits the current (or explicit) food-object as
   *               the chosen source for this row.
   *   - `reject`  dismisses the suggestion ("Not this source").
   *   - `undo`    clears any prior user_choice on this row.
   */
  async updateIngredientSource(
    importId: string,
    ingredientIndex: number,
    body: { action: 'apply' | 'reject' | 'undo'; food_object_id?: string | null },
  ): Promise<{
    imported_meal: ImportedMeal;
    row: {
      index: number;
      before: { state: string; reason: string };
      after: { state: string; reason: string };
    };
  }> {
    return await request<{
      imported_meal: ImportedMeal;
      row: {
        index: number;
        before: { state: string; reason: string };
        after: { state: string; reason: string };
      };
    }>(
      `/api/journal/plans/imports/meals/${importId}/ingredients/${ingredientIndex}/source`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  /**
   * Packet 29 — Row-level trusted source search.
   *
   * Returns a small candidate list of trusted food objects matching
   * the query. Intended to back the row-level Find/Replace source
   * panel on an import-draft ingredient row.
   */
  async searchIngredientSources(
    importId: string,
    query: string,
    /**
     * Packet 30 — optional ingredient row index. When supplied, the
     * server uses that row's `normalized_name` + prep note as
     * row-context signal for ranking so candidates for the current
     * row's product class get preferred (e.g. a sauce row prefers
     * sauce candidates over unrelated same-brand items). Omitting it
     * keeps the previous pure-query behaviour.
     */
    ingredientIndex?: number,
  ): Promise<SourceSearchCandidate[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const params = new URLSearchParams({ q: trimmed });
    if (
      typeof ingredientIndex === 'number' &&
      Number.isInteger(ingredientIndex) &&
      ingredientIndex >= 0
    ) {
      params.set('idx', String(ingredientIndex));
    }
    const res = await request<{ candidates: SourceSearchCandidate[] }>(
      `/api/journal/plans/imports/meals/${importId}/source-search?${params.toString()}`,
    );
    return res.candidates;
  },

  /**
   * Packet 29 — In-place row save.
   *
   * Commits a partial update to a single ingredient row without
   * touching other rows on the server. `user_choice` state on other
   * rows is preserved via `priorMatches` inside the server rebuild.
   */
  async saveIngredient(
    importId: string,
    ingredientIndex: number,
    patch: {
      raw_text?: string | null;
      normalized_name?: string | null;
      quantity_value?: number | null;
      quantity_unit?: string | null;
      preparation_note?: string | null;
      parse_confidence?: 'high' | 'medium' | 'low' | null;
      quantity_source?:
        | 'explicit'
        | 'count_inferred'
        | 'range_midpoint'
        | 'approximated'
        | null;
    },
  ): Promise<{ imported_meal: ImportedMeal; row: { index: number } }> {
    return await request<{ imported_meal: ImportedMeal; row: { index: number } }>(
      `/api/journal/plans/imports/meals/${importId}/ingredients/${ingredientIndex}/save`,
      { method: 'POST', body: JSON.stringify({ ingredient: patch }) },
    );
  },

  // ==========================================================================
  // Phase 5 — Eat-out / restaurant planning
  //
  // Menus are imported as structured ImportedMenu records. A menu plus a
  // plan_slot becomes a PlannedEatOutEvent with a best/better/fallback
  // recommendation set. The user selects one option and it gets attached
  // to the slot as a planned_meal while the event context is preserved.
  // ==========================================================================

  async importMenu(input: {
    restaurant_name?: string;
    text?: string | null;
    url?: string | null;
  }): Promise<{ imported_menu: ImportedMenu; ai_run_id: string }> {
    return await request<{ imported_menu: ImportedMenu; ai_run_id: string }>(
      '/api/journal/plans/ai/import-menu',
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async recommendMenuPicks(input: {
    imported_menu_id: string;
    slot_id: string;
    scheduled_at?: string | null;
  }): Promise<{ eat_out_event: PlannedEatOutEvent; ai_run_id: string }> {
    return await request<{
      eat_out_event: PlannedEatOutEvent;
      ai_run_id: string;
    }>('/api/journal/plans/ai/recommend-menu-picks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getEatOutEvent(id: string): Promise<{
    eat_out_event: PlannedEatOutEvent;
    imported_menu: ImportedMenu | null;
    planned_meal: PlannedMeal | null;
  }> {
    return await request<{
      eat_out_event: PlannedEatOutEvent;
      imported_menu: ImportedMenu | null;
      planned_meal: PlannedMeal | null;
    }>(`/api/journal/plans/eat-out/${id}`);
  },

  async updateEatOutEvent(
    id: string,
    patch: {
      venue_name?: string;
      venue_type?: EatOutVenueType;
      scheduled_at?: string | null;
      menu_url?: string | null;
      recommendation_payload_json?: EatOutRecommendationPayload | null;
    },
  ): Promise<PlannedEatOutEvent> {
    const res = await request<{ eat_out_event: PlannedEatOutEvent }>(
      `/api/journal/plans/eat-out/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return res.eat_out_event;
  },

  async selectEatOutOption(
    id: string,
    body: {
      option_label: 'best' | 'better' | 'fallback';
      meal_name_override?: string | null;
    },
  ): Promise<{ eat_out_event: PlannedEatOutEvent; planned_meal: PlannedMeal }> {
    return await request<{
      eat_out_event: PlannedEatOutEvent;
      planned_meal: PlannedMeal;
    }>(`/api/journal/plans/eat-out/${id}/select`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async applyScheduleSuggestion(
    currentSchedule: MealSchedule,
    conflict: ScheduleConflict,
  ): Promise<MealSchedule> {
    if (!conflict.slot_key || !conflict.suggested_adjustment) {
      throw new Error('Conflict has no applicable suggestion.');
    }
    const key = conflict.slot_key as MealSlotKey;
    const current = currentSchedule.slots[key];
    const next: MealSchedule = {
      ...currentSchedule,
      slots: {
        ...currentSchedule.slots,
        [key]: {
          ...current,
          target_time:
            conflict.suggested_adjustment.target_time ?? current.target_time,
          enabled:
            conflict.suggested_adjustment.enabled !== undefined
              ? conflict.suggested_adjustment.enabled
              : current.enabled,
        },
      },
      updated_at: new Date().toISOString(),
    };
    const res = await fetch('/api/journal/profile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meal_schedule: next }),
    });
    if (!res.ok) throw new Error(`Failed to apply suggestion: ${res.status}`);
    return next;
  },

  // ==========================================================================
  // Packet 37 — Grocery / shopping list
  //
  // Grocery lists are derived deterministically from planned meal payloads.
  // A list covers a date range (minimum one day) within a plan. Derivation
  // uses the effective planned payload (including any serving-scaled amounts
  // written at attach time) so grocery quantities always reflect what is
  // actually planned — not the original import baseline.
  // ==========================================================================

  /**
   * Generate or return the grocery list for a plan day (or date range).
   *
   * When `regenerate` is false and a list already exists for the scope it
   * is returned as-is (preserving check/off state). When `regenerate` is
   * true the list is re-derived from the current planned meals, so removed
   * meals no longer contribute grocery items.
   */
  async generateGroceryList(
    planId: string,
    input: {
      date: string;
      date_end?: string | null;
      regenerate?: boolean;
    },
  ): Promise<{
    list: GeneratedGroceryList;
    items: GroceryItem[];
    pantry_items: PantryOnHandItem[];
    source_meals: PlannedMeal[];
    list_context: GroceryActiveListContext;
    shopping_overrides: GroceryShoppingOverrideBundle;
    resolved_product_labels: Record<string, string>;
    plan_day_dates: Record<string, string>;
  }> {
    return await request<{
      list: GeneratedGroceryList;
      items: GroceryItem[];
      pantry_items: PantryOnHandItem[];
      source_meals: PlannedMeal[];
      list_context: GroceryActiveListContext;
      shopping_overrides: GroceryShoppingOverrideBundle;
      resolved_product_labels: Record<string, string>;
      plan_day_dates: Record<string, string>;
    }>(`/api/journal/plans/${planId}/grocery/generate`, {
      method: 'POST',
      body: JSON.stringify({
        date: input.date,
        date_end: input.date_end ?? input.date,
        regenerate: input.regenerate ?? false,
      }),
    });
  },

  /**
   * Update the status of a single grocery item (check/off, mark as have,
   * skip). Used by the shopping list UI to persist the user's shopping
   * progress between sessions.
   */
  async updateGroceryItemStatus(
    itemId: string,
    status: GroceryItemStatus,
  ): Promise<GroceryItem> {
    const res = await request<{ item: GroceryItem }>(
      `/api/journal/plans/grocery-items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
    return res.item;
  },

  /**
   * Resolve an unresolved grocery row to a canonical food object. This keeps
   * the current amount as-is while teaching future derivation the same exact
   * unresolved name/unit mapping.
   */
  async resolveGroceryItemIngredient(
    itemId: string,
    foodObjectId: string,
  ): Promise<{ item: GroceryItem; shopping_override: GroceryShoppingOverride }> {
    return await request<{ item: GroceryItem; shopping_override: GroceryShoppingOverride }>(
      `/api/journal/plans/grocery-items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'resolve', food_object_id: foodObjectId }) },
    );
  },

  async changeGroceryItemResolution(
    itemId: string,
    foodObjectId: string,
  ): Promise<GroceryItemResolutionChangeResult> {
    return await request<GroceryItemResolutionChangeResult>(
      `/api/journal/plans/grocery-items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'change_resolution', food_object_id: foodObjectId }),
      },
    );
  },

  async markGroceryItemUnresolved(
    itemId: string,
  ): Promise<GroceryItemResolutionChangeResult> {
    return await request<GroceryItemResolutionChangeResult>(
      `/api/journal/plans/grocery-items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'mark_unresolved' }) },
    );
  },

  async setGroceryItemOnHand(
    itemId: string,
    input: { quantity: number; unit?: string | null },
  ): Promise<PantryOnHandItem> {
    const res = await request<{ pantry_item: PantryOnHandItem }>(
      `/api/journal/plans/grocery-items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set_on_hand',
          quantity: input.quantity,
          unit: input.unit ?? null,
        }),
      },
    );
    return res.pantry_item;
  },

  async saveGroceryShoppingOverride(
    itemId: string,
    input: {
      shopping_display_name?: string | null;
      purchase_quantity?: number | null;
      purchase_unit?: string | null;
      preferred_product?: string | null;
      aisle_category?: string | null;
      note?: string | null;
    },
  ): Promise<GroceryShoppingOverride> {
    const res = await request<{ shopping_override: GroceryShoppingOverride }>(
      `/api/journal/plans/grocery-items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'save_shopping_override', ...input }),
      },
    );
    return res.shopping_override;
  },

  async clearGroceryShoppingOverride(itemId: string): Promise<boolean> {
    const res = await request<{ cleared: boolean }>(
      `/api/journal/plans/grocery-items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'clear_shopping_override' }) },
    );
    return res.cleared;
  },

  async retireUnmatchedGroceryShoppingOverride(
    overrideId: string,
  ): Promise<GroceryShoppingOverride> {
    const res = await request<{ shopping_override: GroceryShoppingOverride }>(
      `/api/journal/plans/grocery-shopping-overrides/${overrideId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'retire' }) },
    );
    return res.shopping_override;
  },

  /**
   * Stage 1 grocery pricing — search retailer offers for a grounded item.
   * Returns structured results for 200 and 502 (provider_error); throws on 429 with quota.
   */
  async searchGroceryItemPrices(
    itemId: string,
    input: { retailer: string; postal_code: string },
  ): Promise<import('./groceryPricingTypes').GroceryPriceSearchResult> {
    const { fetchGroceryPriceSearch } = await import('./groceryPricingClient');
    return fetchGroceryPriceSearch(itemId, input);
  },

  async confirmGroceryItemPrice(
    itemId: string,
    input: {
      search_event_id: string;
      provider_result_id: string;
      package_count?: number;
      replace_manual?: boolean;
    },
  ): Promise<import('./groceryPricingTypes').GroceryPriceConfirmationResult> {
    const { fetchConfirmGroceryPrice } = await import('./groceryPricingClient');
    return fetchConfirmGroceryPrice(itemId, input);
  },

  async saveManualGroceryItemPrice(
    itemId: string,
    input: {
      retailer?: string | null;
      postal_code?: string | null;
      product_title?: string | null;
      brand_name?: string | null;
      package_size?: number | null;
      package_unit?: string | null;
      unit_price: number;
      currency?: string;
      package_count?: number;
      product_url?: string | null;
      image_url?: string | null;
    },
  ): Promise<import('./groceryPricingTypes').GroceryPriceObservation> {
    const { fetchManualGroceryPrice } = await import('./groceryPricingClient');
    return fetchManualGroceryPrice(itemId, input);
  },

  async getGroceryHaulSummary(
    planId: string,
    groceryListId: string,
  ): Promise<import('./groceryPricingTypes').GroceryHaulSummaryBundle> {
    const { fetchGroceryHaulSummary } = await import('./groceryPricingClient');
    return fetchGroceryHaulSummary(planId, groceryListId);
  },

  async getPersistentGroceryHaulSummary(
    listId: string,
  ): Promise<import('./groceryPricingTypes').GroceryHaulSummaryBundle> {
    const { fetchPersistentGroceryHaulSummary } = await import('./groceryPricingClient');
    return fetchPersistentGroceryHaulSummary(listId);
  },

  async listPantryOnHandItems(): Promise<PantryOnHandItem[]> {
    const res = await request<{ pantry_items: PantryOnHandItem[] }>(
      '/api/journal/plans/pantry',
    );
    return res.pantry_items;
  },

  /**
   * Persistent Grocery Lists v1 — Food → Groceries index. Returns the
   * default "My Grocery List", named lists, archived lists, and read-only
   * plan-derived lists from the existing generation workflow.
   */
  async getGroceryListsOverview(): Promise<{
    default_list: GeneratedGroceryList;
    named_lists: GeneratedGroceryList[];
    archived_lists: GeneratedGroceryList[];
    plan_lists: GeneratedGroceryList[];
  }> {
    return await request<{
      default_list: GeneratedGroceryList;
      named_lists: GeneratedGroceryList[];
      archived_lists: GeneratedGroceryList[];
      plan_lists: GeneratedGroceryList[];
    }>('/api/journal/food/grocery-lists');
  },

  async createNamedGroceryList(title: string): Promise<GeneratedGroceryList> {
    const res = await request<{ list: GeneratedGroceryList }>('/api/journal/food/grocery-lists', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return res.list;
  },

  async getPersistentGroceryList(
    listId: string,
  ): Promise<{ list: GeneratedGroceryList; items: GroceryItem[] }> {
    return await request<{ list: GeneratedGroceryList; items: GroceryItem[] }>(
      `/api/journal/food/grocery-lists/${listId}`,
    );
  },

  async startGroceryHaulFromList(
    listId: string,
    input: { shopping_date: string; creation_token: string },
  ): Promise<GroceryHaulCreateResult> {
    const res = await request<{ haul: GroceryHaulCreateResult }>(
      `/api/journal/food/grocery-lists/${listId}/hauls`,
      {
        method: 'POST',
        body: JSON.stringify({
          shopping_date: input.shopping_date,
          creation_token: input.creation_token,
        }),
      },
    );
    return res.haul;
  },

  async getGroceryHaul(
    haulId: string,
  ): Promise<{ haul: GroceryHaul; items: GroceryHaulItem[] }> {
    return await request<{ haul: GroceryHaul; items: GroceryHaulItem[] }>(
      `/api/journal/food/hauls/${haulId}`,
    );
  },

  async renameGroceryList(listId: string, title: string): Promise<GeneratedGroceryList> {
    const res = await request<{ list: GeneratedGroceryList }>(
      `/api/journal/food/grocery-lists/${listId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'rename', title }) },
    );
    return res.list;
  },

  async archiveGroceryList(listId: string): Promise<GeneratedGroceryList> {
    const res = await request<{ list: GeneratedGroceryList }>(
      `/api/journal/food/grocery-lists/${listId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'archive' }) },
    );
    return res.list;
  },

  async unarchiveGroceryList(listId: string): Promise<GeneratedGroceryList> {
    const res = await request<{ list: GeneratedGroceryList }>(
      `/api/journal/food/grocery-lists/${listId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'unarchive' }) },
    );
    return res.list;
  },

  async deletePersistentGroceryList(listId: string): Promise<void> {
    await request<void>(`/api/journal/food/grocery-lists/${listId}`, { method: 'DELETE' });
  },

  async addPersistentGroceryItem(
    listId: string,
    input: {
      name: string;
      quantity?: number | null;
      unit?: string | null;
      notes?: string | null;
      food_object_id?: string | null;
      raw_entry?: string | null;
      create_purchasing_choice?: boolean;
    },
  ): Promise<{
    item: GroceryItem;
    choice?: import('./types').GroceryListPurchasingChoice;
  }> {
    return await request<{
      item: GroceryItem;
      choice?: import('./types').GroceryListPurchasingChoice;
    }>(`/api/journal/food/grocery-lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async savePersistentGroceryItemManualPrice(
    listId: string,
    itemId: string,
    input: {
      unit_price: number;
      package_count?: number;
      currency?: string;
      product_title?: string | null;
      brand_name?: string | null;
      retailer?: string | null;
      package_size?: number | null;
      package_unit?: string | null;
    },
  ): Promise<import('./types').GroceryListPriceObservation> {
    const res = await request<{ observation: import('./types').GroceryListPriceObservation }>(
      `/api/journal/food/grocery-lists/${listId}/items/${itemId}/price-manual`,
      { method: 'POST', body: JSON.stringify(input) },
    );
    return res.observation;
  },

  async searchPersistentGroceryItemPrices(
    listId: string,
    itemId: string,
    input: { retailer: string; postal_code: string },
  ): Promise<import('./groceryPricingTypes').GroceryPriceSearchResult> {
    return await request(
      `/api/journal/food/grocery-lists/${listId}/items/${itemId}/price-search`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async confirmPersistentGroceryItemPrice(
    listId: string,
    itemId: string,
    input: {
      search_event_id: string;
      provider_result_id: string;
      package_count: number;
      replace_manual?: boolean;
    },
  ): Promise<import('./groceryPricingTypes').GroceryPriceConfirmationResult> {
    return await request(
      `/api/journal/food/grocery-lists/${listId}/items/${itemId}/price-confirm`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  },

  async getPersistentGroceryPriceQuotes(
    listId: string,
  ): Promise<{
    by_item_id: Record<string, import('./types').GroceryListPriceObservation>;
    stale_by_item_id: Record<string, import('./types').GroceryListPriceObservation>;
    pool_by_item_id: Record<string, import('./types').GroceryListPriceObservation[]>;
    active_observation_id_by_item_id: Record<string, string>;
    mixed_retailers: boolean;
    retailer_summary: string | null;
  }> {
    return await request(
      `/api/journal/food/grocery-lists/${listId}/price-quotes`,
    );
  },

  async setPersistentGroceryActiveQuote(
    listId: string,
    itemId: string,
    observationId: string,
  ): Promise<{
    active: import('./types').GroceryListItemActiveQuote;
    observation: import('./types').GroceryListPriceObservation;
  }> {
    return await request(`/api/journal/food/grocery-lists/${listId}/price-quotes`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'set_active',
        item_id: itemId,
        observation_id: observationId,
      }),
    });
  },

  async applyPersistentGroceryRetailerScenario(
    listId: string,
    selections: Record<string, string>,
  ): Promise<{
    applied: Array<{ item_id: string; observation_id: string }>;
    failed: Array<{ item_id: string; observation_id: string; error: string }>;
  }> {
    return await request(`/api/journal/food/grocery-lists/${listId}/price-quotes`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'apply_retailer_scenario',
        selections,
      }),
    });
  },

  async updatePersistentGroceryItem(
    listId: string,
    itemId: string,
    input: Partial<{
      name: string;
      quantity: number | null;
      unit: string | null;
      notes: string | null;
      status: GroceryItemStatus;
    }>,
  ): Promise<GroceryItem> {
    const res = await request<{ item: GroceryItem }>(
      `/api/journal/food/grocery-lists/${listId}/items/${itemId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
    return res.item;
  },

  async resolvePersistentGroceryItemForList(
    listId: string,
    itemId: string,
    input: {
      food_object_id: string;
      remember_for_future?: boolean;
      save_to_source_plan?: boolean;
      as_purchased_substitution?: boolean;
      preferred_product?: string | null;
      note?: string | null;
    },
  ): Promise<{
    item: GroceryItem;
    choice: import('./types').GroceryListPurchasingChoice;
    item_food_object_id: string | null;
    shopping_override: import('./types').GroceryShoppingOverride | null;
    person_resolution_saved: boolean;
  }> {
    return await request(
      `/api/journal/food/grocery-lists/${listId}/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'resolve_for_list', ...input }),
      },
    );
  },

  async clearPersistentGroceryItemListChoice(
    listId: string,
    itemId: string,
  ): Promise<{ item: GroceryItem }> {
    return await request(
      `/api/journal/food/grocery-lists/${listId}/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'clear_list_choice' }),
      },
    );
  },

  async getPersistentGroceryPurchasingChoices(
    listId: string,
  ): Promise<Record<string, import('./types').GroceryListPurchasingChoice>> {
    const res = await request<{
      by_item_id: Record<string, import('./types').GroceryListPurchasingChoice>;
    }>(`/api/journal/food/grocery-lists/${listId}/purchasing-choices`);
    return res.by_item_id;
  },

  async deletePersistentGroceryItem(listId: string, itemId: string): Promise<void> {
    await request<void>(`/api/journal/food/grocery-lists/${listId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Persistent Grocery Lists v1 — mandatory target-list generation. Reconciles
   * a Plan's planned-meal demand for a date range additively into a chosen
   * persistent list (defaults to "My Grocery List").
   */
  async reconcilePlanGroceryList(input: {
    plan_id: string;
    date: string;
    date_end?: string;
    target_list_id?: string;
    regenerate?: boolean;
  }): Promise<{
    target_list: GeneratedGroceryList;
    items: GroceryItem[];
    batch_item_ids: string[];
    source_meals: PlannedMeal[];
    pantry_items: PantryOnHandItem[];
    source_day_count: number;
    source_meal_count: number;
    pending_meal_count: number;
    derived_item_count: number;
    empty_reason: GroceryDemandEmptyReason | null;
  }> {
    return await request<{
      target_list: GeneratedGroceryList;
      items: GroceryItem[];
      batch_item_ids: string[];
      source_meals: PlannedMeal[];
      pantry_items: PantryOnHandItem[];
      source_day_count: number;
      source_meal_count: number;
      pending_meal_count: number;
      derived_item_count: number;
      empty_reason: GroceryDemandEmptyReason | null;
    }>('/api/journal/food/grocery-lists/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * Packet C — Read-only Pantry Readiness Summary. Derived from the active
   * plan + active grocery list + pantry; never persists readiness state and
   * never generates a grocery list.
   */
  async getPantryReadiness(): Promise<PantryReadinessSummary> {
    const res = await request<{ readiness: PantryReadinessSummary }>(
      '/api/journal/plans/pantry/readiness',
    );
    return res.readiness;
  },

  /**
   * Packet B — Directly add a deductible pantry row from /app/pantry.
   *
   * Requires a canonical `food_object_id` so the row is deduction-safe; the
   * server keys the row by canonical identity + normalized unit and upserts,
   * so re-adding the same food + unit updates the existing row rather than
   * duplicating it.
   */
  async createPantryOnHandItem(input: {
    food_object_id: string;
    quantity: number;
    unit?: string | null;
    if_absent?: boolean;
  }): Promise<PantryOnHandItem> {
    const res = await request<{ pantry_item: PantryOnHandItem }>(
      '/api/journal/plans/pantry',
      {
        method: 'POST',
        body: JSON.stringify({
          food_object_id: input.food_object_id,
          quantity: input.quantity,
          unit: input.unit ?? null,
          if_absent: input.if_absent === true,
        }),
      },
    );
    return res.pantry_item;
  },

  async updatePantryOnHandItem(
    key: string,
    input: { quantity: number; unit?: string | null },
  ): Promise<PantryOnHandItem> {
    const res = await request<{ pantry_item: PantryOnHandItem }>(
      `/api/journal/plans/pantry?key=${encodeURIComponent(key)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: input.quantity,
          unit: input.unit ?? null,
        }),
      },
    );
    return res.pantry_item;
  },

  async deletePantryOnHandItem(key: string): Promise<void> {
    await request<{ ok: true }>(
      `/api/journal/plans/pantry?key=${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  },

  // ==========================================================================
  // Packet 39 — Plan-to-Journal execution
  //
  // Connects planned meals to lived consumption without mutating the planned
  // meal. Logging creates a real journal_entry so the event appears in the
  // daily journal and contributes to NDS. The planned_meal is back-linked
  // so the day view can reflect execution state honestly.
  // ==========================================================================

  /**
   * Execute a planned meal.
   *   eat  — logs the meal to Journal; sets execution_state='eaten'.
   *   skip — marks as skipped; no journal entry is created.
   *   undo — reverts state to 'pending'; deletes the linked journal entry.
   *
   * `occurred_at` is the ISO timestamp for the journal entry (eat action).
   * Defaults to the current server time when not provided.
   */
  async executeMeal(
    mealId: string,
    action: 'eat' | 'skip' | 'undo' | 'log_adjusted',
    occurred_at?: string,
    intake_payload?: import('@/lib/meals/types').GroupedMealEntryPayload,
  ): Promise<{
    meal: PlannedMeal;
    journal_entry?: Record<string, unknown> | null;
    already_logged?: boolean;
  }> {
    return request<{
      meal: PlannedMeal;
      journal_entry?: Record<string, unknown> | null;
      already_logged?: boolean;
    }>(`/api/journal/plans/meals/${mealId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ action, occurred_at, intake_payload }),
    });
  },

  /** Ownership-scoped read for explicit plannedMealId deep links. */
  async getMeal(
    mealId: string,
    options?: { date?: string },
  ): Promise<{ meal: PlannedMeal; date_local: string } | null> {
    try {
      const params = options?.date
        ? `?date=${encodeURIComponent(options.date)}`
        : '';
      return await request<{ meal: PlannedMeal; date_local: string }>(
        `/api/journal/plans/meals/${mealId}${params}`,
      );
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) return null;
      throw err;
    }
  },

  // ==========================================================================
  // Packet 38 — Meal readiness
  //
  // Readiness is derived from grocery check/off state — no new persistent
  // model. The endpoint reads the existing grocery list for a date and
  // returns per-meal readiness scores so the day view can show which meals
  // are ready to cook and which are still missing items.
  // ==========================================================================

  /**
   * Fetch per-meal readiness for a plan + date. Meal IDs from `mealIds`
   * that have no grocery contributions return state "no_list".
   *
   * Returns has_list:false when no grocery list has been generated yet.
   */
  async getMealReadiness(
    planId: string,
    date: string,
    mealIds: string[],
  ): Promise<{
    has_list: boolean;
    readiness: Record<string, import('./readinessUtils').MealReadinessResult>;
  }> {
    const params = new URLSearchParams({ date });
    if (mealIds.length > 0) params.set('meal_ids', mealIds.join(','));
    return request<{
      has_list: boolean;
      readiness: Record<string, import('./readinessUtils').MealReadinessResult>;
    }>(`/api/journal/plans/${planId}/readiness?${params.toString()}`);
  },
};
