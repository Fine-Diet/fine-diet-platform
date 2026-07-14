'use client';

/**
 * Packet 2 — Pre-log actual-consumption composer for a planned meal snapshot.
 *
 * Edits a MealDocument snapshot in memory only. Submitting writes one grouped
 * journal entry via log_adjusted and never mutates the planned meal payload.
 */
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import {
  MealComponentFoodSearch,
  type SelectedFoodGrounding,
} from '@/components/meals/MealComponentFoodSearch';
import { plannedMealToMealDocument } from '@/lib/meals/adapters';
import {
  applyGroundingToComponent,
  foodObjectToGrounding,
} from '@/lib/meals/componentGrounding';
import { planService, type PlannedMeal } from '@/lib/plans';
import type { MealComponent } from '@/lib/meals/types';
import {
  deriveAdjustedConsumption,
  formatConsumedNutritionPreview,
  updateComponentQuantityAndUnit,
} from '@/lib/plans/plannedMealAdjustDerivation';

function cloneComponents(components: MealComponent[]): MealComponent[] {
  return components.map((c) => ({
    ...c,
    macros: { ...c.macros },
    ...(c.measures ? { measures: c.measures.map((m) => ({ ...m })) } : {}),
  }));
}

function toOccurredAtIso(dateKey: string, time: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const occurred = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    occurred.setHours(hh, mm, 0, 0);
  }
  return occurred.toISOString();
}

