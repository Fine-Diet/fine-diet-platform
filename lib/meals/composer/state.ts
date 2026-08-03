/**
 * Plans Authoring Convergence — Phase 2: Shared Meal Composer reducer.
 *
 * Pure state machine around MealComponent[] + a canonical MealDocument draft.
 * Every component-affecting action re-runs the SAME deterministic recompute
 * (lib/meals/recompute.ts) already used by grouped logging and the planned-
 * meal adjust flow, so the composer's needs_review / totals can never drift
 * from the rest of the app's nutrition policy.
 *
 * No I/O, no fetch, no AI — this module only manages in-memory drafts.
 * Persisting a draft (create/update/log) is the caller's job, using the
 * pure submission builders in ./submission.ts.
 */

import { normalizeMealDocumentContract } from '../normalizeMealComponentContract';
import { recomputeMealDocumentNutrition } from '../recompute';
import {
  DEFAULT_MEAL_DOCUMENT_VERSION,
  MEAL_SCHEMA_VERSION,
  type MealComponent,
  type MealDocument,
  type MealStep,
} from '../types';
import * as ops from './componentOps';
import {
  createInitialComposerState,
  type MealComposerAction,
  type MealComposerMode,
  type MealComposerState,
} from './types';

export { createInitialComposerState };

// ============================================================================
// Blank document builders — one per context mode
// ============================================================================

/**
 * A brand-new, empty MealDocument draft for the 'create' context (and the
 * blank-slate case for 'log'/'plan' before the user has picked/searched
 * anything). Kind defaults to 'meal'; the composer UI lets the user switch
 * to 'recipe' when steps/yield are needed.
 */
export function createBlankMealDocument(): MealDocument {
  return {
    schema_version: MEAL_SCHEMA_VERSION,
    document_version: DEFAULT_MEAL_DOCUMENT_VERSION,
    id: null,
    person_id: null,
    kind: 'meal',
    review_state: 'draft',
    title: '',
    description: null,
    intents: [],
    meal_type_hint: null,
    components: [],
    yield: null,
    recipe_yield_servings: null,
    serving_label: null,
    prep_notes: null,
    per_serving: null,
    totals: null,
    source: { source_type: 'manual' },
    nds: null,
    nds_version: null,
    classifier_version: null,
    created_at: null,
    updated_at: null,
  };
}

export function createComposerState(
  mode: MealComposerMode,
  seedDocument?: MealDocument,
  overrides?: Partial<Pick<MealComposerState, 'consumedServingsInput' | 'instanceNote'>>,
): MealComposerState {
  const seed = seedDocument
    ? normalizeMealDocumentContract(seedDocument)
    : createBlankMealDocument();
  return createInitialComposerState(mode, seed, overrides);
}

// ============================================================================
// Recompute helper
// ============================================================================

function withComponents(state: MealComposerState, components: MealComponent[]): MealComposerState {
  const { document, recompute } = recomputeMealDocumentNutrition({
    ...state.document,
    components,
  });
  return { ...state, document, needsReview: recompute.needs_review };
}

function withSteps(state: MealComposerState, steps: MealStep[]): MealComposerState {
  return { ...state, document: { ...state.document, steps } };
}

// ============================================================================
// Reducer
// ============================================================================

