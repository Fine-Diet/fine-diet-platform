'use client';

/**
 * ProfileDefaultsBanner
 *
 * Shows the user which profile defaults will be used when they generate
 * a plan (or were used when the current plan was generated). Links to
 * /journal/profile when required inputs are missing.
 *
 * Reads the *live* PlanInputSnapshot (GET /api/journal/plans/snapshot)
 * rather than the frozen `plans.input_snapshot_json` column so profile
 * edits (DOB, height, weight) are reflected immediately. Also takes a
 * `display` prop with the user's preferred height/weight units so the
 * canonical cm/kg values render in inches/lb when that's what they
 * entered in Profile.
 *
 * Enforcement (18+ gate, missing dob) is still handled server-side by
 * assertEighteenPlus.
 */

import Link from 'next/link';
import {
  formatHeightForDisplay,
  formatWeightForDisplay,
  type PlanInputSnapshot,
  type PlanDisplayPrefs,
} from '@/lib/plans';

interface ProfileDefaultsBannerProps {
  snapshot: PlanInputSnapshot | null;
  display: PlanDisplayPrefs | null;
  canGenerate: boolean;
  missingReasons: string[];
}

export function ProfileDefaultsBanner({
  snapshot,
  display,
  canGenerate,
  missingReasons,
}: ProfileDefaultsBannerProps) {
  if (!snapshot) {
    return (
      <div className="rounded-2xl bg-white/[0.04] p-5">
        <p className="text-sm text-white/60 antialiased">Loading your defaults…</p>
      </div>
    );
  }

  const { body, preferences, targets } = snapshot;
  const ageLabel = body.age_years === null ? 'not set' : `${body.age_years}y`;
  const heightLabel = formatHeightForDisplay(
    body.height_cm,
    display?.height_display_unit ?? 'in',
  );
  const weightLabel = formatWeightForDisplay(
    body.weight_kg,
    display?.weight_display_unit ?? 'lb',
  );
  const diningLabel = preferences.dining_out_frequency ?? 'not set';
  const calorieLabel =
    targets.daily_calorie_goal === null ? '—' : `${Math.round(targets.daily_calorie_goal)} cal`;

  return (
    <div className="rounded-2xl bg-white/[0.04] p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-white antialiased">Your planning defaults</p>
        <Link
          href="/journal/profile"
          className="text-xs text-denim-400 hover:text-denim-300 transition-colors antialiased"
        >
          Edit →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-white/50 antialiased">Age</span>
          <span className="text-white/80 antialiased">{ageLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50 antialiased">Sex</span>
          <span className="text-white/80 antialiased">{body.sex ?? 'not set'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50 antialiased">Height</span>
          <span className="text-white/80 antialiased">{heightLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50 antialiased">Weight</span>
          <span className="text-white/80 antialiased">{weightLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50 antialiased">Calories/day</span>
          <span className="text-white/80 antialiased">{calorieLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50 antialiased">Dine out</span>
          <span className="text-white/80 antialiased">{diningLabel}</span>
        </div>
      </div>

      {!canGenerate && missingReasons.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mt-2">
          <p className="text-xs font-medium text-amber-200 antialiased mb-1">
            Complete your profile to generate plans
          </p>
          <ul className="text-xs text-amber-100/80 antialiased list-disc pl-4 space-y-0.5">
            {missingReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
