'use client';

/**
 * NutritionTargetsSummary — State 1 review view.
 *
 * Presents the suggested maintenance-calorie estimate transparently and
 * lets the user own the final target (Nutrition Targets v1 core product
 * principle + §5 confirmation UX): "Looks Good" or "Adjust". Never presents
 * a deficit/surplus — maintenance estimate only.
 */

export interface NutritionTargetsSummaryProps {
  maintenanceCalories: number | null;
  onLooksGood: () => void;
  onAdjust: () => void;
  saving?: boolean;
  error?: string;
}

export function NutritionTargetsSummary({
  maintenanceCalories,
  onLooksGood,
  onAdjust,
  saving,
  error,
}: NutritionTargetsSummaryProps) {
  return (
    <div className="flex flex-col">
      <div>
        <h2 className="text-[1.65rem] font-light leading-tight tracking-[-0.02em] text-white antialiased sm:text-[1.85rem]">
          Your estimated daily energy need
        </h2>
        <p className="mt-2 text-sm text-white/50 antialiased">
          Based on your age, height, weight and activity. This is a starting point — you can adjust it anytime.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-white/15 px-5 py-6 text-center">
        {maintenanceCalories != null ? (
          <>
            <p className="text-5xl font-regular leading-none text-white antialiased">
              {maintenanceCalories.toLocaleString()}
            </p>
            <p className="mt-2 text-sm font-semibold text-white/45 antialiased">calories / day</p>
          </>
        ) : (
          <p className="text-sm text-white/45 antialiased">
            We couldn&apos;t estimate a target from your profile yet — you can still set one manually.
          </p>
        )}
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <button
        type="button"
        onClick={onLooksGood}
        disabled={saving || maintenanceCalories == null}
        className="mt-8 w-full rounded-2xl bg-neutral-200 py-3.5 text-center text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Looks Good'}
      </button>

      <button
        type="button"
        onClick={onAdjust}
        disabled={saving}
        className="mt-3 w-full rounded-2xl border border-white/15 py-3.5 text-center text-sm font-semibold text-white hover:border-white/30 disabled:opacity-40"
      >
        Adjust
      </button>
    </div>
  );
}
