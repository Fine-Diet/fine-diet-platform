/**
 * Plans Authoring Convergence — Phase 2: Shared Meal Composer contract.
 *
 * Pure types only. No React, no I/O. This is the state/action contract the
 * composer reducer (./state.ts) and the presentational component
 * (components/meals/composer/MealComposer.tsx) both target, so the same
 * engine can back every composition surface (create a meal, edit a saved
 * meal, add to a plan, log now, adjust & log) without duplicating the
 * component-list editing logic per surface.
 *
 * Context-mode → action mapping mirrors the packet's product rules exactly:
 *   - Plans:  Add to Plan, Save as Meal, Save and Add
 *   - Plans (edit): Save changes to plan (targets planned_meals only — see
 *     Phase 3; distinct from 'plan' because editing an existing pending
 *     planned meal is a different write than creating a new one, exactly
 *     the same create/edit split as 'create' vs 'edit-saved' below)
 *   - Log:    Log Meal, Save as Meal, Log and Save
 *   - Adjust & Log: Log Adjusted Meal (never mutates the planned meal)
 *   - create / edit-saved: Save / Save changes (targets the canonical
 *     MealDocument store exclusively — never journal_meal_templates)
 */

import type { FoodObject } from '@/lib/food/types';
import type { MealDocument, MealDocumentKind } from '../types';

// ============================================================================
// Context modes
// ============================================================================

/**
 * Phase 3 update: 'plan' (create a new planned meal) and 'plan-edit' (edit an
 * existing PENDING planned meal — never eaten/skipped, enforced by the
 * caller and, independently, by the server: assertPendingForRecovery in
 * pages/api/journal/plans/meals/[mealId].ts) are now wired into the Plans day
 * surface (components/journal/plans/PlanMealComposerPanel.tsx). 'log' is
 * still contract-complete but NOT wired into any page — Log's "compose then
 * log" entry point does not exist yet. 'adjust-and-log' was migrated in
 * Phase 2 (PlannedMealAdjustComposer).
 */
export type MealComposerMode = 'create' | 'edit-saved' | 'plan' | 'plan-edit' | 'log' | 'adjust-and-log';

/** Whether a context mode logs actual consumption (shows a servings-eaten field). */
export function composerModeLogsConsumption(mode: MealComposerMode): boolean {
  return mode === 'log' || mode === 'adjust-and-log';
}

// ============================================================================
// Context-injected actions
// ============================================================================

export type MealComposerActionId =
  | 'save' // create: persist a new MealDocument
  | 'save_changes' // edit-saved: persist a patch to the existing MealDocument
  | 'add_to_plan' // plan: create a new planned_meals row (planned intent only)
  | 'update_plan' // plan-edit: patch an existing PENDING planned_meals row
  | 'save_as_meal' // plan/log: persist as a reusable MealDocument
  | 'save_and_add' // plan: save as meal AND add to plan
  | 'log_meal' // log: log now (in-memory; no prior save required)
  | 'log_and_save' // log: log now AND save as a reusable meal
  | 'log_adjusted'; // adjust-and-log: execute the planned meal with adjustments

export interface MealComposerActionConfig {
  id: MealComposerActionId;
  label: string;
  emphasis: 'primary' | 'secondary';
}

/**
 * Static per-context action config (labels only — no submit logic). The
 * actual submit behavior for each action id is injected by the caller via
 * `MealComposerActionHandlers` (components/meals/composer/MealComposer.tsx),
 * keeping the shared engine and component free of any context-specific
 * network/API knowledge.
 */
/**
 * Phase 3 note: 'plan' lists 'save_as_meal'/'save_and_add' as contract-
 * complete options for a future canonical-save affordance, but
 * PlanMealComposerPanel (the only current caller of 'plan'/'plan-edit')
 * deliberately supplies a handler for 'add_to_plan'/'update_plan' ONLY.
 * MealComposer hides any action with no supplied handler (see
 * components/meals/composer/MealComposer.tsx's `if (!handler) return null`),
 * so this table listing more actions than a given caller wires up can never
 * produce a dead/broken button — it only ever grows what a future caller MAY
 * opt into.
 */
