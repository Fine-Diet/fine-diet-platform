'use client';

/**
 * SlotEditor
 *
 * Minimal inline editor for a PlannedMeal. Allows:
 *   - renaming the meal
 *   - changing meal_type
 *   - editing totals (calories, protein_g, carbs_g, fat_g)
 *
 * More advanced editing (per-item edits, food_object attach, restaurant
 * attach) is out of scope for Phase 2; this editor is designed to cover
 * the "user tweaks the stub plan" path the core UI exercises.
 *
 * On save, calls onSave with the patched PlannedMeal fields. Parent
 * component translates the save to a planService.updateMeal call.
 */

import { useState } from 'react';
import type { PlannedMeal } from '@/lib/plans';

interface SlotEditorProps {
  meal: PlannedMeal;
  onSave: (patch: {
    name: string;
    meal_type: PlannedMeal['meal_type'];
    payload: PlannedMeal['payload'];
  }) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

type MealTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type PayloadShape = {
  items?: Array<Record<string, unknown>>;
  totals?: Partial<MealTotals>;
  notes_md?: string;
};

function readTotals(meal: PlannedMeal): MealTotals {
  const totals = (meal.payload as PayloadShape).totals ?? {};
  return {
    calories: Number(totals.calories ?? 0),
    protein_g: Number(totals.protein_g ?? 0),
    carbs_g: Number(totals.carbs_g ?? 0),
    fat_g: Number(totals.fat_g ?? 0),
  };
}

export function SlotEditor({ meal, onSave, onCancel, busy }: SlotEditorProps) {
  const [name, setName] = useState<string>(meal.name ?? '');
  const [mealType, setMealType] = useState<PlannedMeal['meal_type']>(meal.meal_type);
  const [totals, setTotals] = useState<MealTotals>(readTotals(meal));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const base = (meal.payload as PayloadShape) ?? {};
    const nextPayload: PlannedMeal['payload'] = {
      ...base,
      totals,
      items: base.items ?? [],
    } as PlannedMeal['payload'];
    await onSave({ name, meal_type: mealType, payload: nextPayload });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white/[0.06] p-4 space-y-3"
    >
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
          Meal name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
          Type
        </label>
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value as PlannedMeal['meal_type'])}
          className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
        >
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).map((k) => (
          <div key={k}>
            <label className="block text-[11px] uppercase tracking-wider text-white/40 antialiased mb-1">
              {k.replace('_g', ' (g)')}
            </label>
            <input
              type="number"
              min={0}
              value={totals[k]}
              onChange={(e) =>
                setTotals((t) => ({ ...t, [k]: Number(e.target.value) }))
              }
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white antialiased px-3 py-2 focus:outline-none focus:border-denim-400"
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-white/30 antialiased">
        Totals drive NDS projection. Per-item edits are coming in a later phase.
      </p>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-denim-500/20 hover:bg-denim-500/30 disabled:bg-white/[0.04] disabled:text-white/40 transition-colors px-4 py-2 text-sm font-medium text-denim-200 antialiased"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-colors antialiased"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
