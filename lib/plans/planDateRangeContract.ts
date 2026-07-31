/**
 * Package 4 — shared plan date-range contract.
 *
 * Used by manual create, generation inputs, and plan updates. Rejects
 * malformed or inverted ranges; does not silently clamp or swap bounds.
 */

import { addDaysToDateKey, isRealCalendarDateKey } from './planDateRange';
import type { PlanShape } from './types';

export type PlanDateRangeValidation =
  | { ok: true; start_date: string; end_date: string | null }
  | { ok: false; error: string };

export function validatePlanDateRange(args: {
  start_date: unknown;
  end_date?: unknown;
  plan_shape: PlanShape;
  /**
   * When true (AI generate), a missing week end_date is allowed — the
   * generator/persist path supplies the canonical start+6 fallback.
   * When false (manual create / explicit patch), week may omit end_date
   * (null) but any supplied end must be a valid non-inverted span.
   */
  allowMissingWeekEnd?: boolean;
}): PlanDateRangeValidation {
  if (!isRealCalendarDateKey(args.start_date)) {
    return { ok: false, error: 'start_date must be a real calendar date (YYYY-MM-DD).' };
  }
  const start_date = args.start_date;

  const rawEnd = args.end_date;
  if (rawEnd === undefined || rawEnd === null || rawEnd === '') {
    if (args.plan_shape === 'day') {
      return { ok: true, start_date, end_date: null };
    }
    if (args.plan_shape === 'week' && args.allowMissingWeekEnd) {
      return { ok: true, start_date, end_date: null };
    }
    // Manual create may omit end_date; generation resolves week fallback later.
    return { ok: true, start_date, end_date: null };
  }

  if (!isRealCalendarDateKey(rawEnd)) {
    return { ok: false, error: 'end_date must be a real calendar date (YYYY-MM-DD) or null.' };
  }
  const end_date = rawEnd;

  if (end_date < start_date) {
    return { ok: false, error: 'end_date must be on or after start_date.' };
  }

  if (args.plan_shape === 'day' && end_date !== start_date) {
    return {
      ok: false,
      error: 'Day plans require end_date to be null or equal to start_date.',
    };
  }

  if (args.plan_shape === 'week') {
    const expected = addDaysToDateKey(start_date, 6);
    // Explicit week spans must be non-inverted; canonical 7-day is preferred
    // but multi-day-within-week overrides are allowed only when end >= start.
    // Reject spans longer than a calendar week when shape is week? Brief says:
    // "for week, when explicitly supplied, require a valid non-inverted span
    // and preserve the canonical 7-day fallback for generated plans."
    // So non-inverted is the hard rule; we don't force exactly 7 days on
    // manual edits, but document expected canonical length.
    void expected;
  }

  return { ok: true, start_date, end_date };
}

/** Canonical generated-week end when callers omit end_date. */
export function canonicalWeekEndDate(start_date: string): string {
  return addDaysToDateKey(start_date, 6);
}
