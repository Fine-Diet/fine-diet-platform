'use client';

import { useReducer, useState } from 'react';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import {
  buildTemplateMealFromDocument,
  templateMealDocument,
} from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanDayTemplateMeal, PlannedMealType } from '@/lib/plans/types';

const MEAL_TYPE_OPTIONS: { value: PlannedMealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'other', label: 'Other' },
];

interface TemplateMealComposerCreateProps {
  mode: 'create';
  defaultMealType?: PlannedMealType;
  onSaved: (meal: PlanDayTemplateMeal) => void | Promise<void>;
  onCancel: () => void;
}

interface TemplateMealComposerEditProps {
  mode: 'edit';
  meal: PlanDayTemplateMeal;
  onSaved: (meal: PlanDayTemplateMeal) => void | Promise<void>;
  onCancel: () => void;
}

type TemplateMealComposerPanelProps =
  | TemplateMealComposerCreateProps
  | TemplateMealComposerEditProps;

export function TemplateMealComposerPanel(props: TemplateMealComposerPanelProps) {
  const isCreate = props.mode === 'create';
  const [mealType, setMealType] = useState<PlannedMealType>(
    isCreate ? props.defaultMealType ?? 'other' : props.meal.meal_type,
  );
  const [state, dispatch] = useReducer(
    composerReducer,
    isCreate
      ? createComposerState('plan')
      : createComposerState('plan-edit', templateMealDocument(props.meal)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const validation = validateComposerStateForSubmit(state);
    if (!validation.ok) {
      setError(validation.errors[0]);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const meal = buildTemplateMealFromDocument(
        state.document,
        mealType,
        isCreate ? undefined : props.meal,
      );
      await props.onSaved(meal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this meal.');
    } finally {
      setSubmitting(false);
    }
  }

  const actions: MealComposerActionHandlers = isCreate
    ? { add_to_plan: { label: 'Add to template', onRun: handleSubmit } }
    : { update_plan: { label: 'Save meal', onRun: handleSubmit } };

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
        headerTitle={isCreate ? 'Build a template meal' : 'Edit template meal'}
        helperText="Edits this reusable template only. Applying the template later creates fresh planned meals on dated plans."
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
