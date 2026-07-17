/**
 * Plans Authoring Convergence — Phase 2: pure MealComponent[] list operations.
 *
 * These are the primitives behind the shared Meal Composer's explicit
 * move-up, move-down, duplicate, remove, and swap controls. NO
 * drag-and-drop, per the packet's product rule #8 — every reorder is an
 * explicit, discrete operation.
 *
 * Pure: no I/O, no React, inputs are never mutated. Id generation is the
 * CALLER's responsibility (component ids are passed in, not generated here)
 * so these functions stay deterministic and easy to unit test.
 */

import type { FoodObject } from '@/lib/food/types';

import {
  applyGroundingToComponent,
  detachComponentGrounding,
  foodObjectToGrounding,
} from '../componentGrounding';
import type { MealComponent } from '../types';
import type { MealComposerFoodSelection } from './types';

function cloneComponent(component: MealComponent): MealComponent {
  return {
    ...component,
    macros: { ...component.macros },
    ...(component.measures ? { measures: component.measures.map((m) => ({ ...m })) } : {}),
  };
}

function normalizeUnitText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

// ============================================================================
// Add / remove
// ============================================================================

/** A blank, ungrounded, needs-review component — mirrors the existing patterns
 * used by EditMealDocumentPanel.newComponentDraft and
 * PlannedMealAdjustComposer.newBlankComponent. */
export function blankComponent(componentId: string, name = ''): MealComponent {
  return {
    component_id: componentId,
    name,
    quantity: null,
    unit: null,
    food_object_id: null,
    calories: null,
    macros: { protein_g: null, carbs_g: null, fat_g: null },
    nutrition_basis: 'per_component',
    match_status: 'none',
    source_kind: 'user_entered',
    needs_review: true,
  };
}

export function addBlankComponent(
  components: MealComponent[],
  componentId: string,
): MealComponent[] {
  return [...components, blankComponent(componentId)];
}

/**
 * Build a component from a food-search selection and append it. When the
 * selection carries a full FoodObject snapshot, the component is trusted
 * grounded (matched, nutrition copied). Otherwise it is grounded to the
 * food id but flagged for review — mirrors PlannedMealAdjustComposer's
 * existing handleReplaceFood behavior for the no-snapshot case.
 */
export function addComponentFromSelection(
  components: MealComponent[],
  componentId: string,
  selection: MealComposerFoodSelection,
): MealComponent[] {
  const base = blankComponent(componentId, selection.name);
  const withSelection: MealComponent = selection.food
    ? applyGroundingToComponent(base, foodObjectToGrounding(selection.food))
    : {
        ...base,
        food_object_id: selection.food_object_id,
        match_status: 'matched',
        source_kind: 'food_object',
        needs_review: true,
      };
  return [...components, withSelection];
}

export function removeComponent(
  components: MealComponent[],
  componentId: string,
): MealComponent[] {
  return components.filter((c) => c.component_id !== componentId);
}

// ============================================================================
// Explicit reorder controls — move up / move down / swap / duplicate
// ============================================================================

/** Move a component one position earlier. No-op if already first or missing. */
export function moveComponentUp(
  components: MealComponent[],
  componentId: string,
): MealComponent[] {
  const idx = components.findIndex((c) => c.component_id === componentId);
  if (idx <= 0) return components;
  const next = [...components];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  return next;
}

/** Move a component one position later. No-op if already last or missing. */
export function moveComponentDown(
  components: MealComponent[],
  componentId: string,
): MealComponent[] {
  const idx = components.findIndex((c) => c.component_id === componentId);
  if (idx === -1 || idx >= components.length - 1) return components;
  const next = [...components];
  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  return next;
}

