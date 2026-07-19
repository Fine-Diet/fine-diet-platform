/**
 * Plans Authoring Convergence — Phase 2: composer → write-path builders.
 *
 * Pure functions that translate a composer draft into exactly the wire shape
 * each EXISTING write path already expects. This module does not fetch, does
 * not touch Supabase, and does not add a new grouped-entry format — it wires
 * the composer to the write paths the Phase 1 audit identified:
 *
 *   - 'create'        -> a full MealDocument for POST /api/journal/meals/documents
 *   - 'edit-saved'     -> a MealDocumentEditPatch for the EXISTING
 *                         PATCH /api/journal/meals/documents/[id] (same shape
 *                         EditMealDocumentPanel.buildPatch already produces —
 *                         diffed here from MealComponent[] instead of a
 *                         bespoke UI draft type, so it generalizes to any
 *                         composer surface).
 *   - 'log'            -> buildGroupedMealIntakePayload (existing, unchanged)
 *   - 'adjust-and-log' -> lib/plans/plannedMealAdjustDerivation.ts (existing,
 *                         unchanged) — deliberately NOT reimplemented here;
 *                         see PlannedMealAdjustComposer for the wiring.
 *   - 'plan'           -> deferred to Plans integration (out of scope here).
 */

// NOTE: import from groupedMealPayload.ts (client-safe), NOT
// groupedMealLoggingService.ts — the latter pulls in journalServerService
// (Supabase) at module load and this file is imported by client components
// (TemplateMealComposerPanel, CreateMealDocumentPanel).
import { buildGroupedMealIntakePayload } from '../groupedMealPayload';
import { MEAL_SCHEMA_VERSION, type GroupedMealEntryPayload, type MealComponent, type MealDocument } from '../types';
import type { MealComposerState } from './types';

// ============================================================================
// 'create' — a full MealDocument ready for POST /api/journal/meals/documents
// ============================================================================

/**
 * Finalize a composer draft into a document ready to persist as a NEW
 * MealDocument. `review_state` is conservative: 'confirmed' is only kept
 * when every component is already review-clean; recompute upstream already
 * enforces this, so this simply refuses to invent a 'confirmed' the draft
 * hasn't earned.
 */
export function buildDocumentForCreate(state: MealComposerState): MealDocument {
  const { document } = state;
  const anyNeedsReview = document.components.some((c) => c.needs_review);
  return {
    ...document,
    schema_version: MEAL_SCHEMA_VERSION,
    id: null,
    created_at: null,
    updated_at: null,
    title: document.title.trim(),
    review_state: anyNeedsReview
      ? 'needs_review'
      : document.review_state === 'draft'
        ? 'confirmed'
        : document.review_state,
  };
}

// ============================================================================
// 'edit-saved' — a MealDocumentEditPatch diffed against the loaded original
// ============================================================================

export interface ComposerComponentEditPatch {
  component_id: string;
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  preparation_note?: string | null;
  needs_review?: boolean;
  food_object_id?: string;
}

export interface ComposerComponentAddPatch {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  preparation_note?: string | null;
  food_object_id?: string;
}

