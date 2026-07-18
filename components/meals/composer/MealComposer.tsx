'use client';

/**
 * Plans Authoring Convergence — Phase 2: the shared Meal Composer.
 *
 * ONE composer, FIVE context modes (create, edit-saved, plan, log,
 * adjust-and-log). The engine (lib/meals/composer/*) is pure and mode-aware;
 * this component renders it and lets the CALLER inject context-specific
 * submit behavior via the `actions` prop — MealComposer itself never fetches
 * or knows about any specific API route. This is how "how context-specific
 * actions are injected" is satisfied: the shell + state contract are shared,
 * the network/persistence wiring per surface is not.
 *
 * State is CONTROLLED (state/dispatch passed in) rather than owned
 * internally, so a caller that needs to combine composer edits with its own
 * derived data (e.g. PlannedMealAdjustComposer's deriveAdjustedConsumption)
 * can read `state.document` on every render without an imperative escape
 * hatch.
 */

import { useId, useRef, useState, type Dispatch } from 'react';

import type { SelectedFoodGrounding } from '@/components/meals/MealComponentFoodSearch';
import {
  MEAL_COMPOSER_CONTEXT_ACTIONS,
  composerModeLogsConsumption,
  type MealComposerAction,
  type MealComposerActionId,
  type MealComposerState,
} from '@/lib/meals/composer/types';

import {
  MealComposerComponentList,
  type MealComposerComponentListHandlers,
} from './MealComposerComponentList';

export interface MealComposerActionHandler {
  /** Overrides the default per-context label when supplied. */
  label?: string;
  disabled?: boolean;
  onRun: () => void | Promise<void>;
}

export type MealComposerActionHandlers = Partial<Record<MealComposerActionId, MealComposerActionHandler>>;

