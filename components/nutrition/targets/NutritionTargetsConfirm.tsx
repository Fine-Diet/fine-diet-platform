'use client';

/**
 * NutritionTargetsConfirm — post-save confirmation (mirrors
 * MealRhythmConfirm's composition: title/body upper, Done anchored bottom).
 */

export interface NutritionTargetsConfirmProps {
  onDone: () => void;
}

export function NutritionTargetsConfirm({ onDone }: NutritionTargetsConfirmProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="pt-6">
        <h2 className="text-[1.65rem] font-light leading-tight tracking-[-0.02em] text-white antialiased sm:text-[1.85rem]">
          Nutrition targets saved
        </h2>
        <p className="mt-3 max-w-[22rem] text-sm leading-relaxed text-white/50 antialiased">
          You can always change this later in your profile.
        </p>
      </div>

      <div className="mt-auto pt-16">
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-2xl bg-neutral-200 py-3.5 text-center text-sm font-semibold text-neutral-900 hover:bg-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}