export const MEAL_COMPOSER_CONTEXT_ACTIONS: Record<MealComposerMode, MealComposerActionConfig[]> = {
  create: [{ id: 'save', label: 'Save', emphasis: 'primary' }],
  'edit-saved': [{ id: 'save_changes', label: 'Save changes', emphasis: 'primary' }],
  plan: [
    { id: 'add_to_plan', label: 'Add to Plan', emphasis: 'primary' },
    { id: 'save_as_meal', label: 'Save as Meal', emphasis: 'secondary' },
    { id: 'save_and_add', label: 'Save and Add', emphasis: 'secondary' },
  ],
  'plan-edit': [{ id: 'update_plan', label: 'Save changes to plan', emphasis: 'primary' }],
  log: [
    { id: 'log_meal', label: 'Log Meal', emphasis: 'primary' },
    { id: 'save_as_meal', label: 'Save as Meal', emphasis: 'secondary' },
    { id: 'log_and_save', label: 'Log and Save', emphasis: 'secondary' },
  ],
  'adjust-and-log': [{ id: 'log_adjusted', label: 'Log adjusted meal', emphasis: 'primary' }],
};

// ============================================================================
// Food selection (mirrors components/meals/MealComponentFoodSearch's
// SelectedFoodGrounding without the composer engine depending on components/)
// ============================================================================

export interface MealComposerFoodSelection {
  food_object_id: string;
  name: string;
  food?: FoodObject;
}

// ============================================================================
// Composer state
// ============================================================================

export interface MealComposerState {
  mode: MealComposerMode;
  /** The live draft. Recomputed after every component-affecting action. */
  document: MealDocument;
  /** Raw controlled-input text for servings consumed (log / adjust-and-log). */
  consumedServingsInput: string;
  /** Optional per-instance note (log / adjust-and-log). */
  instanceNote: string;
  /** Mirrors the last recompute's needs_review — cheap to read for UI gating. */
  needsReview: boolean;
}

export function createInitialComposerState(
  mode: MealComposerMode,
  document: MealDocument,
  overrides?: Partial<Pick<MealComposerState, 'consumedServingsInput' | 'instanceNote'>>,
): MealComposerState {
  return {
    mode,
    document,
    consumedServingsInput: overrides?.consumedServingsInput ?? '1',
    instanceNote: overrides?.instanceNote ?? '',
    needsReview:
      document.review_state === 'needs_review' || document.components.some((c) => c.needs_review),
  };
}

// ============================================================================
// Actions
// ============================================================================

export type MealComposerAction =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SET_PREP_NOTES'; prepNotes: string }
  | { type: 'SET_SERVING_LABEL'; servingLabel: string }
  | { type: 'SET_YIELD_SERVINGS'; yieldServings: string }
  | { type: 'SET_KIND'; kind: MealDocumentKind }
  | { type: 'SET_CONSUMED_SERVINGS_INPUT'; value: string }
  | { type: 'SET_INSTANCE_NOTE'; value: string }
  | { type: 'SET_REVIEW_CONFIRMED'; confirmed: boolean }
  | { type: 'ADD_BLANK_COMPONENT'; componentId: string }
  | { type: 'ADD_COMPONENT_FROM_SELECTION'; componentId: string; selection: MealComposerFoodSelection }
  | { type: 'REMOVE_COMPONENT'; componentId: string }
  | { type: 'MOVE_COMPONENT_UP'; componentId: string }
  | { type: 'MOVE_COMPONENT_DOWN'; componentId: string }
  | { type: 'DUPLICATE_COMPONENT'; componentId: string; newComponentId: string }
  | { type: 'SWAP_COMPONENTS'; componentIdA: string; componentIdB: string }
  | { type: 'UPDATE_COMPONENT_NAME'; componentId: string; name: string }
  | {
      type: 'UPDATE_COMPONENT_QUANTITY_UNIT';
      componentId: string;
      quantity: number | null;
      unit: string | null;
    }
  | { type: 'UPDATE_COMPONENT_PREP_NOTE'; componentId: string; note: string }
  | { type: 'APPLY_COMPONENT_SELECTION'; componentId: string; selection: MealComposerFoodSelection }
  | { type: 'CLEAR_COMPONENT_GROUNDING'; componentId: string }
  | { type: 'SET_COMPONENT_NEEDS_REVIEW'; componentId: string; needsReview: boolean }
  | { type: 'ADD_STEP' }
  | { type: 'UPDATE_STEP'; stepNumber: number; instruction: string }
  | { type: 'REMOVE_STEP'; stepNumber: number };