export interface MealComposerProps {
  state: MealComposerState;
  dispatch: Dispatch<MealComposerAction>;
  actions: MealComposerActionHandlers;
  headerTitle: string;
  helperText?: string;
  /** Shown as a dismissable-by-retry error banner (submit failures). */
  error?: string | null;
  /** Optional precomputed nutrition preview string (log / adjust-and-log). */
  nutritionPreview?: string;
  submitting?: boolean;
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-brand-50 antialiased outline-none transition-colors placeholder:text-white/30 focus:border-emerald-300/50';
const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45';

export function MealComposer({
  state,
  dispatch,
  actions,
  headerTitle,
  helperText,
  error,
  nutritionPreview,
  submitting = false,
}: MealComposerProps) {
  const titleId = useId();
  const newComponentSeq = useRef(0);
  const [pendingActionId, setPendingActionId] = useState<MealComposerActionId | null>(null);

  const { mode, document } = state;
  const isRecipe = document.kind === 'recipe';
  /**
   * 'create'/'edit-saved' target a full MealDocument, which has
   * description/serving_label/recipe_yield_servings/review_state fields.
   * 'plan'/'plan-edit' target planned_meals.payload (items + totals +
   * notes_md only, per lib/plans/validators.ts PlannedMealPayloadSchema) —
   * showing document-only fields there would silently drop whatever the
   * user typed on submit (mealDocumentToPlannedMealPayload has nowhere to
   * put them), which is exactly the "active field that fails/misleads"
   * failure mode Phase 3 guards against. Split into two flags so plan modes
   * get prep notes (maps to notes_md) without the document-only fields.
   */
  const isDocumentMode = mode === 'create' || mode === 'edit-saved';
  const showDocumentOnlyFields = isDocumentMode;
  const showPrepNotes = isDocumentMode || mode === 'plan' || mode === 'plan-edit';
  const showConsumedServings = composerModeLogsConsumption(mode);

  function nextComponentId(): string {
    newComponentSeq.current += 1;
    return `composer-new-${newComponentSeq.current}`;
  }

  const listHandlers: MealComposerComponentListHandlers = {
    onMoveUp: (componentId) => dispatch({ type: 'MOVE_COMPONENT_UP', componentId }),
    onMoveDown: (componentId) => dispatch({ type: 'MOVE_COMPONENT_DOWN', componentId }),
    onDuplicate: (componentId) =>
      dispatch({ type: 'DUPLICATE_COMPONENT', componentId, newComponentId: nextComponentId() }),
    onRemove: (componentId) => dispatch({ type: 'REMOVE_COMPONENT', componentId }),
    onUpdateName: (componentId, name) => dispatch({ type: 'UPDATE_COMPONENT_NAME', componentId, name }),
    onUpdateQuantityUnit: (componentId, quantity, unit) =>
      dispatch({ type: 'UPDATE_COMPONENT_QUANTITY_UNIT', componentId, quantity, unit }),
    onUpdatePrepNote: (componentId, note) =>
      dispatch({ type: 'UPDATE_COMPONENT_PREP_NOTE', componentId, note }),
    onApplySelection: (componentId, selection: SelectedFoodGrounding) =>
      dispatch({ type: 'APPLY_COMPONENT_SELECTION', componentId, selection }),
    onClearGrounding: (componentId) => dispatch({ type: 'CLEAR_COMPONENT_GROUNDING', componentId }),
    onAddBlank: () => dispatch({ type: 'ADD_BLANK_COMPONENT', componentId: nextComponentId() }),
    onAddFromSelection: (selection: SelectedFoodGrounding) =>
      dispatch({ type: 'ADD_COMPONENT_FROM_SELECTION', componentId: nextComponentId(), selection }),
  };

  const actionConfigs = MEAL_COMPOSER_CONTEXT_ACTIONS[mode];

  async function runAction(actionId: MealComposerActionId) {
    const handler = actions[actionId];
    if (!handler || handler.disabled || pendingActionId) return;
    setPendingActionId(actionId);
    try {
      await handler.onRun();
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="space-y-4" aria-labelledby={titleId}>
      <div>
        <p id={titleId} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-200/60">
          {headerTitle}
        </p>
        {helperText && <p className="mt-1 text-xs text-white/45">{helperText}</p>}
      </div>

      <label className="block">
        <span className={labelClass}>{showDocumentOnlyFields ? 'Title' : 'Meal name'}</span>
        <input
          type="text"
          value={document.title}
          onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
          className={inputClass}
        />
      </label>

      {showDocumentOnlyFields && (
        <>
          <label className="block">
            <span className={labelClass}>
              Description <span className="text-white/30">(optional)</span>
            </span>
            <textarea
              value={document.description ?? ''}
              onChange={(e) => dispatch({ type: 'SET_DESCRIPTION', description: e.target.value })}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>
                Serving label <span className="text-white/30">(optional)</span>
              </span>
              <input
                type="text"
                value={document.serving_label ?? ''}
                onChange={(e) => dispatch({ type: 'SET_SERVING_LABEL', servingLabel: e.target.value })}
                placeholder="e.g. per bowl"
                className={inputClass}
              />
            </label>
            {isRecipe && (
              <label className="block">
                <span className={labelClass}>Yield (servings)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={document.recipe_yield_servings ?? ''}
                  onChange={(e) => dispatch({ type: 'SET_YIELD_SERVINGS', yieldServings: e.target.value })}
                  className={inputClass}
                />
              </label>
            )}
          </div>
        </>
      )}

      {showPrepNotes && (
        <label className="block">
          <span className={labelClass}>
            Prep notes <span className="text-white/30">(optional)</span>
          </span>
          <textarea
            value={document.prep_notes ?? ''}
            onChange={(e) => dispatch({ type: 'SET_PREP_NOTES', prepNotes: e.target.value })}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </label>
      )}

      {showConsumedServings && (
        <label className="block">
          <span className={labelClass}>Servings eaten</span>
          <input
            type="number"
            min="0"
            step="any"
            value={state.consumedServingsInput}
            onChange={(e) => dispatch({ type: 'SET_CONSUMED_SERVINGS_INPUT', value: e.target.value })}
            className={inputClass}
          />
        </label>
      )}

      <div>
        <p className={labelClass}>{isRecipe ? 'Ingredients' : 'Components'}</p>
        <MealComposerComponentList
          components={document.components}
          handlers={listHandlers}
          itemNounSingular={isRecipe ? 'ingredient' : 'component'}
        />
      </div>

      {isRecipe && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className={labelClass}>Instructions</p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'ADD_STEP' })}
              className="text-xs font-semibold text-denim-200 hover:text-denim-100"
            >
              + Add step
            </button>
          </div>
          <div className="space-y-2">
            {(document.steps ?? []).map((step) => (
              <div key={step.step_number} className="flex gap-2">
                <span className="mt-2.5 shrink-0 text-xs font-semibold text-white/40">
                  {step.step_number}.
                </span>
                <textarea
                  value={step.instruction}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_STEP', stepNumber: step.step_number, instruction: e.target.value })
                  }
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'REMOVE_STEP', stepNumber: step.step_number })}
                  className="mt-2 shrink-0 text-xs text-white/40 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showConsumedServings && (
        <label className="block">
          <span className={labelClass}>
            Note <span className="text-white/30">(optional)</span>
          </span>
          <textarea
            value={state.instanceNote}
            onChange={(e) => dispatch({ type: 'SET_INSTANCE_NOTE', value: e.target.value })}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </label>
      )}

      {showDocumentOnlyFields && (
        <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3">
          <input
            type="checkbox"
            checked={document.review_state === 'confirmed'}
            onChange={(e) => dispatch({ type: 'SET_REVIEW_CONFIRMED', confirmed: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-emerald-400"
          />
          <span className="text-sm text-white/70 antialiased">
            Mark as confirmed (reviewed)
            <span className="mt-0.5 block text-xs text-white/40">
              Confirmation only applies when every component is grounded and review-clean.
            </span>
          </span>
        </label>
      )}

      {nutritionPreview && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70">
          {nutritionPreview}
        </div>
      )}

      {state.needsReview && !nutritionPreview && (
        <p className="text-[11px] text-amber-200/80 antialiased">
          Needs review — some components can&apos;t be safely recomputed yet.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {actionConfigs.map((config) => {
          const handler = actions[config.id];
          if (!handler) return null;
          const isPending = pendingActionId === config.id;
          const isPrimary = config.emphasis === 'primary';
          return (
            <button
              key={config.id}
              type="button"
              disabled={submitting || handler.disabled || pendingActionId !== null}
              onClick={() => void runAction(config.id)}
              className={
                isPrimary
                  ? 'inline-flex items-center justify-center gap-2 rounded-full bg-[#d7ecff] px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50'
                  : 'inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
              }
            >
              {isPending && (
                <span
                  className={`h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent ${
                    isPrimary ? 'border-black/40' : 'border-white/40'
                  }`}
                />
              )}
              {handler.label ?? config.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
