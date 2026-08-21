/**
 * Meal Schedule v1 ↔ v2 compatibility boundary.
 *
 * Dual-reads legacy six-key schedules and current eight-occasion schedules.
 * Normalizes current in-memory behavior to v2. Reading never mutates Profile.
 */

import {
  LEGACY_MEAL_SLOT_DEFAULT_ENABLED,
  LEGACY_MEAL_SLOT_DEFAULT_TIMES,
  LEGACY_MEAL_SLOT_KEYS,
  LEGACY_SLOT_TO_OCCASION,
  MEAL_OCCASION_DEFAULT_ENABLED,
  MEAL_OCCASION_DEFAULT_LABELS,
  MEAL_OCCASION_DEFAULT_TIMES,
  LEGACY_SLOT_MEAL_TYPE,
  MEAL_OCCASION_KEYS,
  OCCASION_TO_LEGACY_SLOT,
  type LegacyMealSlotKey,
  type MealOccasionKey,
  type MealSchedule,
  type MealScheduleSlot,
  type MealScheduleV1,
  type PlannedMealType,
  type ProgramScheduleOverride,
  type ProgramScheduleOverrideV1,
} from './types';

const HHmm_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHmm(s: unknown): s is string {
  return typeof s === 'string' && HHmm_RE.test(s);
}

export function isLegacyMealSlotKey(value: unknown): value is LegacyMealSlotKey {
  return typeof value === 'string' && (LEGACY_MEAL_SLOT_KEYS as readonly string[]).includes(value);
}

export function isMealOccasionKey(value: unknown): value is MealOccasionKey {
  return typeof value === 'string' && (MEAL_OCCASION_KEYS as readonly string[]).includes(value);
}

/** Accepts persisted/journal/query keys in either v1 or v2 form. */
export function isScheduleSlotKey(
  value: unknown,
): value is LegacyMealSlotKey | MealOccasionKey {
  return isLegacyMealSlotKey(value) || isMealOccasionKey(value);
}

/** Map legacy or current keys to the canonical v2 occasion. */
export function toMealOccasionKey(
  key: LegacyMealSlotKey | MealOccasionKey,
): MealOccasionKey {
  if (isMealOccasionKey(key)) return key;
  return LEGACY_SLOT_TO_OCCASION[key];
}

export function coerceMealOccasionKey(value: unknown): MealOccasionKey | null {
  if (!isScheduleSlotKey(value)) return null;
  return toMealOccasionKey(value);
}

function readSlot(
  raw: unknown,
  fallback: MealScheduleSlot,
): MealScheduleSlot {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const r = raw as Partial<MealScheduleSlot>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : fallback.enabled,
    target_time: isValidHHmm(r.target_time) ? r.target_time : fallback.target_time,
    label: typeof r.label === 'string' || r.label === null ? r.label ?? null : null,
  };
}

export function defaultMealScheduleV1(now: Date = new Date()): MealScheduleV1 {
  const slots = Object.fromEntries(
    LEGACY_MEAL_SLOT_KEYS.map((key) => [
      key,
      {
        enabled: LEGACY_MEAL_SLOT_DEFAULT_ENABLED[key],
        target_time: LEGACY_MEAL_SLOT_DEFAULT_TIMES[key],
        label: null,
      } satisfies MealScheduleSlot,
    ]),
  ) as Record<LegacyMealSlotKey, MealScheduleSlot>;
  return {
    version: 1,
    slots,
    updated_at: now.toISOString(),
  };
}

export function defaultMealSchedule(now: Date = new Date()): MealSchedule {
  const slots = Object.fromEntries(
    MEAL_OCCASION_KEYS.map((key) => [
      key,
      {
        enabled: MEAL_OCCASION_DEFAULT_ENABLED[key],
        target_time: MEAL_OCCASION_DEFAULT_TIMES[key],
        label: null,
      } satisfies MealScheduleSlot,
    ]),
  ) as Record<MealOccasionKey, MealScheduleSlot>;
  return {
    version: 2,
    slots,
    updated_at: now.toISOString(),
  };
}

export function isMealScheduleV1Shape(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const slots = (value as { slots?: unknown }).slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return false;
  const keys = Object.keys(slots as object);
  if (keys.length === 0) return false;
  const hasLegacy = keys.some((k) => isLegacyMealSlotKey(k));
  const hasOccasion = keys.some((k) => isMealOccasionKey(k));
  const version = (value as { version?: unknown }).version;
  if (version === 1) return true;
  if (version === 2) return false;
  // Missing version: treat as v1 when legacy keys dominate and no occasion keys.
  return hasLegacy && !hasOccasion;
}

export function isMealScheduleV2Shape(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const version = (value as { version?: unknown }).version;
  if (version === 2) return true;
  const slots = (value as { slots?: unknown }).slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return false;
  const keys = Object.keys(slots as object);
  return keys.some((k) => isMealOccasionKey(k)) && !keys.some((k) => isLegacyMealSlotKey(k));
}

/**
 * Convert a complete v1 schedule to v2 without writing.
 * Preserves enabled, target_time, label, and updated_at for all six legacy slots.
 */
