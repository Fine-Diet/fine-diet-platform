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
import { useEffect, useReducer, useRef, useState } from 'react';

import { MealComposer, type MealComposerActionHandlers } from '@/components/meals/composer/MealComposer';
import { NutritionCaptureDraft } from '@/components/meals/composer/NutritionCaptureDraft';
import {
  mealDocumentToPlannedMealPayload,
  plannedMealToComposerSeed,
} from '@/lib/meals/adapters';
import { composerReducer, createComposerState } from '@/lib/meals/composer/state';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import { planService } from '@/lib/plans';
import {
  readSourceMealDocumentId,
  shouldStampPlannedMealDocumentPointer,
  stampPlannedMealDocumentPointer,
} from '@/lib/plans/mealDocumentPlanPointer';
import {
  clearPlanComposerDraft,
  loadPlanComposerDraft,
  savePlanComposerDraft,
  type PlanComposerDraftIdentity,
} from '@/lib/plans/planComposerDraftStore';
import { recomputeMealNDSShape } from '@/lib/plans/mealNDSShapeRecompute';
import { projectSingleMealAsDay } from '@/lib/plans/projection';
import type { PlannedMeal, PlannedMealType, PlanSlot } from '@/lib/plans';
import type { MealSlotKey } from '@/lib/plans/types';

import { defaultMealTypeForSlot } from './SlotEditor';

interface PlanMealComposerCreateProps {
  mode: 'create';
  planId?: string;
  planDayId?: string;
  slot: PlanSlot;
  resolveTarget?: () => Promise<{
    planId: string;
    planDayId: string;
    planSlotId: string;
    dateLocal?: string;
    slotKey?: MealSlotKey;
  }>;
  createContext?: 'plans_home' | 'plans_slot';
  primaryLabel?: string;
  presentation?: 'editor' | 'capture-draft';
  density?: 'compact' | 'comfortable';
  onSubmittingChange?: (submitting: boolean) => void;
  draftIdentity?: PlanComposerDraftIdentity;
  onSaved: (result: {
    meal: PlannedMeal;
    target: {
      planId: string;
      planDayId: string;
      planSlotId: string;
      dateLocal?: string;
      slotKey?: MealSlotKey;
    };
  }) => void | Promise<void>;
  onCancel: () => void;
}

