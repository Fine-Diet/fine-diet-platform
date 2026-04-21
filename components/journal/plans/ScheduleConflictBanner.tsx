'use client';

/**
 * ScheduleConflictBanner
 *
 * Surfaces schedule conflicts produced by lib/plans/scheduleResolver.ts.
 * Programs may override slot structure and impose timing constraints,
 * but Plans never silently rewrites the user's meal times. When the
 * resolver detects a conflict it emits a message + optional suggested
 * adjustment; this banner shows both with an explicit "Apply" action
 * so the user keeps ownership of their clock.
 *
 * The `onApply` callback receives the conflict; the parent is
 * responsible for mutating people.metadata.meal_schedule. On success
 * the parent should refetch the live snapshot so the banner recomputes.
 */

import { useState } from 'react';
import type { ScheduleConflict } from '@/lib/plans';

interface ScheduleConflictBannerProps {
  conflicts: ScheduleConflict[];
  onApply?: (conflict: ScheduleConflict) => void | Promise<void>;
  busy?: boolean;
}

export function ScheduleConflictBanner({
  conflicts,
  onApply,
  busy,
}: ScheduleConflictBannerProps) {
  const [expanded, setExpanded] = useState(false);
  if (conflicts.length === 0) return null;

  const shown = expanded ? conflicts : conflicts.slice(0, 2);

  return (
    <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-amber-200 antialiased">
          Schedule conflicts
        </p>
        <span className="text-[11px] text-amber-100/60 antialiased">
          {conflicts.length} issue{conflicts.length === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="space-y-2">
        {shown.map((c, i) => {
          const suggested = c.suggested_adjustment;
          const canApply = Boolean(onApply && suggested && c.slot_key);
          return (
            <li
              key={`${c.kind}-${c.slot_key ?? 'none'}-${i}`}
              className="rounded-xl bg-amber-500/5 p-3 flex items-start justify-between gap-3"
            >
              <p className="text-xs text-amber-100/90 antialiased leading-relaxed">
                {c.message}
                {suggested?.target_time && (
                  <span className="block text-[11px] text-amber-100/60 mt-1">
                    Suggested: move to {suggested.target_time}
                  </span>
                )}
                {suggested?.enabled === false && (
                  <span className="block text-[11px] text-amber-100/60 mt-1">
                    Suggested: disable this slot in Profile
                  </span>
                )}
              </p>
              {canApply && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApply?.(c)}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 disabled:bg-white/[0.04] disabled:text-white/40 text-[11px] font-medium text-amber-200 antialiased transition-colors"
                >
                  Apply
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {conflicts.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-amber-100/60 hover:text-amber-100/90 antialiased"
        >
          {expanded ? 'Show fewer' : `Show ${conflicts.length - 2} more`}
        </button>
      )}
    </div>
  );
}
