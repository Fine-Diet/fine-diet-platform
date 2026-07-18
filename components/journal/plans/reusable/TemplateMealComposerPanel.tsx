'use client';

import { useReducer, useState } from 'react';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import { buildDocumentForCreate } from '@/lib/meals/composer/submission';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import type { MealDocument } from '@/lib/meals/types';
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

async function persistMealDocument(document: MealDocument): Promise<MealDocument> {
  const res = await fetch('/api/journal/meals/documents', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document),
  });
  const body = (await res.json().catch(() => ({}))) as {
    document?: MealDocument;
    error?: string;
  };
  if (!res.ok || !body.document) {
    throw new Error(body.error ?? 'Could not save this meal to My Meals.');
  }
  return body.document;
}

export function TemplateMealComposerPanel(props: TemplateMealComposerPanelProps) {
  const isCreate = props.mode === 'create';
  const [mealType, setMealType] = useState<PlannedMealType>(
    isCreate ? props.defaultMealType ?? 'other' : props.meal.meal_type,
  );
  const [state, dispatch] = useReducer(
    composerReducer,
    isCreate
      ? createComposerState('create')
      : createComposerState('plan-edit', templateMealDocument(props.meal)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-stage create: once the MealDocument is persisted to My Meals, its
  // id is preserved here so a failed/retried attach step never re-runs
  // persistMealDocument and never creates a duplicate library meal.
  const [savedDocument, setSavedDocument] = useState<MealDocument | null>(null);

  async function attachSavedDocument(document: MealDocument) {
    setSubmitting(true);
    setError(null);
    try {
      const meal = buildTemplateMealFromDocument(document, mealType);
      await props.onSaved(meal);
    } catch (err) {
      const title = document.title?.trim() || 'this meal';
      const reason = err instanceof Error ? err.message : 'Unknown error.';
      setError(
        `Saved "${title}" to My Meals, but attaching it to this slot failed: ${reason} ` +
          'The meal is safely in My Meals — retry attaching, or choose it later via "Choose saved meal".',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (isCreate && savedDocument) {
      // Document already persisted from a prior attempt — only retry the
      // attach step, never re-create the library meal.
      await attachSavedDocument(savedDocument);
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
      if (isCreate) {
        const document = await persistMealDocument(buildDocumentForCreate(state));
        setSavedDocument(document);
        await attachSavedDocument(document);
        return;
      }

      const meal = buildTemplateMealFromDocument(state.document, mealType, props.meal);
      await props.onSaved(meal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this meal.');
    } finally {
      setSubmitting(false);
    }
  }

  const attachFailed = isCreate && savedDocument !== null;
  const actions: MealComposerActionHandlers = isCreate
    ? {
        save: {
          label: attachFailed ? 'Retry attaching to this slot' : 'Save to My Meals & add',
          onRun: handleSubmit,
        },
      }
    : { update_plan: { label: 'Save meal', onRun: handleSubmit } };

  return (
    <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
      {attachFailed ? (
        <p className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-3 py-2 text-xs text-amber-200 antialiased">
          "{savedDocument?.title?.trim() || 'This meal'}" is saved in My Meals. Retry attaching it
          to this slot below, or cancel — the saved meal will still be available under "Choose
          saved meal".
        </p>
      ) : null}

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
        headerTitle={isCreate ? 'Create a reusable meal' : 'Edit template meal'}
        helperText={
          isCreate
            ? 'Saves to My Meals first, then attaches an isolated snapshot to this template.'
            : 'Edits this reusable template only. Applying the template later creates fresh planned meals on dated plans.'
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
        {attachFailed ? 'Cancel (meal stays saved in My Meals)' : 'Cancel'}
      </button>
    </div>
  );
}
