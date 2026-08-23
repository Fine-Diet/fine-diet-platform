'use client';

/**
 * NutritionTargetsSetupCard — Log-home unset-target setup trigger.
 *
 * Copy is founder-approved for implementation (governing doc "Final
 * approved setup-card copy") — do not rewrite absent a new product
 * decision:
 *   supporting line: "For best tracking results"
 *   primary line:     "Define your nutrition targets"
 *   CTA:               "Set Up"
 *
 * Placement: directly beneath the Nutrition Density gauge, above the macro
 * reader (rendered by the parent, JournalHeroSection).
 */

export interface NutritionTargetsSetupCardProps {
  onSetUp: () => void;
}

export function NutritionTargetsSetupCard({ onSetUp }: NutritionTargetsSetupCardProps) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border-[1.5px] border-brand-300 px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-brand-50/50 antialiased">For best tracking results</p>
        <p className="mt-0.5 text-base font-semibold text-brand-50 antialiased">Define your nutrition targets</p>
      </div>
      <button
        type="button"
        onClick={onSetUp}
        className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
      >
        Set Up
      </button>
    </div>
  );
}
