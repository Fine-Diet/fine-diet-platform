/**
 * Meal Rhythm assumption policy v1.
 *
 * Deterministic proposal for the assumption-first flow. Never writes.
 * Existing saved schedule truth wins over onboarding and product defaults.
 * Weekend variation is not representable on MealSchedule v1 — do not invent it.
 */

import { INITIAL_ANSWERS, type OnboardingAnswers } from '@/lib/onboarding/defaultOnboardingFlow';
import { buildAppCopyMealSchedule } from '@/lib/onboarding/buildProfilePatch';
import { defaultMealSchedule, isValidHHmm } from '@/lib/plans/scheduleResolver';
import {
  MEAL_SLOT_DEFAULT_TIMES,
  MEAL_SLOT_KEYS,
  type MealSchedule,
  type MealScheduleSlot,
  type MealSlotKey,
} from '@/lib/plans/types';
import { hasSavedMealSchedule } from '@/lib/plans/decisioning/usableMealRhythm';

export const MEAL_RHYTHM_ASSUMPTION_POLICY_ID = 'meal-rhythm.assumption' as const;
export const MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION = 'v1' as const;

export type MealRhythmProposalSource = 'saved_schedule' | 'onboarding' | 'product_default';
export type MealRhythmFieldProvenance = MealRhythmProposalSource;

export interface MealRhythmProposal {
  schedule: MealSchedule;
  source: MealRhythmProposalSource;
  fieldProvenance: Record<MealSlotKey, MealRhythmFieldProvenance>;
  confidence: 'deterministic' | 'inferred' | 'unknown';
  reasonCodes: string[];
  policyId: typeof MEAL_RHYTHM_ASSUMPTION_POLICY_ID;
  policyVersion: typeof MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION;
  weekendVariationSupported: false;
}

function allDisabledBase(now: Date): MealSchedule {
  const schedule = defaultMealSchedule(now);
  for (const key of MEAL_SLOT_KEYS) {
    schedule.slots[key] = {
      ...schedule.slots[key],
      enabled: false,
    };
  }
  return schedule;
}

function cloneSchedule(schedule: MealSchedule): MealSchedule {
  return {
    version: 1,
    updated_at: schedule.updated_at,
    slots: Object.fromEntries(
      MEAL_SLOT_KEYS.map((key) => [key, { ...schedule.slots[key] }]),
    ) as Record<MealSlotKey, MealScheduleSlot>,
  };
}

function provenanceMap(
  source: MealRhythmFieldProvenance,
): Record<MealSlotKey, MealRhythmFieldProvenance> {
  return Object.fromEntries(MEAL_SLOT_KEYS.map((key) => [key, source])) as Record<
    MealSlotKey,
    MealRhythmFieldProvenance
  >;
}

