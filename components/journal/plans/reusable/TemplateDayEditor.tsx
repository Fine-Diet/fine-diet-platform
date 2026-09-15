'use client';

import { useEffect, useMemo, useState } from 'react';

import { MealStateMarker } from '@/components/plans/home/MealStateMarker';
import { formatTemplateSlotLabel } from '@/lib/plans/reusableAuthoringHelpers';
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

type LegacyEditTarget = {
  slotId: string;
  slotIndex: number;
  mealIndex: number;
  meal: PlanDayTemplateMeal;
};

export function TemplateDayEditor({ template, busy = false, onChange }: TemplateDayEditorProps) {
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);
  const [legacyEditTarget, setLegacyEditTarget] = useState<LegacyEditTarget | null>(null);

  const templateSlots = template.slots ?? [];

  useEffect(() => {
    setOpenSlotId(null);
    setLegacyEditTarget(null);
  }, [template.id]);

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

  function closeSlot() {
    setOpenSlotId(null);
    setLegacyEditTarget(null);
  }

  function toggleSlot(slotId: string) {
    setOpenSlotId((current) => {
      if (current === slotId) {
        setLegacyEditTarget(null);
        return null;
      }
      setLegacyEditTarget(null);
      return slotId;
    });
  }

  async function appendMealToSlot(slotIndex: number, meal: PlanDayTemplateMeal) {
    const current = templateSlots[slotIndex]?.meals ?? [];
    updateSlotMeals(slotIndex, [...current, meal]);
    closeSlot();
  }

  return (
    <div className="space-y-4">
      {sortedSlots.map((slot) => {
        const slotIndex = templateSlots.findIndex(
          (candidate) => candidate.source_plan_slot_id === slot.source_plan_slot_id,
        );
        if (slotIndex < 0) return null;
        const slotMeals = slot.meals ?? [];
        const slotId = slot.source_plan_slot_id;
        const active = openSlotId === slotId;
        const occasionLabel = formatTemplateSlotLabel(slot);
        const legacyEditingThisSlot =
          legacyEditTarget?.slotId === slotId && slotMeals.length > 1;

        return (
          <section
            key={slotId}
            className="border-t border-white/25 pt-5 pb-2 px-4 space-y-3"
          >
            <div
              className="flex items-center justify-between gap-3"
              onClick={(event) => {
                if (
                  (event.target as HTMLElement).closest('button, input, select, textarea')
                ) {
                  return;
                }
                if (!busy) toggleSlot(slotId);
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-white/60">
                  <MealStateMarker planned={slotMeals.length > 0} />
                </span>
                <p className="text-lg font-semibold text-white antialiased">
                  {occasionLabel}
                </p>
              </div>
              <button
                type="button"
                aria-expanded={active}
                aria-label={`${active ? 'Collapse' : 'Expand'} ${occasionLabel}`}
                disabled={busy}
                onClick={() => toggleSlot(slotId)}
                className="grid h-7 w-8 shrink-0 place-items-center rounded-md text-base text-white/55 hover:text-white disabled:opacity-30"
              >
                <svg
                  aria-hidden
                  className={`h-[15px] w-[15px] flex-shrink-0 transition-transform duration-200 ${
                    active ? 'rotate-180' : ''
                  }`}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <polygon points="12,18 2,6 22,6" />
                </svg>
              </button>
            </div>

            {active ? (
              <div>
                {slotMeals.length === 0 ? (
                  <TemplateMealComposerPanel
                    mode="create"
                    defaultMealType={defaultMealTypeForSlot(slot)}
                    presentation="capture-draft"
                    onCancel={closeSlot}
                    onSaved={(meal) => appendMealToSlot(slotIndex, meal)}
                  />
                ) : slotMeals.length === 1 ? (
                  <TemplateMealComposerPanel
                    mode="edit"
                    meal={slotMeals[0]!}
                    presentation="capture-draft"
                    onCancel={closeSlot}
                    onSaved={async (meal) => {
                      updateSlotMeals(slotIndex, [meal]);
                      closeSlot();
                    }}
                  />
                ) : (
                  <>
                    <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
                      This legacy Day Plan contains multiple Meal containers in one occasion. They
                      are preserved here for review; new authoring uses one Meal composition.
                    </p>
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
                                setLegacyEditTarget({
                                  slotId,
                                  slotIndex,
                                  mealIndex,
                                  meal,
                                })
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
                    {legacyEditingThisSlot ? (
                      <TemplateMealComposerPanel
                        mode="edit"
                        meal={legacyEditTarget!.meal}
                        presentation="capture-draft"
                        onCancel={closeSlot}
                        onSaved={async (meal) => {
                          const current = template.slots[slotIndex]?.meals ?? [];
                          updateSlotMeals(
                            slotIndex,
                            current.map((existing, index) =>
                              index === legacyEditTarget!.mealIndex ? meal : existing,
                            ),
                          );
                          closeSlot();
                        }}
                      />
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
