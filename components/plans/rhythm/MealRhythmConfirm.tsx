'use client';

/**
 * MealRhythmConfirm — State 2 confirmation screen shown after successful save.
 *
 * Copy:
 *   - Title: "Adjust at anytime"
 *   - Body: "You can always change this later in your profile."
 *   - CTA: "Done"
 */

export interface MealRhythmConfirmProps {
  onDone: () => void;
}

export function MealRhythmConfirm({ onDone }: MealRhythmConfirmProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white antialiased">Adjust at anytime</h2>
        <p className="mt-2 text-sm text-white/55 antialiased">
          You can always change this later in your profile.
        </p>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-full bg-neutral-200 py-3 text-center text-sm font-semibold text-neutral-900 hover:bg-white"
      >
        Done
      </button>
    </div>
  );
}