export function composerReducer(
  state: MealComposerState,
  action: MealComposerAction,
): MealComposerState {
  switch (action.type) {
    case 'SET_TITLE':
      return { ...state, document: { ...state.document, title: action.title } };

    case 'SET_DESCRIPTION':
      return {
        ...state,
        document: { ...state.document, description: action.description.trim() || null },
      };

    case 'SET_PREP_NOTES':
      return {
        ...state,
        document: { ...state.document, prep_notes: action.prepNotes.trim() || null },
      };

    case 'SET_SERVING_LABEL':
      return {
        ...state,
        document: { ...state.document, serving_label: action.servingLabel.trim() || null },
      };

    case 'SET_YIELD_SERVINGS': {
      const trimmed = action.yieldServings.trim();
      const servings = trimmed === '' ? null : Number(trimmed);
      const safeServings = Number.isFinite(servings) ? servings : null;
      return {
        ...state,
        document: {
          ...state.document,
          recipe_yield_servings: safeServings,
          yield: state.document.yield
            ? { ...state.document.yield, servings: safeServings }
            : safeServings != null
              ? { servings: safeServings, confirmed: false }
              : null,
        },
      };
    }

    case 'SET_KIND':
      return { ...state, document: { ...state.document, kind: action.kind } };

    case 'SET_CONSUMED_SERVINGS_INPUT':
      return { ...state, consumedServingsInput: action.value };

    case 'SET_INSTANCE_NOTE':
      return { ...state, instanceNote: action.value };

    case 'SET_REVIEW_CONFIRMED':
      return {
        ...state,
        document: {
          ...state.document,
          review_state: action.confirmed ? 'confirmed' : 'needs_review',
        },
      };

    case 'ADD_BLANK_COMPONENT':
      return withComponents(state, ops.addBlankComponent(state.document.components, action.componentId));

    case 'ADD_COMPONENT_FROM_SELECTION':
      return withComponents(
        state,
        ops.addComponentFromSelection(state.document.components, action.componentId, action.selection),
      );

    case 'ADD_COMPONENT_FROM_RECIPE':
      try {
        return withComponents(
          state,
          ops.addComponentFromRecipe(
            state.document.components,
            action.componentId,
            action.selection,
            state.document.id,
          ),
        );
      } catch {
        // Archived / circular / non-recipe attaches are rejected at the boundary.
        return state;
      }

    case 'REMOVE_COMPONENT':
      return withComponents(state, ops.removeComponent(state.document.components, action.componentId));

    case 'MOVE_COMPONENT_UP':
      return withComponents(state, ops.moveComponentUp(state.document.components, action.componentId));

    case 'MOVE_COMPONENT_DOWN':
      return withComponents(state, ops.moveComponentDown(state.document.components, action.componentId));

    case 'DUPLICATE_COMPONENT':
      return withComponents(
        state,
        ops.duplicateComponent(state.document.components, action.componentId, action.newComponentId),
      );

    case 'SWAP_COMPONENTS':
      return withComponents(
        state,
        ops.swapComponents(state.document.components, action.componentIdA, action.componentIdB),
      );

    case 'UPDATE_COMPONENT_NAME':
      return withComponents(
        state,
        ops.updateComponentName(state.document.components, action.componentId, action.name),
      );

    case 'UPDATE_COMPONENT_QUANTITY_UNIT':
      return withComponents(
        state,
        ops.updateComponentQuantityUnit(
          state.document.components,
          action.componentId,
          action.quantity,
          action.unit,
        ),
      );

    case 'UPDATE_COMPONENT_PREP_NOTE':
      return withComponents(
        state,
        ops.updateComponentPrepNote(state.document.components, action.componentId, action.note),
      );

    case 'APPLY_COMPONENT_SELECTION':
      return withComponents(
        state,
        ops.applySelectionToComponent(state.document.components, action.componentId, action.selection),
      );

    case 'CLEAR_COMPONENT_GROUNDING':
      return withComponents(
        state,
        ops.clearComponentGrounding(state.document.components, action.componentId),
      );

    case 'SET_COMPONENT_NEEDS_REVIEW':
      return withComponents(
        state,
        ops.setComponentNeedsReview(state.document.components, action.componentId, action.needsReview),
      );

    case 'ADD_STEP': {
      const steps = state.document.steps ?? [];
      const nextNumber = steps.length + 1;
      return withSteps(state, [...steps, { step_number: nextNumber, instruction: '' }]);
    }

    case 'UPDATE_STEP': {
      const steps = (state.document.steps ?? []).map((s) =>
        s.step_number === action.stepNumber ? { ...s, instruction: action.instruction } : s,
      );
      return withSteps(state, steps);
    }

    case 'REMOVE_STEP': {
      const steps = (state.document.steps ?? [])
        .filter((s) => s.step_number !== action.stepNumber)
        .map((s, idx) => ({ step_number: idx + 1, instruction: s.instruction }));
      return withSteps(state, steps);
    }

    default:
      return state;
  }
}
