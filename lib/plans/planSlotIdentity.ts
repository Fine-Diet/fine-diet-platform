/**
 * Package 4 — slot identity integrity within a plan day.
 *
 * Duplicate `slot_ordinal` values on the same day are rejected before
 * persistence. Pure validators; DB unique-index proposal is separate.
 */

import { PlanIntegrityError, PlanRequestValidationError } from './planRequestErrors';
import type { AiPlanDay } from './validators';

export type SlotOrdinalIdentityInput = {
  slot_ordinal: number;
};

export type SlotIdentityValidation =
  | { ok: true }
  | { ok: false; error: string; duplicateOrdinals: number[] };

export function validateUniqueSlotOrdinals(
  slots: SlotOrdinalIdentityInput[],
  contextLabel = 'plan day',
): SlotIdentityValidation {
  const seen = new Set<number>();
  const duplicateOrdinals: number[] = [];
  for (const slot of slots) {
    const ordinal = slot.slot_ordinal;
    if (typeof ordinal !== 'number' || !Number.isInteger(ordinal)) {
      return {
        ok: false,
        error: `Invalid slot_ordinal on ${contextLabel}: must be an integer.`,
        duplicateOrdinals: [],
      };
    }
    if (seen.has(ordinal)) {
      if (!duplicateOrdinals.includes(ordinal)) {
        duplicateOrdinals.push(ordinal);
      }
    } else {
      seen.add(ordinal);
    }
  }

  if (duplicateOrdinals.length === 0) return { ok: true };
  duplicateOrdinals.sort((a, b) => a - b);
  return {
    ok: false,
    error: `Duplicate slot_ordinal values on ${contextLabel}: ${duplicateOrdinals.join(', ')}.`,
    duplicateOrdinals,
  };
}

/**
 * Validate every AI plan day before any plan row is inserted.
 * Throws PlanRequestValidationError on duplicate ordinals.
 */
export function assertAiPlanSlotIdentity(planDays: AiPlanDay[]): void {
  for (const day of planDays) {
    const result = validateUniqueSlotOrdinals(
      day.slots ?? [],
      `date ${day.date_local}`,
    );
    if (!result.ok) {
      throw new PlanRequestValidationError(result.error);
    }
  }
}

/**
 * Map a Postgres unique-violation on plan_slots into a typed integrity error.
 */
export function slotIdentityConflictError(message: string): PlanIntegrityError {
  return new PlanIntegrityError(
    `Slot identity conflict: duplicate slot_ordinal within a plan day. ${message}`,
  );
}

export function isPlanSlotOrdinalUniqueViolation(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  return (
    code === '23505' ||
    (message.includes('idx_plan_slots_day_ordinal_unique') &&
      (message.includes('duplicate') || message.includes('unique'))) ||
    (message.includes('plan_slots') &&
      message.includes('slot_ordinal') &&
      message.includes('duplicate'))
  );
}

export function isPlanDayDateUniqueViolation(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = (error.message ?? '').toLowerCase();
  const code = error.code ?? '';
  return (
    (code === '23505' &&
      (message.includes('idx_plan_days_plan_date') ||
        (message.includes('plan_days') && message.includes('date_local')))) ||
    (message.includes('idx_plan_days_plan_date') &&
      (message.includes('duplicate') || message.includes('unique')))
  );
}
