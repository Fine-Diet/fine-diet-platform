/**
 * Plans — Schedule Resolver (Phase 3)
 *
 * Pure function: given the user's baseline meal schedule and any active
 * program schedule overrides, produce the resolved day template + any
 * conflicts to surface to the user.
 *
 * Contract (locked in Packet 3):
 *   - Profile owns the baseline meal schedule template.
 *   - Programs may override STRUCTURE (require_slots / disallow_slots)
 *     and impose TIMING CONSTRAINTS, but never own concrete clock times.
 *   - The resolver reads target_time ONLY from the profile schedule.
 *   - Conflicts are returned; Plans never silently rewrites target_time.
 *
 * This module is pure, has no Supabase dependencies, and is safe to
 * import on both server and client.
 */

import {
  MEAL_SLOT_KEYS,
  MEAL_SLOT_DEFAULT_LABELS,
  MEAL_SLOT_DEFAULT_TIMES,
  MEAL_SLOT_DEFAULT_ENABLED,
  type MealSchedule,
  type MealScheduleSlot,
  type MealSlotKey,
  type PlanScheduleSnapshot,
  type PlanSlotBlock,
  type ProgramScheduleOverride,
  type ResolvedScheduleSlot,
  type ScheduleConflict,
} from './types';

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default MealSchedule seeded when the user has no key yet. Standard
 * three-meal day, snacks off. Matches the defaults baked into the
 * Profile UI and the MEAL_SLOT_DEFAULT_* exports in types.ts.
 */
export function defaultMealSchedule(now: Date = new Date()): MealSchedule {
  const slots = Object.fromEntries(
    MEAL_SLOT_KEYS.map((key) => [
      key,
      {
        enabled: MEAL_SLOT_DEFAULT_ENABLED[key],
        target_time: MEAL_SLOT_DEFAULT_TIMES[key],
        label: null,
      } satisfies MealScheduleSlot,
    ]),
  ) as Record<MealSlotKey, MealScheduleSlot>;
  return {
    version: 1,
    slots,
    updated_at: now.toISOString(),
  };
}

/**
 * Coerce untrusted JSONB (e.g. people.metadata.meal_schedule) into a
 * valid MealSchedule. Missing or malformed fields fall back to defaults
 * rather than throwing, so the banner and resolver never 500 on stale
 * or partially-seeded data.
 */
export function normalizeMealSchedule(value: unknown): MealSchedule {
  const fallback = defaultMealSchedule();
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<MealSchedule> & {
    slots?: Partial<Record<MealSlotKey, unknown>>;
  };
  const slotsIn = v.slots ?? {};

  const slots = Object.fromEntries(
    MEAL_SLOT_KEYS.map((key) => {
      const rawSlot = slotsIn[key];
      const d = fallback.slots[key];
      if (!rawSlot || typeof rawSlot !== 'object') return [key, d];
      const r = rawSlot as Partial<MealScheduleSlot>;
      const enabled = typeof r.enabled === 'boolean' ? r.enabled : d.enabled;
      const target_time = isValidHHmm(r.target_time) ? (r.target_time as string) : d.target_time;
      const label = typeof r.label === 'string' || r.label === null ? r.label ?? null : null;
      return [key, { enabled, target_time, label } satisfies MealScheduleSlot];
    }),
  ) as Record<MealSlotKey, MealScheduleSlot>;

  return {
    version: 1,
    slots,
    updated_at:
      typeof v.updated_at === 'string' && v.updated_at.length > 0
        ? v.updated_at
        : fallback.updated_at,
  };
}

// ============================================================================
// Time helpers
// ============================================================================

const HHmm_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHmm(s: unknown): s is string {
  return typeof s === 'string' && HHmm_RE.test(s);
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map((x) => Number(x));
  return h * 60 + m;
}