export function mealScheduleV1ToV2(v1: MealScheduleV1): MealSchedule {
  const base = defaultMealSchedule(
    v1.updated_at ? new Date(v1.updated_at) : new Date(),
  );
  for (const legacyKey of LEGACY_MEAL_SLOT_KEYS) {
    const occasion = LEGACY_SLOT_TO_OCCASION[legacyKey];
    const slot = v1.slots[legacyKey];
    if (!slot) continue;
    base.slots[occasion] = {
      enabled: slot.enabled === true,
      target_time: isValidHHmm(slot.target_time)
        ? slot.target_time
        : MEAL_OCCASION_DEFAULT_TIMES[occasion],
      label: typeof slot.label === 'string' ? slot.label : null,
    };
  }
  base.updated_at = v1.updated_at;
  base.version = 2;
  return base;
}

function normalizeMealScheduleV1(value: unknown, now: Date): MealScheduleV1 {
  const fallback = defaultMealScheduleV1(now);
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<MealScheduleV1> & {
    slots?: Partial<Record<LegacyMealSlotKey, unknown>>;
  };
  const slotsIn = v.slots ?? {};
  const slots = Object.fromEntries(
    LEGACY_MEAL_SLOT_KEYS.map((key) => [
      key,
      readSlot(slotsIn[key], fallback.slots[key]),
    ]),
  ) as Record<LegacyMealSlotKey, MealScheduleSlot>;
  return {
    version: 1,
    slots,
    updated_at:
      typeof v.updated_at === 'string' && v.updated_at.length > 0
        ? v.updated_at
        : fallback.updated_at,
  };
}

function normalizeMealScheduleV2Direct(value: unknown, now: Date): MealSchedule {
  const fallback = defaultMealSchedule(now);
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<MealSchedule> & {
    slots?: Partial<Record<MealOccasionKey, unknown>>;
  };
  const slotsIn = v.slots ?? {};
  const slots = Object.fromEntries(
    MEAL_OCCASION_KEYS.map((key) => [
      key,
      readSlot(slotsIn[key], fallback.slots[key]),
    ]),
  ) as Record<MealOccasionKey, MealScheduleSlot>;
  return {
    version: 2,
    slots,
    updated_at:
      typeof v.updated_at === 'string' && v.updated_at.length > 0
        ? v.updated_at
        : fallback.updated_at,
  };
}

/**
 * Coerce untrusted JSONB into current MealSchedule (v2).
 * Dual-reads v1 and v2. Never writes Profile.
 */
export function normalizeMealSchedule(
  value: unknown,
  now: Date = new Date(),
): MealSchedule {
  if (!value || typeof value !== 'object') return defaultMealSchedule(now);
  if (isMealScheduleV2Shape(value)) {
    return normalizeMealScheduleV2Direct(value, now);
  }
  if (isMealScheduleV1Shape(value) || hasAnyLegacySlot(value)) {
    return mealScheduleV1ToV2(normalizeMealScheduleV1(value, now));
  }
  // Empty/partial slots object with no recognizable keys → v2 defaults.
  return normalizeMealScheduleV2Direct(value, now);
}

function hasAnyLegacySlot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const slots = (value as { slots?: unknown }).slots;
  if (!slots || typeof slots !== 'object') return false;
  return Object.keys(slots as object).some((k) => isLegacyMealSlotKey(k));
}

export function cloneMealSchedule(schedule: MealSchedule): MealSchedule {
  return {
    version: 2,
    updated_at: schedule.updated_at,
    slots: Object.fromEntries(
      MEAL_OCCASION_KEYS.map((key) => [key, { ...schedule.slots[key] }]),
    ) as Record<MealOccasionKey, MealScheduleSlot>,
  };
}

export function labelForOccasion(
  key: MealOccasionKey,
  override: string | null | undefined,
): string {
  if (override && override.trim().length > 0) return override.trim();
  return MEAL_OCCASION_DEFAULT_LABELS[key];
}

/**
 * PlannedMealType from a *raw* legacy v1 semantic key only.
 * Normalized v2 `occasion_*` keys must not determine meal classification.
 */
export function mealTypeForLegacySlotKey(key: LegacyMealSlotKey): PlannedMealType {
  return LEGACY_SLOT_MEAL_TYPE[key];
}

export function normalizeProgramScheduleOverride(
  value: unknown,
): ProgramScheduleOverride | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ProgramScheduleOverride & ProgramScheduleOverrideV1>;
  const mapKeys = (list: unknown): MealOccasionKey[] => {
    if (!Array.isArray(list)) return [];
    const out: MealOccasionKey[] = [];
    const seen = new Set<MealOccasionKey>();
    for (const item of list) {
      const key = coerceMealOccasionKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  };
  return {
    require_slots: mapKeys(raw.require_slots),
    disallow_slots: mapKeys(raw.disallow_slots),
    constraints: raw.constraints ?? null,
    rationale_md:
      typeof raw.rationale_md === 'string' || raw.rationale_md === null
        ? raw.rationale_md ?? null
        : null,
  };
}

export function normalizeProgramScheduleOverrides(
  values: unknown[],
): ProgramScheduleOverride[] {
  const out: ProgramScheduleOverride[] = [];
  for (const value of values) {
    const normalized = normalizeProgramScheduleOverride(value);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Resolve a historical journal slot_key against a current v2 enabled set. */
export function matchOccasionKeyInSlots(
  slotKey: unknown,
  occasionKeys: Iterable<MealOccasionKey>,
): MealOccasionKey | null {
  const occasion = coerceMealOccasionKey(slotKey);
  if (!occasion) return null;
  for (const key of Array.from(occasionKeys)) {
    if (key === occasion) return key;
  }
  return null;
}

export function legacySlotForOccasion(
  key: MealOccasionKey,
): LegacyMealSlotKey | null {
  return OCCASION_TO_LEGACY_SLOT[key] ?? null;
}