interface PlanMealComposerEditProps {
  mode: 'edit';
  meal: PlannedMeal;
  primaryLabel?: string;
  presentation?: 'editor' | 'capture-draft';
  density?: 'compact' | 'comfortable';
  onSubmittingChange?: (submitting: boolean) => void;
  draftIdentity?: PlanComposerDraftIdentity;
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

function authoringDraftSignature(
  mealType: PlannedMealType,
  document: ReturnType<typeof createComposerState>['document'],
  authoringGroups: ReturnType<typeof createComposerState>['authoringGroups'],
): string {
  return JSON.stringify({
    mealType,
    title: document.title,
    description: document.description,
    prepNotes: document.prep_notes,
    components: document.components,
    authoringGroups,
  });
}

function previewSlotNds(
  document: ReturnType<typeof createComposerState>['document'],
  authoringGroups: ReturnType<typeof createComposerState>['authoringGroups'],
  mealType: PlannedMealType,
  persistedMeal?: PlannedMeal,
): number | null {
  if (document.components.length === 0 || document.totals?.calories == null) return null;

  const payload = mealDocumentToPlannedMealPayload(document, authoringGroups);
  const derived = recomputeMealNDSShape(document.title, payload);
  const meal: PlannedMeal = persistedMeal
    ? {
        ...persistedMeal,
        name: document.title,
        meal_type: mealType,
        payload,
        ...derived,
      }
    : {
        id: 'composer-preview',
        plan_id: '',
        plan_day_id: '',
        plan_slot_id: null,
        person_id: '',
        name: document.title,
        meal_type: mealType,
        payload,
        source_template_id: document.source.source_template_id ?? null,
        source_imported_meal_id: document.source.source_imported_meal_id ?? null,
        reusable_provenance: null,
        execution_state: 'pending',
        journal_entry_id: null,
        nds_version: document.nds_version ?? '',
        classifier_version: document.classifier_version ?? '',
        created_at: '',
        updated_at: '',
        ...derived,
      };
  const score = projectSingleMealAsDay(meal).nds_score_100;
  return Number.isFinite(score) ? score : null;
}

export function PlanMealComposerPanel(props: PlanMealComposerPanelProps) {
  const isCreate = props.mode === 'create';
  const occasionLabel = isCreate
    ? props.slot.slot_label?.trim() || defaultMealTypeForSlot(props.slot)
    : props.meal.meal_type;

  const initialMealType = isCreate ? defaultMealTypeForSlot(props.slot) : props.meal.meal_type;
  const initialState = isCreate
    ? createComposerState('plan')
    : (() => {
        const seed = plannedMealToComposerSeed(props.meal);
        return createComposerState('plan-edit', seed.document, {
          authoringGroups: seed.authoringGroups,
        });
      })();
  const [mealType, setMealType] = useState<PlannedMealType>(initialMealType);
  const [state, dispatch] = useReducer(composerReducer, initialState);
  const draftIdentityKey = props.draftIdentity
    ? [
        props.draftIdentity.personId,
        props.draftIdentity.planId,
        props.draftIdentity.planDayId,
        props.draftIdentity.planSlotId,
        props.draftIdentity.dateLocal,
      ].join(':')
    : '';
  const initialDraftRef = useRef(
    authoringDraftSignature(initialMealType, initialState.document, initialState.authoringGroups),
  );
  const [draftHydrated, setDraftHydrated] = useState(!props.draftIdentity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    authoringDraftSignature(mealType, state.document, state.authoringGroups) !==
    initialDraftRef.current;
  const slotNds = previewSlotNds(
    state.document,
    state.authoringGroups,
    mealType,
    isCreate ? undefined : props.meal,
  );

  // Defense-in-depth: the day page only ever opens this panel in edit mode
  // for a meal SlotCard already gated to execution_state==='pending' (see
  // components/journal/plans/SlotCard.tsx's `isHandled` guard), and the
  // server enforces the same rule again on PATCH. This just makes sure a
  // stale prop can never render an action that would only fail at the
  // network layer — it disables the button instead (Phase 3 guardrail: no
  // active control that fails at runtime).
  const editingBlocked = !isCreate && props.meal.execution_state !== 'pending';

  useEffect(() => {
    if (!props.draftIdentity || typeof window === 'undefined') {
      setDraftHydrated(true);
      return;
    }
    const restored = loadPlanComposerDraft(
      window.localStorage,
      props.draftIdentity,
      initialDraftRef.current,
    );
    if (restored) {
      dispatch({
        type: 'RESTORE_PLAN_DRAFT',
        document: restored.document,
        authoringGroups: restored.authoringGroups,
      });
      setMealType(restored.mealType);
    }
    setDraftHydrated(true);
  }, [draftIdentityKey]);

  useEffect(() => {
    if (!draftHydrated || !props.draftIdentity || typeof window === 'undefined') return;
    if (dirty) {
      savePlanComposerDraft(
        window.localStorage,
        props.draftIdentity,
        initialDraftRef.current,
        {
          mealType,
          document: state.document,
          authoringGroups: state.authoringGroups,
        },
      );
    } else {
      clearPlanComposerDraft(window.localStorage, props.draftIdentity);
    }
  }, [
    dirty,
    draftHydrated,
    mealType,
    draftIdentityKey,
    state.authoringGroups,
    state.document,
  ]);

  function clearStoredDraft() {
    if (props.draftIdentity && typeof window !== 'undefined') {
      clearPlanComposerDraft(window.localStorage, props.draftIdentity);
    }
  }

  async function handleSubmit() {
    if (!dirty) return;
    if (editingBlocked) {
      setError('This meal has already been handled and can no longer be edited here. Undo it first.');
      return;
    }
    const removingFinalComponent = !isCreate && state.document.components.length === 0;
    if (!removingFinalComponent) {
      const invalidMealGroup = state.authoringGroups.some(
        (group) =>
          typeof group.quantity !== 'number' ||
          !Number.isFinite(group.quantity) ||
          group.quantity <= 0,
      );
      if (invalidMealGroup) {
        setError('Meal serving quantity must be greater than zero.');
        return;
      }
      const validation = validateComposerStateForSubmit(state);
      if (!validation.ok) {
        setError(validation.errors[0]);
        return;
      }
    }
    setSubmitting(true);
    props.onSubmittingChange?.(true);
    setError(null);
    try {
      if (removingFinalComponent && !isCreate) {
        await planService.deleteMeal(props.meal.id);
        clearStoredDraft();
        await props.onSaved();
        return;
      }
      let payload = mealDocumentToPlannedMealPayload(
        state.document,
        state.authoringGroups,
      ) as Record<string, unknown>;
      // Library-backed composer edits stamp pointer + planned servings. Pure
      // ad-hoc composer meals (no document id) remain schedule-only payloads.
      // Legacy Saved Meals are journal_meal_templates adapted into a
      // MealDocument shape. Their id is a template id, not a meal_documents
      // id, so preserve source_template_id below without stamping a canonical
      // pointer that the strict attach gate would correctly reject.
      if (
        isCreate &&
        state.authoringGroups.length === 0 &&
        shouldStampPlannedMealDocumentPointer(state.document)
      ) {
        payload = stampPlannedMealDocumentPointer(payload, state.document);
      }
      if (!isCreate) {
        const priorPointer = readSourceMealDocumentId(props.meal.payload);
        if (priorPointer) {
          payload.source_meal_document_id = priorPointer;
          payload.meal_document_snapshot = true;
          const priorServings = props.meal.payload.planned_servings;
          if (typeof priorServings === 'number' && Number.isFinite(priorServings)) {
            payload.planned_servings = priorServings;
          }
        }
      }
      const name = state.document.title.trim();
      const groupedSource = state.authoringGroups
        .map((group) => group.source)
        .find((source) => source.source_template_id || source.source_imported_meal_id);
      if (isCreate) {
        const target = props.resolveTarget
          ? await props.resolveTarget()
          : props.planId && props.planDayId
            ? {
                planId: props.planId,
                planDayId: props.planDayId,
                planSlotId: props.slot.id,
              }
            : null;
        if (!target) {
          throw new Error('Could not resolve a planning target for this meal.');
        }
        const meal = await planService.createMeal({
          plan_id: target.planId,
          plan_day_id: target.planDayId,
          plan_slot_id: target.planSlotId,
          name,
          meal_type: mealType,
          payload,
          source_template_id:
            groupedSource?.source_template_id ??
            state.document.source.source_template_id ??
            null,
          source_imported_meal_id:
            groupedSource?.source_imported_meal_id ??
            state.document.source.source_imported_meal_id ??
            null,
          create_context: props.createContext,
        });
        clearStoredDraft();
        await props.onSaved({ meal, target });
      } else {
        await planService.updateMeal(props.meal.id, { name, meal_type: mealType, payload });
        clearStoredDraft();
        await props.onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this meal.');
    } finally {
      setSubmitting(false);
      props.onSubmittingChange?.(false);
    }
  }

  // Only add_to_plan (create) / update_plan (edit) get a handler. plan
  // mode's save_as_meal/save_and_add are contract-complete but intentionally
  // NOT wired here — MealComposer hides any action with no handler, so this
  // never produces a broken "Save as Meal" button (Phase 3 scope: planned
  // intent only; a canonical "Save as Meal" affordance is left for a later
  // pass, per the packet's explicit "may remain a separate action" framing).
  const actions: MealComposerActionHandlers = isCreate
    ? { add_to_plan: { label: props.primaryLabel ?? 'Add to plan', onRun: handleSubmit } }
    : { update_plan: { label: 'Save changes', disabled: editingBlocked, onRun: handleSubmit } };

  if (props.presentation === 'capture-draft') {
    return (
      <NutritionCaptureDraft
        state={state}
        dispatch={dispatch}
        commit={{
          label: props.primaryLabel ?? 'Save',
          onCommit: handleSubmit,
        }}
        error={error}
        submitting={submitting}
        dirty={dirty}
        allowEmptyCommit={!isCreate}
        density={props.density}
        occasionLabel={occasionLabel}
        nds={slotNds}
      />
    );
  }

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
