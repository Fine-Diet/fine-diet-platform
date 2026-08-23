'use client';

/**
 * NutritionTargetsActivityStep — progressive activity confirmation.
 *
 * Only shown when activity_baseline is not yet known (Nutrition Targets v1
 * §3). Reuses the canonical activity_baseline enum/labels already used in
 * Profile → Health & Lifestyle (pages/journal/profile.tsx ACTIVITY_OPTIONS)
 * rather than inventing a second activity taxonomy or label set.
 */

import { ACTIVITY_BASELINE_VALUES, type NutritionTargetsActivityBaseline } from './useNutritionTargetsController';

const ACTIVITY_LABELS: Record<NutritionTargetsActivityBaseline, string> = {
  sedentary: 'Sedentary',
  lightly_active: 'Lightly active',
  moderately_active: 'Moderately active',
  very_active: 'Very active',
  athlete: 'Athlete / highly active',
};

// Log/Profile Health section only offers these four; athlete is accepted by
// onboarding but not yet surfaced as a user-facing choice here.
const SELECTABLE_ACTIVITY_VALUES = ACTIVITY_BASELINE_VALUES.filter((v) => v !== 'athlete');

export interface NutritionTargetsActivityStepProps {
  onChoose: (activity: NutritionTargetsActivityBaseline) => void;
  disabled?: boolean;
}

export function NutritionTargetsActivityStep({ onChoose, disabled }: NutritionTargetsActivityStepProps) {
  return (
    <div className="flex flex-col">
      <div>
        <h2 className="text-[1.65rem] font-light leading-tight tracking-[-0.02em] text-white antialiased sm:text-[1.85rem]">
          How active is a typical week?
        </h2>
        <p className="mt-2 text-sm text-white/50 antialiased">
          This helps Fine Diet suggest a daily calorie target based on your age, height and weight.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-2.5">
        {SELECTABLE_ACTIVITY_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(value)}
            className="w-full rounded-2xl border border-white/15 px-4 py-3.5 text-left text-[15px] font-medium text-white transition-colors hover:border-white/40 disabled:opacity-40"
          >
            {ACTIVITY_LABELS[value]}
          </button>
        ))}
      </div>
    </div>
  );
}
