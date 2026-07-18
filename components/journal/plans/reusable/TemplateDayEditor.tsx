'use client';

import { useMemo, useState } from 'react';

import {
  duplicateTemplateMeal,
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
import { TemplateSavedMealPicker } from './TemplateSavedMealPicker';

interface TemplateDayEditorProps {
  template: PlanDayTemplate;
  busy?: boolean;
  onChange: (next: PlanDayTemplate) => void;
}

type ComposerTarget =
  | { kind: 'create'; slotIndex: number }
  | { kind: 'edit'; slotIndex: number; mealIndex: number; meal: PlanDayTemplateMeal };

type SlotAddMode = 'picker' | 'composer';

export function TemplateDayEditor({ template, busy = false, onChange }: TemplateDayEditorProps) {
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [slotAddMode, setSlotAddMode] = useState<SlotAddMode | null>(null);
  const [slotAddIndex, setSlotAddIndex] = useState<number | null>(null);

  const sortedSlots = useMemo(
    () =>
      [...template.slots].sort((a, b) => {
        const aTime = a.target_time ?? '';
        const bTime = b.target_time ?? '';
        if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime);
        return a.slot_ordinal - b.slot_ordinal;
      }),
    [template.slots],
  );

  function updateSlots(nextSlots: PlanDayTemplateSlot[]) {
    onChange({ ...template, slots: nextSlots });
  }

  function updateSlotMeals(slotIndex: number, meals: PlanDayTemplateMeal[]) {
    const next = template.slots.map((slot, index) =>
      index === slotIndex ? { ...slot, meals } : slot,
    );
    updateSlots(next);
  }

  function handleMoveSlot(slotIndex: number, direction: 'up' | 'down') {
    updateSlots(moveArrayItem(template.slots, slotIndex, direction));
  }

  function handleMoveMeal(slotIndex: number, mealIndex: number, direction: 'up' | 'down') {
    const slot = template.slots[slotIndex];
    if (!slot) return;
    updateSlotMeals(slotIndex, moveArrayItem(slot.meals, mealIndex, direction));
  }

  function handleRemoveMeal(slotIndex: number, mealIndex: number) {
    const slot = template.slots[slotIndex];
    if (!slot) return;
    if (!window.confirm('Remove this meal from the template?')) return;
    updateSlotMeals(
      slotIndex,
      slot.meals.filter((_, index) => index !== mealIndex),
    );
  }

  function defaultMealTypeForSlot(slot: PlanDayTemplateSlot): PlannedMealType {
    if (slot.slot_block === 'morning') return 'breakfast';
    if (slot.slot_block === 'evening') return 'dinner';
    return 'lunch';
  }

  function clearSlotAddUi() {
    setSlotAddMode(null);
    setSlotAddIndex(null);
  }

  async function appendMealToSlot(slotIndex: number, meal: PlanDayTemplateMeal) {
    const current = template.slots[slotIndex]?.meals ?? [];
    updateSlotMeals(slotIndex, [...current, meal]);
    clearSlotAddUi();
    setComposerTarget(null);
  }

  function handleDuplicateMeal(slotIndex: number, mealIndex: number) {
    const slot = template.slots[slotIndex];
    if (!slot) return;
    const meal = slot.meals[mealIndex];
    if (!meal) return;
    const next = [...slot.meals];
    next.splice(mealIndex + 1, 0, duplicateTemplateMeal(meal));
    updateSlotMeals(slotIndex, next);
  }

  return (
    <div className="space-y-4">
      {sortedSlots.map((slot) => {
        const slotIndex = template.slots.findIndex(
          (candidate) => candidate.source_plan_slot_id === slot.source_plan_slot_id,
        );
        if (slotIndex < 0) return null;

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
                  {slot.meals.length} meal{slot.meals.length === 1 ? '' : 's'}
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
                  disabled={busy || slotIndex >= template.slots.length - 1}
                  onClick={() => handleMoveSlot(slotIndex, 'down')}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70 disabled:opacity-30"
                >
                  Move down
                </button>
              </div>
            </div>

            {slot.meals.length === 0 ? (
              <p className="text-xs text-white/45 antialiased">No meals in this slot yet.</p>
            ) : (
              <ul className="space-y-2">
                {slot.meals.map((meal, mealIndex) => (
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
                        disabled={busy || mealIndex === 0}
                        onClick={() => handleMoveMeal(slotIndex, mealIndex, 'up')}
                        className="text-[11px] text-white/60 hover:text-white disabled:opacity-30"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={busy || mealIndex >= slot.meals.length - 1}
                        onClick={() => handleMoveMeal(slotIndex, mealIndex, 'down')}
                        className="text-[11px] text-white/60 hover:text-white disabled:opacity-30"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDuplicateMeal(slotIndex, mealIndex)}
                        className="text-[11px] text-white/60 hover:text-white"
                      >
                        Duplicate
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
            )}

            {composerTarget?.kind === 'edit' && composerTarget.slotIndex === slotIndex ? (
              <TemplateMealComposerPanel
                mode="edit"
                meal={composerTarget.meal}
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

            {slotAddIndex === slotIndex && slotAddMode === 'picker' ? (
              <TemplateSavedMealPicker
                defaultMealType={defaultMealTypeForSlot(slot)}
                onCancel={clearSlotAddUi}
                onPick={(meal) => appendMealToSlot(slotIndex, meal)}
              />
            ) : null}

            {slotAddIndex === slotIndex && slotAddMode === 'composer' ? (
              <TemplateMealComposerPanel
                mode="create"
                defaultMealType={defaultMealTypeForSlot(slot)}
                onCancel={clearSlotAddUi}
                onSaved={(meal) => appendMealToSlot(slotIndex, meal)}
              />
            ) : null}

            {(!composerTarget || composerTarget.slotIndex !== slotIndex) &&
            slotAddIndex !== slotIndex ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearSlotAddUi();
                    setComposerTarget(null);
                    setSlotAddIndex(slotIndex);
                    setSlotAddMode('picker');
                  }}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.06]"
                >
                  Choose saved meal
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearSlotAddUi();
                    setComposerTarget(null);
                    setSlotAddIndex(slotIndex);
                    setSlotAddMode('composer');
                  }}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.06]"
                >
                  Create & save to My Meals
                </button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