export interface MealDocumentStructuralEditPatch {
  title?: string;
  description?: string | null;
  prep_notes?: string | null;
  serving_label?: string | null;
  recipe_yield_servings?: number | null;
  review_state?: MealDocument['review_state'];
  components?: ComposerComponentEditPatch[];
  steps?: { step_number: number; instruction: string }[];
  add_components?: ComposerComponentAddPatch[];
  remove_component_ids?: string[];
  unmatch_component_ids?: string[];
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Diff the composer's edited MealComponent[] against the originally-loaded
 * document's components, by component_id set membership:
 *   - an id present in `edited` but not in `original`        -> add_components
 *   - an id present in `original` but missing from `edited`  -> remove_component_ids
 *   - present in both, was grounded, now cleared             -> unmatch_component_ids
 *   - present in both with any other field change            -> components[]
 *
 * This generalizes EditMealDocumentPanel.buildPatch's is_new/pending_removed
 * bookkeeping into a plain set difference over MealComponent[], since the
 * composer engine has no bespoke UI draft state to consult.
 */
function diffComponents(original: MealComponent[], edited: MealComponent[]) {
  const originalById = new Map(original.map((c) => [c.component_id, c]));
  const editedIds = new Set(edited.map((c) => c.component_id));

  const addComponents: ComposerComponentAddPatch[] = [];
  const changedComponents: ComposerComponentEditPatch[] = [];
  const removeIds: string[] = [];
  const unmatchIds: string[] = [];

  for (const c of edited) {
    const src = originalById.get(c.component_id);
    if (!src) {
      const add: ComposerComponentAddPatch = { name: c.name.trim() };
      if (c.quantity != null) add.quantity = c.quantity;
      const unit = textOrNull(c.unit);
      if (unit !== null) add.unit = unit;
      const prep = textOrNull(c.preparation_note);
      if (prep !== null) add.preparation_note = prep;
      if (c.food_object_id) add.food_object_id = c.food_object_id;
      addComponents.push(add);
      continue;
    }

    const wasGrounded = !!src.food_object_id;
    const nowCleared = !c.food_object_id;
    if (wasGrounded && nowCleared) unmatchIds.push(c.component_id);

    const edit: ComposerComponentEditPatch = { component_id: c.component_id };
    let changed = false;
    if (c.name.trim() !== (src.name ?? '').trim() && c.name.trim().length > 0) {
      edit.name = c.name.trim();
      changed = true;
    }
    if (c.quantity !== (src.quantity ?? null)) {
      edit.quantity = c.quantity;
      changed = true;
    }
    const nextUnit = textOrNull(c.unit);
    if (nextUnit !== (src.unit ?? null)) {
      edit.unit = nextUnit;
      changed = true;
    }
    const nextPrep = textOrNull(c.preparation_note);
    if (nextPrep !== (src.preparation_note ?? null)) {
      edit.preparation_note = nextPrep;
      changed = true;
    }
    if (!(wasGrounded && nowCleared) && c.needs_review !== Boolean(src.needs_review)) {
      edit.needs_review = c.needs_review;
      changed = true;
    }
    if (c.food_object_id && c.food_object_id !== (src.food_object_id ?? null)) {
      edit.food_object_id = c.food_object_id;
      changed = true;
    }
    if (changed) changedComponents.push(edit);
  }

  for (const src of original) {
    if (!editedIds.has(src.component_id)) removeIds.push(src.component_id);
  }

  return { addComponents, changedComponents, removeIds, unmatchIds };
}

/**
 * Build the minimal patch of only the fields that actually changed between
 * the originally-loaded MealDocument and the composer's edited draft. The
 * result targets the EXISTING PATCH /api/journal/meals/documents/[id] route
 * (mealDocumentEditService.applyMealDocumentEditForPerson) unchanged.
 */
export function buildStructuralEditPatch(
  original: MealDocument,
  edited: MealDocument,
): MealDocumentStructuralEditPatch {
  const patch: MealDocumentStructuralEditPatch = {};

  if (edited.title.trim() !== original.title) patch.title = edited.title.trim();
  if (textOrNull(edited.description) !== (original.description ?? null)) {
    patch.description = textOrNull(edited.description);
  }
  if (textOrNull(edited.prep_notes) !== (original.prep_notes ?? null)) {
    patch.prep_notes = textOrNull(edited.prep_notes);
  }
  if (textOrNull(edited.serving_label) !== (original.serving_label ?? null)) {
    patch.serving_label = textOrNull(edited.serving_label);
  }
  if (edited.kind === 'recipe' || original.kind === 'recipe') {
    const nextYield = edited.recipe_yield_servings ?? null;
    if (nextYield !== (original.recipe_yield_servings ?? null)) {
      patch.recipe_yield_servings = nextYield;
    }
  }

  const { addComponents, changedComponents, removeIds, unmatchIds } = diffComponents(
    original.components,
    edited.components,
  );
  if (changedComponents.length > 0) patch.components = changedComponents;
  if (addComponents.length > 0) patch.add_components = addComponents;
  if (removeIds.length > 0) patch.remove_component_ids = removeIds;
  if (unmatchIds.length > 0) patch.unmatch_component_ids = unmatchIds;

  const originalSteps = [...(original.steps ?? [])].sort((a, b) => a.step_number - b.step_number);
  const editedSteps = [...(edited.steps ?? [])].sort((a, b) => a.step_number - b.step_number);
  const stepsChanged =
    originalSteps.length !== editedSteps.length ||
    editedSteps.some((s, idx) => s.instruction.trim() !== (originalSteps[idx]?.instruction ?? ''));
  if (stepsChanged) {
    patch.steps = editedSteps
      .map((s, idx) => ({ step_number: idx + 1, instruction: s.instruction.trim() }))
      .filter((s) => s.instruction.length > 0);
  }

  if (edited.review_state !== original.review_state) {
    patch.review_state = edited.review_state;
  }

  return patch;
}

// ============================================================================
// 'log' — reuses buildGroupedMealIntakePayload directly (no new format)
// ============================================================================

export function buildComposerLogPayload(state: MealComposerState): GroupedMealEntryPayload {
  const consumed = Number(state.consumedServingsInput);
  return buildGroupedMealIntakePayload(state.document, {
    consumed_servings: Number.isFinite(consumed) && consumed > 0 ? consumed : 1,
    instance_note: state.instanceNote.trim() || null,
  });
}
