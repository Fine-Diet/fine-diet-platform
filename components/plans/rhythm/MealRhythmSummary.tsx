'use client';

/**
 * MealRhythmSummary — State 1 READ view (prototype-aligned).
 *
 * Shows:
 *  - Title: "Here is your assumed rhythm"
 *  - Subtitle: "You can adjust as needed"
 *  - Enabled occasions only, sorted chronologically by target_time
 *  - Label left, 12h time right
 *  - Summary box: "Based on your selection" / count line + outline "Edit" pill
 *  - Primary CTA: "Looks Good"
 */

import { useMemo } from 'react';
import {
  MEAL_OCCASION_KEYS,
  MEAL_SLOT_DEFAULT_LABELS,
  type MealSchedule,
  type MealSlotKey,
} from '@/lib/plans/types';
import {
  formatMealRhythmCounts,
  getMealRhythmPresentationCounts,
} from '@/lib/plans/mealRhythm/presentationCounts';

function formatTimeLabel(hhmm: string): string {
  const [hourRaw, minuteRaw] = hhmm.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return hhmm;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function slotTimeMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface MealRhythmSummaryProps {
  schedule: MealSchedule;
  onLooksGood: () => void;
  onEdit: () => void;
  saving?: boolean;
  error?: string;
}

export function MealRhythmSummary({
  schedule,
  onLooksGood,
  onEdit,
  saving,
  error,
}: MealRhythmSummaryProps) {
  const enabledSorted = useMemo<MealSlotKey[]>(() => {
    return MEAL_OCCASION_KEYS.filter((key) => schedule.slots[key].enabled).sort(
      (a, b) => slotTimeMinutes(schedule.slots[a].target_time) - slotTimeMinutes(schedule.slots[b].target_time),
    );
  }, [schedule]);

  const counts = getMealRhythmPresentationCounts(schedule);
  const countLabel = formatMealRhythmCounts(counts);

  return (
    <div className="flex flex-col">
      <div>
        <h2 className="text-[1.65rem] font-light leading-tight tracking-[-0.02em] text-white antialiased sm:text-[1.85rem]">
          Here is your assumed rhythm
        </h2>
        <p className="mt-2 text-sm text-white/50 antialiased">You can adjust as needed</p>
      </div>

      {enabledSorted.length === 0 ? (
        <p className="mt-8 text-sm text-white/45">No occasions are enabled. Use Edit to turn some on.</p>
      ) : (
        <div className="mt-8 divide-y divide-white/[0.08]">
          {enabledSorted.map((key) => {
            const slot = schedule.slots[key];
            const label = slot.label?.trim() || MEAL_SLOT_DEFAULT_LABELS[key];
            return (
              <div key={key} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                <span className="text-[15px] font-medium text-white">{label}</span>
                <span className="text-[15px] text-white/65">
                  {formatTimeLabel(slot.target_time)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary box — outlined, Edit as outline pill */}
      <div className="mt-8 flex items-center justify-between rounded-xl border border-white/15 px-4 py-3.5">
        <div>
          <p className="text-[11px] leading-snug text-white/45">Based on your selection</p>
          <p className="mt-0.5 text-[15px] font-medium text-white">{countLabel}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          disabled={saving}
          className="rounded-full border border-white/40 px-4 py-1.5 text-sm font-medium text-white hover:border-white/70 disabled:opacity-40"
        >
          Edit
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <button
        type="button"
        onClick={onLooksGood}
        disabled={saving}
        className="mt-8 w-full rounded-2xl bg-neutral-200 py-3.5 text-center text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Looks Good'}
      </button>
    </div>
  );
}
