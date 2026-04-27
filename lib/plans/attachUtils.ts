/**
 * Packet 35 — Import-to-plan servings scaling.
 *
 * Pure utility for scaling a PlannedMealPayload from one servings count to
 * another. Used in SlotEditor (slot picker on the day page) and in the import
 * draft "Add to Plan" panel so the same scaling logic governs both paths.
 *
 * Rules:
 *   - fromServings <= 0 or toServings <= 0: return payload unchanged (can't divide by zero).
 *   - fromServings === toServings: return payload unchanged (no-op).
 *   - totals (calories, protein_g, carbs_g, fat_g) are scaled by ratio and rounded.
 *   - Per-item calories, macros, and safe numeric quantities are scaled by
 *     the same ratio.
 *   - Ambiguous/missing item quantities are left untouched rather than
 *     converted into false precision.
 *   - food_object_id and all other non-numeric fields are left untouched.
 *   - The original payload is never mutated.
 */

import type { PlannedMeal } from './types';

type ScalablePayload = {
  items?: Array<{
    quantity?: number | string | null;
    calories?: number | null;
    macros?: {
      protein_g?: number | null;
      carbs_g?: number | null;
      fat_g?: number | null;
    } | null;
    [key: string]: unknown;
  }>;
  totals?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  };
  [key: string]: unknown;
};

function roundMacro(v: number | null | undefined, ratio: number): number | null {
  if (typeof v !== 'number' || isNaN(v)) return v ?? null;
  return Math.round(v * ratio * 10) / 10;
}

function roundCalories(v: number | null | undefined, ratio: number): number | null {
  if (typeof v !== 'number' || isNaN(v)) return v ?? null;
  return Math.round(v * ratio);
}

function roundQuantity(v: number, ratio: number): number {
  return Math.round(v * ratio * 1000) / 1000;
}

function parseSafeQuantityString(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;

  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);

  const mixed = /^(\d+)[\s-]+(\d+)\/(\d+)$/.exec(v);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den > 0) return whole + num / den;
  }

  const fraction = /^(\d+)\/(\d+)$/.exec(v);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den > 0) return num / den;
  }

  return null;
}

function scaleItemQuantity(value: unknown, ratio: number): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return roundQuantity(value, ratio);
  }
  if (typeof value === 'string') {
    const parsed = parseSafeQuantityString(value);
    return parsed == null ? value : roundQuantity(parsed, ratio);
  }
  return value;
}

export function scalePayloadToServings(
  payload: PlannedMeal['payload'],
  fromServings: number,
  toServings: number,
): PlannedMeal['payload'] {
  if (fromServings <= 0 || toServings <= 0 || fromServings === toServings) {
    return payload;
  }

  const ratio = toServings / fromServings;
  const p = payload as unknown as ScalablePayload;

  const scaledItems = (p.items ?? []).map((it) => ({
    ...it,
    quantity: scaleItemQuantity(it.quantity, ratio),
    calories: roundCalories(it.calories, ratio),
    macros: it.macros
      ? {
          ...it.macros,
          protein_g: roundMacro(it.macros.protein_g, ratio),
          carbs_g: roundMacro(it.macros.carbs_g, ratio),
          fat_g: roundMacro(it.macros.fat_g, ratio),
        }
      : it.macros,
  }));

  const scaledTotals = p.totals
    ? {
        ...p.totals,
        calories: Math.round((p.totals.calories ?? 0) * ratio),
        protein_g: Math.round(((p.totals.protein_g ?? 0) * ratio) * 10) / 10,
        carbs_g: Math.round(((p.totals.carbs_g ?? 0) * ratio) * 10) / 10,
        fat_g: Math.round(((p.totals.fat_g ?? 0) * ratio) * 10) / 10,
      }
    : p.totals;

  return {
    ...p,
    items: scaledItems,
    totals: scaledTotals,
  } as unknown as PlannedMeal['payload'];
}
