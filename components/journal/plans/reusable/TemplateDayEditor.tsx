'use client';

import { useMemo, useState } from 'react';

import {
  formatTemplateSlotLabel,
  moveArrayItem,
} from '@/lib/plans/reusableAuthoringHelpers';
import type {
  PlanDayTemplate,
  PlanDayTemplateMeal,
  PlanDayTemplateSlot,
  PlannedMealType,
} from '@/lib/plans/types';

import { TemplateMealComposerPanel } from './TemplateMealComposerPanel';

interface TemplateDayEditorProps {
  template: PlanDayTemplate;
  busy?: boolean;
  onChange: (next: PlanDayTemplate) => void;
}

type ComposerTarget =
  | { kind: 'create'; slotIndex: number }
  | { kind: 'edit'; slotIndex: number; mealIndex: number; meal: PlanDayTemplateMeal };

export function TemplateDayEditor({ template, busy = false, onChange }: TemplateDayEditorProps) {
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [slotAddIndex, setSlotAddIndex] = useState<number | null>(null);

  const templateSlots = template.slots ?? [];

  const sortedSlots = useMemo(
    () =>
      [...templateSlots].sort((a, b) => {
        const aTime = a.target_time ?? '';
        const bTime = b.target_time ?? '';
        if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime);
        return a.slot_ordinal - b.slot_ordinal;
      }),
    [templateSlots],
  );

  function updateSlots(nextSlots: PlanDayTemplateSlot[]) {
    onChange({ ...template, slots: nextSlots });
  }

  function updateSlotMeals(slotIndex: number, meals: PlanDayTemplateMeal[]) {
    const next = templateSlots.map((slot, index) =>
      index === slotIndex ? { ...slot, meals } : slot,
    );
    updateSlots(next);
  }

  function handleMoveSlot(slotIndex: number, direction: 'up' | 'down') {
    updateSlots(moveArrayItem(templateSlots, slotIndex, direction));
  }

  function handleRemoveMeal(slotIndex: number, mealIndex: number) {
    const slot = templateSlots[slotIndex];
    if (!slot) return;
    if (!window.confirm('Remove this meal from the template?')) return;
    updateSlotMeals(
      slotIndex,
      (slot.meals ?? []).filter((_, index) => index !== mealIndex),
    );
  }

  function defaultMealTypeForSlot(slot: PlanDayTemplateSlot): PlannedMealType {
    if (slot.slot_block === 'morning') return 'breakfast';
    if (slot.slot_block === 'evening') return 'dinner';
    return 'lunch';
  }

  function clearSlotAddUi() {
    setSlotAddIndex(null);
  }

  async function appendMealToSlot(slotIndex: number, meal: PlanDayTemplateMeal) {
    const current = templateSlots[slotIndex]?.meals ?? [];
    updateSlotMeals(slotIndex, [...current, meal]);
    clearSlotAddUi();
    setComposerTarget(null);
  }

  return (
    <div className="space-y-4">
      {sortedSlots.map((slot) => {
        const slotIndex = templateSlots.findIndex(
          (candidate) => candidate.source_plan_slot_id === slot.source_plan_slot_id,
        );
        if (slotIndex < 0) return null;
        const slotMeals = slot.meals ?? [];

        return (
          <section
            key={slot.source_plan_slot_id}
            className="rounded-2xl bg-white/[0.04] p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white antialiased">
                  {formatTemplateSlotLabel(slot)}
                </p>
                <p className="text-[11px] text-white/45 antialiased">
                  {slotMeals.length > 0 ? 'Planned' : 'Not planned'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || slotIndex === 0}
                  onClick={() => handleMoveSlot(slotIndex, 'up')}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70 disabled:opacity-30"
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={busy || slotIndex >= templateSlots.length - 1}
                  onClick={() => handleMoveSlot(slotIndex, 'down')}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70 disabled:opacity-30"
                >
                  Move down
                </button>
              </div>
            </div>

            {slotMeals.length === 0 ? (
              <p className="text-xs text-white/45 antialiased">No Meal planned for this occasion yet.</p>
            ) : (
              <>
              {slotMeals.length > 1 ? (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
                  This legacy Day Plan contains multiple Meal containers in one occasion. They are
                  preserved here for review; new authoring uses one Meal composition.
                </p>
              ) : null}
              <ul className="space-y-2">
                {slotMeals.map((meal, mealIndex) => (
                  <li
                    key={meal.source_planned_meal_id}
                    className="rounded-xl bg-white/[0.04] px-3 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white antialiased">
                        {meal.name?.trim() || 'Untitled meal'}
                      </p>
                      <p className="text-[11px] text-white/45 antialiased capitalize">
                        {meal.meal_type}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setComposerTarget({ kind: 'edit', slotIndex, mealIndex, meal })
                        }
                        className="text-[11px] text-denim-200 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRemoveMeal(slotIndex, mealIndex)}
                        className="text-[11px] text-red-300 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              </>
            )}

            {composerTarget?.kind === 'edit' && composerTarget.slotIndex === slotIndex ? (
              <TemplateMealComposerPanel
                mode="edit"
                meal={composerTarget.meal}
                presentation="capture-draft"
                onCancel={() => setComposerTarget(null)}
                onSaved={async (meal) => {
                  const current = template.slots[slotIndex]?.meals ?? [];
                  updateSlotMeals(
                    slotIndex,
                    current.map((existing, index) =>
                      index === composerTarget.mealIndex ? meal : existing,
                    ),
                  );
                  setComposerTarget(null);
                }}
              />
            ) : null}

            {slotAddIndex === slotIndex ? (
              <TemplateMealComposerPanel
                mode="create"
                defaultMealType={defaultMealTypeForSlot(slot)}
                presentation="capture-draft"
                onCancel={clearSlotAddUi}
                onSaved={(meal) => appendMealToSlot(slotIndex, meal)}
              />
            ) : null}

            {(!composerTarget || composerTarget.slotIndex !== slotIndex) &&
            slotAddIndex !== slotIndex &&
            slotMeals.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearSlotAddUi();
                    setComposerTarget(null);
                    setSlotAddIndex(slotIndex);
                  }}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.06]"
                >
                  Plan this occasion
                </button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