export function scheduleFromSavedPartial(value: unknown, now: Date = new Date()): MealSchedule {
  const base = allDisabledBase(now);
  if (!hasSavedMealSchedule(value)) return base;
  const raw = value as Partial<MealSchedule> & {
    slots?: Partial<Record<MealSlotKey, Partial<MealScheduleSlot>>>;
  };
  const slotsIn = raw.slots ?? {};
  for (const key of MEAL_SLOT_KEYS) {
    const slot = slotsIn[key];
    if (!slot || typeof slot !== 'object') continue;
    base.slots[key] = {
      enabled: slot.enabled === true,
      target_time: isValidHHmm(slot.target_time)
        ? slot.target_time
        : MEAL_SLOT_DEFAULT_TIMES[key],
      label: typeof slot.label === 'string' ? slot.label : null,
    };
  }
  if (typeof raw.updated_at === 'string' && raw.updated_at.length > 0) {
    base.updated_at = raw.updated_at;
  }
  return base;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function eatingFromOnboarding(onboarding: unknown): {
  rhythm_template: string | null;
  first_meal_window: string | null;
  second_meal_window: string | null;
  last_meal_window: string | null;
  meal_slots: MealSlotKey[];
} | null {
  if (!onboarding || typeof onboarding !== 'object') return null;
  const blob = onboarding as {
    answers?: Partial<OnboardingAnswers>;
    eating?: Record<string, unknown>;
  };
  const eating = blob.eating && typeof blob.eating === 'object' ? blob.eating : {};
  const answers = blob.answers && typeof blob.answers === 'object' ? blob.answers : {};
  const rhythm_template =
    asOptionalString(eating.rhythm_template) ?? asOptionalString(answers.rhythm_template);
  const first_meal_window =
    asOptionalString(eating.first_meal_window) ?? asOptionalString(answers.first_meal_window);
  const second_meal_window =
    asOptionalString(eating.second_meal_window) ?? asOptionalString(answers.second_meal_window);
  const last_meal_window =
    asOptionalString(eating.last_meal_window) ?? asOptionalString(answers.last_meal_window);
  const meal_slots = Array.isArray(eating.meal_slots)
    ? (eating.meal_slots.filter((key) =>
        MEAL_SLOT_KEYS.includes(key as MealSlotKey),
      ) as MealSlotKey[])
    : Array.isArray(answers.meal_slots)
      ? answers.meal_slots.filter((key): key is MealSlotKey => MEAL_SLOT_KEYS.includes(key))
      : [];

  if (!rhythm_template && !first_meal_window && !last_meal_window && meal_slots.length === 0) {
    return null;
  }
  return {
    rhythm_template,
    first_meal_window,
    second_meal_window,
    last_meal_window,
    meal_slots,
  };
}

export function proposeMealRhythm(args: {
  savedSchedule: unknown;
  onboarding?: unknown;
  now?: Date;
}): MealRhythmProposal {
  const now = args.now ?? new Date();

  if (hasSavedMealSchedule(args.savedSchedule)) {
    const schedule = scheduleFromSavedPartial(args.savedSchedule, now);
    const fieldProvenance = provenanceMap('product_default');
    const rawSlots = (args.savedSchedule as MealSchedule).slots;
    for (const key of MEAL_SLOT_KEYS) {
      if (rawSlots[key] && typeof rawSlots[key] === 'object') {
        fieldProvenance[key] = 'saved_schedule';
      }
    }
    return {
      schedule,
      source: 'saved_schedule',
      fieldProvenance,
      confidence: 'deterministic',
      reasonCodes: ['saved_schedule_present', 'weekend_variation_unsupported'],
      policyId: MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
      policyVersion: MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
      weekendVariationSupported: false,
    };
  }

  const eating = eatingFromOnboarding(args.onboarding ?? null);
  if (eating) {
    const answers: OnboardingAnswers = {
      ...INITIAL_ANSWERS,
      rhythm_template: eating.rhythm_template,
      first_meal_window: eating.first_meal_window,
      second_meal_window: eating.second_meal_window,
      last_meal_window: eating.last_meal_window,
      meal_slots: eating.meal_slots,
    };
    const schedule = cloneSchedule(buildAppCopyMealSchedule(answers));
    if (eating.meal_slots.length > 0) {
      const enabled = new Set(eating.meal_slots);
      for (const key of MEAL_SLOT_KEYS) {
        schedule.slots[key] = {
          ...schedule.slots[key],
          enabled: enabled.has(key),
        };
      }
    }
    const ambiguous =
      !eating.rhythm_template ||
      eating.rhythm_template === 'custom_rhythm' ||
      (!eating.first_meal_window && !eating.last_meal_window && eating.meal_slots.length === 0);
    const reasonCodes = ['onboarding_rhythm_facts', 'weekend_variation_unsupported'];
    if (ambiguous) reasonCodes.push('ambiguous_onboarding_rhythm');
    return {
      schedule,
      source: 'onboarding',
      fieldProvenance: provenanceMap('onboarding'),
      confidence: 'inferred',
      reasonCodes,
      policyId: MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
      policyVersion: MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
      weekendVariationSupported: false,
    };
  }

  return {
    schedule: cloneSchedule(defaultMealSchedule(now)),
    source: 'product_default',
    fieldProvenance: provenanceMap('product_default'),
    confidence: 'unknown',
    reasonCodes: [
      'no_saved_schedule',
      'no_onboarding_rhythm',
      'history_inference_deferred',
      'product_default_assumption',
      'weekend_variation_unsupported',
    ],
    policyId: MEAL_RHYTHM_ASSUMPTION_POLICY_ID,
    policyVersion: MEAL_RHYTHM_ASSUMPTION_POLICY_VERSION,
    weekendVariationSupported: false,
  };
}

export function buildMealScheduleSavePayload(
  schedule: MealSchedule,
  now: Date = new Date(),
): { meal_schedule: MealSchedule } {
  return {
    meal_schedule: {
      version: 1,
      updated_at: now.toISOString(),
      slots: cloneSchedule(schedule).slots,
    },
  };
}

export function schedulesDiffer(a: MealSchedule, b: MealSchedule): boolean {
  return MEAL_SLOT_KEYS.some((key) => {
    const left = a.slots[key];
    const right = b.slots[key];
    return (
      left.enabled !== right.enabled ||
      left.target_time !== right.target_time ||
      left.label !== right.label
    );
  });
}
