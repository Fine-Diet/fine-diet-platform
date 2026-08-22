'use client';

/**
 * NutritionTargetsEditor — Adjust surface (Nutrition Targets v1 §7).
 *
 * Calories is the primary, required field. Protein/Carbs/Fat are an
 * optional trio: leave all three blank to keep macro targets unset, or
 * fill in all three to save a macro target set. A partial fill (some but
 * not all three) is rejected by the caller rather than silently treated as
 * 0g for the blank ones — see resolveOptionalMacroInputs in
 * lib/nutrition/targets/save.ts. This module does not assume or derive a
 * macro ratio: every value here is user-entered.
 */

import type { MacroGoals } from '@/lib/journal/types';

export interface NutritionTargetsEditorProps {
  calories: number | null;
  macros: { protein_g: string; carbs_g: string; fat_g: string };
  onChangeCalories: (value: number) => void;
  onChangeMacro: (key: keyof MacroGoals, value: string) => void;
  disabled?: boolean;
}

const inputClass =
  'w-full rounded-2xl border border-white/15 bg-transparent px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/25 disabled:opacity-40';
const labelClass = 'block text-white/45 text-xs font-medium mb-1.5';

export function NutritionTargetsEditor({
  calories,
  macros,
  onChangeCalories,
  onChangeMacro,
  disabled,
}: NutritionTargetsEditorProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Daily calorie target</label>
        <input
          type="number"
          className={inputClass}
          value={calories ?? ''}
          onChange={(e) => onChangeCalories(Number(e.target.value))}
          min={0}
          step={50}
          disabled={disabled}
        />
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-white/35 antialiased mb-2">
          Macros — optional
        </p>
        <p className="text-xs text-white/40 antialiased mb-2 -mt-1">
          Leave all three blank to skip, or fill in all three.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Protein (g)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="—"
              value={macros.protein_g}
              onChange={(e) => onChangeMacro('protein_g', e.target.value)}
              min={0}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={labelClass}>Carbs (g)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="—"
              value={macros.carbs_g}
              onChange={(e) => onChangeMacro('carbs_g', e.target.value)}
              min={0}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={labelClass}>Fat (g)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="—"
              value={macros.fat_g}
              onChange={(e) => onChangeMacro('fat_g', e.target.value)}
              min={0}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