export function minutesToHHmm(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function slotBlockForTime(hhmm: string): PlanSlotBlock {
  const mins = hhmmToMinutes(hhmm);
  // < 11:30 morning, < 17:00 midday, else evening
  if (mins < 11 * 60 + 30) return 'morning';
  if (mins < 17 * 60) return 'midday';
  return 'evening';
}

// ============================================================================
// Override merging
// ============================================================================

interface MergedOverrides {
  require_slots: Set<MealSlotKey>;
  disallow_slots: Set<MealSlotKey>;
  constraints: {
    no_earlier_than_min: number | null;
    no_later_than_min: number | null;
    min_gap_minutes: number | null;
    max_eating_window_minutes: number | null;
  };
}

function mergeOverrides(overrides: ProgramScheduleOverride[]): MergedOverrides {
  const require_slots = new Set<MealSlotKey>();
  const disallow_slots = new Set<MealSlotKey>();
  let no_earlier_than_min: number | null = null;
  let no_later_than_min: number | null = null;
  let min_gap_minutes: number | null = null;
  let max_eating_window_minutes: number | null = null;

  for (const ov of overrides) {
    for (const k of ov.require_slots ?? []) require_slots.add(k);
    for (const k of ov.disallow_slots ?? []) disallow_slots.add(k);
    const c = ov.constraints ?? null;
    if (!c) continue;
    if (isValidHHmm(c.no_earlier_than)) {
      const m = hhmmToMinutes(c.no_earlier_than);
      no_earlier_than_min = no_earlier_than_min === null ? m : Math.max(no_earlier_than_min, m);
    }
    if (isValidHHmm(c.no_later_than)) {
      const m = hhmmToMinutes(c.no_later_than);
      no_later_than_min = no_later_than_min === null ? m : Math.min(no_later_than_min, m);
    }
    if (typeof c.min_gap_minutes === 'number' && c.min_gap_minutes >= 0) {
      min_gap_minutes =
        min_gap_minutes === null ? c.min_gap_minutes : Math.max(min_gap_minutes, c.min_gap_minutes);
    }
    if (typeof c.max_eating_window_minutes === 'number' && c.max_eating_window_minutes > 0) {
      max_eating_window_minutes =
        max_eating_window_minutes === null
          ? c.max_eating_window_minutes
          : Math.min(max_eating_window_minutes, c.max_eating_window_minutes);
    }
  }

  return {
    require_slots,
    disallow_slots,
    constraints: {
      no_earlier_than_min,
      no_later_than_min,
      min_gap_minutes,
      max_eating_window_minutes,
    },
  };
}

// ============================================================================
// Public API
// ============================================================================

export interface ResolveMealScheduleInput {
  profile_schedule: MealSchedule;
  program_overrides: ProgramScheduleOverride[];
  /** Optional eating-window soft constraint. HH:mm. */
  eating_window_start?: string | null;
  /** Optional eating-window soft constraint. HH:mm. */
  eating_window_end?: string | null;
}

export interface ResolveMealScheduleResult {
  resolved_slots: ResolvedScheduleSlot[];
  conflicts: ScheduleConflict[];
}

/**
 * Resolve the user's baseline schedule against any active program
 * overrides into an ordered day template. Implements the override logic
 * locked in Packet 3 §4:
 *
 *   Step 1 — merge overrides (union require/disallow, most-restrictive constraints)
 *   Step 2 — resolve enabled set using the override table
 *   Step 3 — read times from profile only; program_required fallback to defaults
 *   Step 4 — validate constraints; emit conflicts; NEVER rewrite target_time
 *   Step 5 — chronological ordering with slot_block derived from time-of-day
 */
export function resolveMealSchedule(
  input: ResolveMealScheduleInput,
): ResolveMealScheduleResult {
  const merged = mergeOverrides(input.program_overrides);
  const conflicts: ScheduleConflict[] = [];

  // Step 2 + 3: resolve enabled set, read times from profile only.
  const entries: ResolvedScheduleSlot[] = [];
  for (const key of MEAL_SLOT_KEYS) {
    const profileSlot = input.profile_schedule.slots[key];
    const required = merged.require_slots.has(key);
    const disallowed = merged.disallow_slots.has(key);

    let enabled: boolean;
    let source: ResolvedScheduleSlot['source'];

    if (required && disallowed) {
      enabled = true;
      source = 'program_required';
      conflicts.push({
        kind: 'required_vs_disabled',
        slot_key: key,
        message: `One program requires ${labelFor(key, profileSlot.label)} while another disallows it. The required slot wins.`,
        suggested_adjustment: null,
      });
    } else if (required) {
      enabled = true;
      source = profileSlot.enabled ? 'profile' : 'program_required';
    } else if (disallowed) {
      if (profileSlot.enabled) {
        conflicts.push({
          kind: 'required_vs_disabled',
          slot_key: key,
          message: `You have ${labelFor(key, profileSlot.label)} enabled but a program disallows it. The program wins for this plan.`,
          suggested_adjustment: { enabled: false },
        });
      }
      enabled = false;
      source = 'program_disallowed';
    } else {
      enabled = profileSlot.enabled;
      source = 'profile';
    }

    // Step 3: times always come from profile; fall back to default only
    // when a program-required slot has no user time yet.
    const target_time =
      !profileSlot.enabled && source === 'program_required'
        ? MEAL_SLOT_DEFAULT_TIMES[key]
        : profileSlot.target_time;

    entries.push({
      key,
      enabled,
      target_time,
      label: labelFor(key, profileSlot.label),
      slot_block: slotBlockForTime(target_time),
      source,
    });
  }

  // Step 4: validate constraints (enabled slots only), emit conflicts.
  const enabledOrdered = entries
    .filter((e) => e.enabled)
    .slice()
    .sort((a, b) => hhmmToMinutes(a.target_time) - hhmmToMinutes(b.target_time));

  const { no_earlier_than_min, no_later_than_min, min_gap_minutes, max_eating_window_minutes } =
    merged.constraints;

  for (const s of enabledOrdered) {
    const t = hhmmToMinutes(s.target_time);
    if (no_earlier_than_min !== null && t < no_earlier_than_min) {
      const suggested = minutesToHHmm(no_earlier_than_min);
      conflicts.push({
        kind: 'earliest',
        slot_key: s.key,
        message: `${s.label} at ${s.target_time} is earlier than the program's ${suggested} limit.`,
        suggested_adjustment: { target_time: suggested },
      });
    }
    if (no_later_than_min !== null && t > no_later_than_min) {
      const suggested = minutesToHHmm(no_later_than_min);
      conflicts.push({
        kind: 'latest',
        slot_key: s.key,
        message: `${s.label} at ${s.target_time} is later than the program's ${suggested} limit.`,
        suggested_adjustment: { target_time: suggested },
      });
    }
  }

  if (min_gap_minutes !== null) {
    for (let i = 1; i < enabledOrdered.length; i++) {
      const prev = enabledOrdered[i - 1];
      const cur = enabledOrdered[i];
      const gap = hhmmToMinutes(cur.target_time) - hhmmToMinutes(prev.target_time);
      if (gap < min_gap_minutes) {
        const suggested = minutesToHHmm(hhmmToMinutes(prev.target_time) + min_gap_minutes);
        conflicts.push({
          kind: 'min_gap',
          slot_key: cur.key,
          message: `${cur.label} is only ${gap}m after ${prev.label}; the program asks for at least ${min_gap_minutes}m between meals.`,
          suggested_adjustment: { target_time: suggested },
        });
      }
    }
  }

  if (max_eating_window_minutes !== null && enabledOrdered.length >= 2) {
    const first = enabledOrdered[0];
    const last = enabledOrdered[enabledOrdered.length - 1];
    const span = hhmmToMinutes(last.target_time) - hhmmToMinutes(first.target_time);
    if (span > max_eating_window_minutes) {
      const suggested = minutesToHHmm(hhmmToMinutes(last.target_time) - max_eating_window_minutes);
      conflicts.push({
        kind: 'max_window',
        slot_key: first.key,
        message: `Your eating window is ${span}m (first to last meal); the program caps it at ${max_eating_window_minutes}m.`,
        suggested_adjustment: { target_time: suggested },
      });
    }
  }

  // Soft eating_window constraint (user-owned, same behavior as program).
  if (isValidHHmm(input.eating_window_start) && isValidHHmm(input.eating_window_end)) {
    const ws = hhmmToMinutes(input.eating_window_start);
    const we = hhmmToMinutes(input.eating_window_end);
    for (const s of enabledOrdered) {
      const t = hhmmToMinutes(s.target_time);
      if (t < ws) {
        conflicts.push({
          kind: 'eating_window',
          slot_key: s.key,
          message: `${s.label} at ${s.target_time} is before your eating window opens at ${input.eating_window_start}.`,
          suggested_adjustment: { target_time: input.eating_window_start },
        });
      } else if (t > we) {
        conflicts.push({
          kind: 'eating_window',
          slot_key: s.key,
          message: `${s.label} at ${s.target_time} is after your eating window closes at ${input.eating_window_end}.`,
          suggested_adjustment: { target_time: input.eating_window_end },
        });
      }
    }
  }

  // Step 5: chronological ordering across enabled entries; disabled
  // entries keep their natural key order at the end so consumers can
  // still inspect them without running the resolver twice.
  const enabledSorted = entries
    .filter((e) => e.enabled)
    .slice()
    .sort((a, b) => hhmmToMinutes(a.target_time) - hhmmToMinutes(b.target_time));
  const disabledOrdered = entries.filter((e) => !e.enabled);
  const resolved_slots = [...enabledSorted, ...disabledOrdered];

  return { resolved_slots, conflicts };
}

function labelFor(key: MealSlotKey, override: string | null): string {
  if (override && override.trim().length > 0) return override.trim();
  return MEAL_SLOT_DEFAULT_LABELS[key];
}

/** Convenience: build the full PlanScheduleSnapshot block for input_snapshot_json. */
export function buildPlanScheduleSnapshot(
  profile_schedule: MealSchedule,
  program_overrides: ProgramScheduleOverride[],
  eating_window_start?: string | null,
  eating_window_end?: string | null,
): PlanScheduleSnapshot {
  const { resolved_slots, conflicts } = resolveMealSchedule({
    profile_schedule,
    program_overrides,
    eating_window_start,
    eating_window_end,
  });
  return { profile_schedule, resolved_slots, conflicts };
}