/** Swap the positions of two arbitrary components by id. No-op if either is missing. */
export function swapComponents(
  components: MealComponent[],
  componentIdA: string,
  componentIdB: string,
): MealComponent[] {
  if (componentIdA === componentIdB) return components;
  const idxA = components.findIndex((c) => c.component_id === componentIdA);
  const idxB = components.findIndex((c) => c.component_id === componentIdB);
  if (idxA === -1 || idxB === -1) return components;
  const next = [...components];
  [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
  return next;
}

/**
 * Duplicate a component in place (inserted immediately after the original)
 * with a fresh id. All other fields — including grounding and nutrition —
 * carry over unchanged.
 */
export function duplicateComponent(
  components: MealComponent[],
  componentId: string,
  newComponentId: string,
): MealComponent[] {
  const idx = components.findIndex((c) => c.component_id === componentId);
  if (idx === -1) return components;
  const clone = cloneComponent(components[idx]);
  clone.component_id = newComponentId;
  const next = [...components];
  next.splice(idx + 1, 0, clone);
  return next;
}

// ============================================================================
// Field edits
// ============================================================================

/**
 * Renaming a grounded component away from its matched display name detaches
 * canonical identity so stale nutrition cannot ride under a new name — same
 * rule lib/plans/plannedMealAdjustDerivation.ts enforces for the planned-meal
 * adjust flow, reimplemented here so this module has no lib/plans dependency.
 */
export function updateComponentName(
  components: MealComponent[],
  componentId: string,
  name: string,
): MealComponent[] {
  return components.map((c) => {
    if (c.component_id !== componentId) return c;
    if (c.food_object_id && name.trim() !== c.name.trim()) {
      return { ...detachComponentGrounding(c), name };
    }
    return { ...cloneComponent(c), name };
  });
}

/**
 * Update quantity/unit. When the component's nutrition_basis is
 * 'per_component' and only the quantity changed (unit stable), nutrition is
 * scaled proportionally by the caller via a subsequent recompute pass — here
 * we only invalidate stale nutrition on a unit change (recompute owns scaling
 * from canonical grounding for 'per_serving' components).
 */
export function updateComponentQuantityUnit(
  components: MealComponent[],
  componentId: string,
  quantity: number | null,
  unit: string | null,
): MealComponent[] {
  return components.map((c) => {
    if (c.component_id !== componentId) return c;
    const unitChanged = normalizeUnitText(c.unit) !== normalizeUnitText(unit);
    const next = { ...cloneComponent(c), quantity, unit };
    if (unitChanged && c.nutrition_basis === 'per_component') {
      // Unit changed with no canonical grounding to re-derive from — the
      // stored per-component nutrition no longer describes the new amount.
      return { ...detachComponentGrounding(next), quantity, unit };
    }
    return next;
  });
}

export function updateComponentPrepNote(
  components: MealComponent[],
  componentId: string,
  note: string,
): MealComponent[] {
  return components.map((c) =>
    c.component_id === componentId ? { ...cloneComponent(c), preparation_note: note || null } : c,
  );
}

export function applySelectionToComponent(
  components: MealComponent[],
  componentId: string,
  selection: MealComposerFoodSelection,
): MealComponent[] {
  return components.map((c) => {
    if (c.component_id !== componentId) return c;
    if (!selection.food) {
      return {
        ...cloneComponent(c),
        name: selection.name,
        food_object_id: selection.food_object_id,
        match_status: 'matched',
        source_kind: 'food_object',
        needs_review: true,
      };
    }
    return applyGroundingToComponent(
      { ...cloneComponent(c), name: selection.name },
      foodObjectToGrounding(selection.food as FoodObject),
    );
  });
}

export function clearComponentGrounding(
  components: MealComponent[],
  componentId: string,
): MealComponent[] {
  return components.map((c) => (c.component_id === componentId ? detachComponentGrounding(c) : c));
}

export function setComponentNeedsReview(
  components: MealComponent[],
  componentId: string,
  needsReview: boolean,
): MealComponent[] {
  return components.map((c) =>
    c.component_id === componentId ? { ...cloneComponent(c), needs_review: needsReview } : c,
  );
}
