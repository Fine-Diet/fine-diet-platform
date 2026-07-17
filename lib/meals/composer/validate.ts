/**
 * Plans Authoring Convergence — Phase 2: composer submit-readiness checks.
 *
 * Pure, client/server-safe validation gates run BEFORE a context action is
 * allowed to submit. These are UX guards (mirroring the field-level rules
 * EditMealDocumentPanel already enforces) — the ACTUAL trust boundary is
 * always the server (validateMealDocumentForStorage / the grouped-log input
 * validator / mealDocumentEditService), never this module.
 */

import { composerModeLogsConsumption, type MealComposerState } from './types';

export type ComposerValidationResult = { ok: true } | { ok: false; errors: string[] };

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateComposerStateForSubmit(state: MealComposerState): ComposerValidationResult {
  const errors: string[] = [];
  const { document } = state;

  if (document.title.trim().length === 0) {
    errors.push('Title is required.');
  }

  if (document.components.length === 0) {
    errors.push('Add at least one component.');
  }

  for (const component of document.components) {
    if (component.name.trim().length === 0) {
      errors.push('Every component needs a name.');
    }
    if (component.quantity != null && !isPositiveNumber(component.quantity)) {
      errors.push(`"${component.name || 'Component'}" quantity must be greater than 0.`);
    }
  }

  if (document.kind === 'recipe') {
    const yieldServings = document.recipe_yield_servings;
    if (yieldServings != null && !isPositiveNumber(yieldServings)) {
      errors.push('Yield (servings) must be greater than 0, or blank.');
    }
  }

  if (composerModeLogsConsumption(state.mode)) {
    const consumed = Number(state.consumedServingsInput);
    if (!isPositiveNumber(consumed)) {
      errors.push('Servings must be greater than 0.');
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