function newBlankComponent(seq: number): MealComponent {
  return {
    component_id: `new-${seq}`,
    name: '',
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

export interface PlannedMealAdjustComposerProps {
  plannedMeal: PlannedMeal;
  dateKey: string;
  time: string;
  redirectTarget: string;
  onLogged?: () => void;
}

export function PlannedMealAdjustComposer({
  plannedMeal,
  dateKey,
  time,
  redirectTarget,
  onLogged,
}: PlannedMealAdjustComposerProps) {
  const router = useRouter();
  const titleId = useId();
  const newIdSeq = useRef(0);
  const baseDocument = useMemo(
    () => plannedMealToMealDocument(plannedMeal),
    [plannedMeal],
  );

  const [name, setName] = useState(baseDocument.title);
  const [servings, setServings] = useState('1');
  const [note, setNote] = useState('');
  const [components, setComponents] = useState<MealComponent[]>(() =>
    cloneComponents(baseDocument.components),
  );
  const [searchOpenFor, setSearchOpenFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedServings = Number(servings);
  const servingsValid = Number.isFinite(parsedServings) && parsedServings > 0;
  const nameValid = name.trim().length > 0;

  const derivation = useMemo(
    () =>
      deriveAdjustedConsumption({
        baseDocument,
        title: name,
        components,
        consumedServings: servingsValid ? parsedServings : 1,
        note: note.trim() || null,
      }),
    [baseDocument, components, name, note, parsedServings, servingsValid],
  );

  const previewLabel = formatConsumedNutritionPreview(
    derivation.consumedNutrition,
    derivation.needsReview,
  );

  const updateComponent = useCallback(
    (componentId: string, patch: Partial<MealComponent>) => {
      setComponents((prev) =>
        prev.map((c) => (c.component_id === componentId ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const handleAddComponent = useCallback(() => {
    newIdSeq.current += 1;
    setComponents((prev) => [...prev, newBlankComponent(newIdSeq.current)]);
  }, []);

  const handleRemoveComponent = useCallback((componentId: string) => {
    setComponents((prev) => prev.filter((c) => c.component_id !== componentId));
  }, []);

  const handleReplaceFood = useCallback(
    (componentId: string, grounding: SelectedFoodGrounding) => {
      setComponents((prev) =>
        prev.map((c) => {
          if (c.component_id !== componentId) return c;
          if (!grounding.food) {
            return {
              ...c,
              name: grounding.name,
              food_object_id: grounding.food_object_id,
              match_status: 'matched',
              source_kind: 'food_object',
              needs_review: true,
            };
          }
          return applyGroundingToComponent(
            {
              ...c,
              name: grounding.name,
              quantity: c.quantity ?? 1,
              unit: c.unit ?? 'serving',
            },
            foodObjectToGrounding(grounding.food),
          );
        }),
      );
      setSearchOpenFor(null);
    },
    [],
  );

  const handleQuantityChange = useCallback((componentId: string, rawValue: string) => {
    const qty = rawValue.trim() === '' ? null : Number(rawValue);
    setComponents((prev) =>
      prev.map((c) => {
        if (c.component_id !== componentId) return c;
        return updateComponentQuantityAndUnit(
          c,
          Number.isFinite(qty) ? qty : null,
          c.unit,
        );
      }),
    );
  }, []);

  const handleUnitChange = useCallback((componentId: string, unit: string | null) => {
    setComponents((prev) =>
      prev.map((c) => {
        if (c.component_id !== componentId) return c;
        return updateComponentQuantityAndUnit(c, c.quantity, unit);
      }),
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!servingsValid || !nameValid) {
      setError('Enter a meal name and servings greater than 0.');
      return;
    }
    if (derivation.needsReview) {
      setError('Nutrition needs review — adjust components or match foods before logging.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await planService.executeMeal(
        plannedMeal.id,
        'log_adjusted',
        toOccurredAtIso(dateKey, time),
        derivation.intakePayload,
      );
      onLogged?.();
      await router.push(redirectTarget);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log adjusted meal.');
    } finally {
      setSubmitting(false);
    }
  }, [
    servingsValid,
    nameValid,
    derivation,
    plannedMeal.id,
    dateKey,
    time,
    onLogged,
    router,
    redirectTarget,
  ]);

  return (
    <div className="px-6 pt-2 pb-4">
      <div
        className="rounded-2xl border border-brand-200/40 bg-brand-900/60 p-4 space-y-4"
        aria-labelledby={titleId}
      >
        <div>
          <p id={titleId} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-200/60">
            Adjust & log actual consumption
          </p>
          <p className="mt-1 text-xs text-white/45">
            Changes here record what you ate. Your plan stays unchanged unless you use Edit plan.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Meal name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Servings eaten
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Components
            </span>
            <button
              type="button"
              onClick={handleAddComponent}
              className="text-xs font-semibold text-denim-200 hover:text-denim-100"
            >
              + Add food
            </button>
          </div>
          <div className="space-y-3">
            {components.map((component) => (
              <div
                key={component.component_id}
                className="rounded-xl border border-white/10 bg-black/15 p-3 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={component.name}
                    onChange={(e) =>
                      updateComponent(component.component_id, { name: e.target.value })
                    }
                    placeholder="Food name"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-brand-50"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveComponent(component.component_id)}
                    className="text-xs text-white/40 hover:text-red-200"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={component.quantity ?? ''}
                    onChange={(e) => handleQuantityChange(component.component_id, e.target.value)}
                    placeholder="Qty"
                    className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-brand-50"
                  />
                  <input
                    type="text"
                    value={component.unit ?? ''}
                    onChange={(e) =>
                      handleUnitChange(component.component_id, e.target.value || null)
                    }
                    placeholder="Unit"
                    className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-brand-50"
                  />
                </div>
                {component.needs_review && (
                  <p className="text-[11px] text-amber-200/80">Needs review — match food or fix quantity/unit.</p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setSearchOpenFor(
                      searchOpenFor === component.component_id ? null : component.component_id,
                    )
                  }
                  className="text-xs font-medium text-denim-200 hover:text-denim-100"
                >
                  {component.food_object_id ? 'Replace matched food' : 'Match / replace food'}
                </button>
                {searchOpenFor === component.component_id && (
                  <MealComponentFoodSearch
                    initialQuery={component.name}
                    onSelect={(grounding) =>
                      handleReplaceFood(component.component_id, grounding)
                    }
                    onCancel={() => setSearchOpenFor(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-brand-50"
          />
        </label>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/70">
          {previewLabel}
        </div>

        {error && (
          <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={submitting || !servingsValid || !nameValid || derivation.needsReview}
          onClick={() => void handleSubmit()}
          className="rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
        >
          {submitting ? 'Logging…' : 'Log adjusted meal'}
        </button>
      </div>
    </div>
  );
}

export default PlannedMealAdjustComposer;
