'use client';

/**
 * PlanMealComposerPanel — Plans Authoring Convergence Phase 3.
 *
 * Wraps the shared Meal Composer (lib/meals/composer/*, components/meals/
 * composer/MealComposer.tsx) for the Plans day surface, in two modes:
 *
 *   - `mode="create"`: builds a NEW planned meal for an empty PlanSlot.
 *     Submits via planService.createMeal (POST /api/journal/plans/meals) —
 *     the same existing route SlotEditor's manual/picker paths already use.
 *   - `mode="edit"`:   edits an EXISTING PENDING planned meal's structure.
 *     Submits via planService.updateMeal (PATCH /api/journal/plans/meals/
 *     :mealId) — the same existing route SlotEditor's edit mode uses. The
 *     server independently refuses this once the meal is no longer pending
 *     (assertPendingForRecovery in pages/api/journal/plans/meals/[mealId].ts);
 *     the `editingBlocked` check below is a redundant client-side guard for
 *     the same rule, defense-in-depth against a stale prop.
 *
 * Both modes write to `planned_meals` ONLY, via the pre-existing
 * create/update service calls — never journal_entries, never the in-memory
 * logging route, never an implicit MealDocument save. The canonical
 * conversion in both directions is lib/meals/adapters.ts's
 * plannedMealToMealDocument (read, for edit) and
 * mealDocumentToPlannedMealPayload (write, both modes) — no second
 * planned-meal component schema is introduced.
 *
 * This is an ADDITIONAL entry point alongside SlotEditor, not a replacement.
 * SlotEditor's saved-template picker, imported-draft picker, and manual
 * totals-only form all continue to work unchanged; the day page renders
 * this panel only when the user explicitly opts into the component editor
 * (see pages/journal/plans/day/[date].tsx).
 *
 * meal_type (breakfast/lunch/dinner/snack/other) is a Plans-specific concept
 * with no equivalent in the canonical MealDocument contract, so it is state
 * owned by THIS wrapper — exactly like PlannedMealAdjustComposer owns
 * dateKey/time outside the shared engine — and never leaks into
 * lib/meals/composer/*.
 */
import { useReducer, useState } from 'react';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import { mealDocumentToPlannedMealPayload, plannedMealToMealDocument } from '@/lib/meals/adapters';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import { planService } from '@/lib/plans';
import { stampPlannedMealDocumentPointer } from '@/lib/plans/mealDocumentPlanPointer';
import type { PlannedMeal, PlannedMealType, PlanSlot } from '@/lib/plans';

import { defaultMealTypeForSlot } from './SlotEditor';

interface PlanMealComposerCreateProps {
  mode: 'create';
  planId: string;
  planDayId: string;
  slot: PlanSlot;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}

interface PlanMealComposerEditProps {
  mode: 'edit';
  meal: PlannedMeal;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}

type PlanMealComposerPanelProps = PlanMealComposerCreateProps | PlanMealComposerEditProps;

const MEAL_TYPE_OPTIONS: { value: PlannedMealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Other' },
];

export function PlanMealComposerPanel(props: PlanMealComposerPanelProps) {
  const isCreate = props.mode === 'create';

  const [mealType, setMealType] = useState<PlannedMealType>(
    isCreate ? defaultMealTypeForSlot(props.slot) : props.meal.meal_type,
  );
  const [state, dispatch] = useReducer(
    composerReducer,
    isCreate
      ? createComposerState('plan')
      : createComposerState('plan-edit', plannedMealToMealDocument(props.meal)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defense-in-depth: the day page only ever opens this panel in edit mode
  // for a meal SlotCard already gated to execution_state==='pending' (see
  // components/journal/plans/SlotCard.tsx's `isHandled` guard), and the
  // server enforces the same rule again on PATCH. This just makes sure a
  // stale prop can never render an action that would only fail at the
  // network layer — it disables the button instead (Phase 3 guardrail: no
  // active control that fails at runtime).
  const editingBlocked = !isCreate && props.meal.execution_state !== 'pending';

  async function handleSubmit() {
    if (editingBlocked) {
      setError('This meal has already been handled and can no longer be edited here. Undo it first.');
      return;
    }
    const validation = validateComposerStateForSubmit(state);
    if (!validation.ok) {
      setError(validation.errors[0]);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let payload = mealDocumentToPlannedMealPayload(state.document) as Record<string, unknown>;
      // Library-backed composer edits stamp pointer + planned servings. Pure
      // ad-hoc composer meals (no document id) remain schedule-only payloads.
      if (state.document.id) {
        payload = stampPlannedMealDocumentPointer(payload, state.document);
      }
      const name = state.document.title.trim();
      if (isCreate) {
        await planService.createMeal({
          plan_id: props.planId,
          plan_day_id: props.planDayId,
          plan_slot_id: props.slot.id,
          name,
          meal_type: mealType,
          payload,
        });
      } else {
        await planService.updateMeal(props.meal.id, { name, meal_type: mealType, payload });
      }
      await props.onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this meal.');
    } finally {
      setSubmitting(false);
    }
  }

  // Only add_to_plan (create) / update_plan (edit) get a handler. plan
  // mode's save_as_meal/save_and_add are contract-complete but intentionally
  // NOT wired here — MealComposer hides any action with no handler, so this
  // never produces a broken "Save as Meal" button (Phase 3 scope: planned
  // intent only; a canonical "Save as Meal" affordance is left for a later
  // pass, per the packet's explicit "may remain a separate action" framing).
  const actions: MealComposerActionHandlers = isCreate
    ? { add_to_plan: { label: 'Add to plan', onRun: handleSubmit } }
    : { update_plan: { label: 'Save changes', disabled: editingBlocked, onRun: handleSubmit } };

  return (
    <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
          Slot type
        </label>
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value as PlannedMealType)}
          disabled={submitting}
          className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
        >
          {MEAL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <MealComposer
        state={state}
        dispatch={dispatch}
        actions={actions}
        headerTitle={isCreate ? 'Build a meal' : 'Edit planned meal'}
        helperText={
          isCreate
            ? "Add ingredients and search foods to ground nutrition. You can add an ingredient before it's matched — refine it later."
            : 'Saves back to this plan only. It never creates a journal entry or logs anything.'
        }
        error={error}
        submitting={submitting}
      />

      <button
        type="button"
        onClick={props.onCancel}
        disabled={submitting}
        className="text-xs text-white/60 hover:text-white/80 disabled:text-white/30 transition-colors antialiased"
      >
        Cancel
      </button>
    </div>
  );
}

export default PlanMealComposerPanel;
