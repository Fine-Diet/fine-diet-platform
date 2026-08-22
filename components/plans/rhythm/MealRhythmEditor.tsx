'use client';

/**
 * MealRhythmEditor — edit mode for all 8 occasions.
 * Toggle enablement, label, and target time per occasion.
 * Dark theme: white text, thin dividers, rounded inputs.
 */

import {
  MEAL_OCCASION_KEYS,
  MEAL_SLOT_DEFAULT_LABELS,
  type MealSchedule,
  type MealScheduleSlot,
  type MealSlotKey,
} from '@/lib/plans/types';

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-[#7aa06d]' : 'bg-white/[0.12]'
      } disabled:opacity-40`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}

export interface MealRhythmEditorProps {
  draft: MealSchedule;
  onUpdateSlot: (key: MealSlotKey, patch: Partial<MealScheduleSlot>) => void;
  disabled?: boolean;
}

export function MealRhythmEditor({ draft, onUpdateSlot, disabled }: MealRhythmEditorProps) {
  return (
    <div className="divide-y divide-white/[0.06]">
      {MEAL_OCCASION_KEYS.map((key) => {
        const slot = draft.slots[key];
        return (
          <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <Toggle
              checked={slot.enabled}
              onChange={(value) => onUpdateSlot(key, { enabled: value })}
              disabled={disabled}
            />
            <div className="min-w-0 flex-1">
              <input
                value={slot.label ?? ''}
                placeholder={MEAL_SLOT_DEFAULT_LABELS[key]}
                disabled={disabled}
                onChange={(event) =>
                  onUpdateSlot(key, {
                    label: event.target.value.trim() ? event.target.value : null,
                  })
                }
                className="w-full rounded-full border border-white/10 bg-neutral-900 px-4 py-2 text-sm text-white placeholder-white/30 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <input
              type="time"
              value={slot.target_time}
              disabled={!slot.enabled || disabled}
              onChange={(event) => onUpdateSlot(key, { target_time: event.target.value })}
              className="w-[7rem] shrink-0 rounded-full border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
        );
      })}
    </div>
  );
}
