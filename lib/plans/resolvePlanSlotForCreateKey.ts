/**
 * Map a Plans Home meal-schedule slot key to a concrete plan-day slot.
 * Fail closed for unknown keys — do not open an arbitrary empty slot.
 * Accepts legacy v1 keys and current v2 occasion keys.
 *
 * Distinct v2 occasions that share the same display label (e.g. Mini Meal)
 * resolve via structural schedule evidence (ordinal / target time), never via
 * non-unique default labels or hidden meal-type semantics.
 */

import { preferredSlotOrdinalForOccasion } from './planStructure/policy';
import {
  coerceMealOccasionKey,
  isLegacyMealSlotKey,
  legacySlotForOccasion,
} from './mealScheduleCompat';
import type { MealOccasionKey, PlanSlot, ResolvedScheduleSlot } from './types';

export type ResolvePlanSlotScheduleContext = {
  enabledSlots: Array<
    Pick<ResolvedScheduleSlot, 'key' | 'enabled' | 'target_time' | 'label'>
  >;
};

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
}

function resolveByStructuralEvidence(
  occasion: MealOccasionKey,
  daySlots: PlanSlot[],
  enabledSlots: ResolvePlanSlotScheduleContext['enabledSlots'],
): PlanSlot | null {
  const occasionMeta =
    enabledSlots.find((slot) => slot.key === occasion && slot.enabled) ?? null;
  if (!occasionMeta) return null;

  const preferredOrdinal = preferredSlotOrdinalForOccasion(enabledSlots, occasion);
  if (preferredOrdinal != null) {
    const byOrdinal = daySlots.find((slot) => slot.slot_ordinal === preferredOrdinal);
    if (byOrdinal) return byOrdinal;
  }

  const byTime = daySlots.filter((slot) => slot.target_time === occasionMeta.target_time);
  if (byTime.length === 1) return byTime[0] ?? null;
  if (byTime.length > 1) return null;

  const wantLabel = normalizeLabel(occasionMeta.label);
  if (wantLabel) {
    const byLabel = daySlots.filter(
      (slot) => normalizeLabel(slot.slot_label) === wantLabel,
    );
    if (byLabel.length === 1) return byLabel[0] ?? null;
  }

  return null;
}

function resolveByLegacyLabelHeuristics(
  legacyKey: string,
  daySlots: PlanSlot[],
): PlanSlot | null {
  const indexed = daySlots.map((slot) => ({
    slot,
    label: (slot.slot_label ?? '').toLowerCase(),
    block: (slot.slot_block ?? '').toLowerCase(),
  }));

  const find = (pred: (entry: (typeof indexed)[number]) => boolean) =>
    indexed.find(pred)?.slot ?? null;

  const isSnackish = (label: string) =>
    label.includes('snack') || label.includes('mini');

  switch (legacyKey) {
    case 'breakfast':
      return find((entry) => entry.label.includes('breakfast'));
    case 'lunch':
      return find((entry) => entry.label.includes('lunch'));
    case 'dinner':
      return find((entry) => entry.label.includes('dinner'));
    case 'morning_snack':
      return (
        find(
          (entry) =>
            entry.label.includes('morning') && isSnackish(entry.label),
        ) ??
        find(
          (entry) =>
            entry.block === 'morning' && isSnackish(entry.label),
        )
      );
    case 'afternoon_snack':
      return (
        find(
          (entry) =>
            (entry.label.includes('afternoon') ||
              entry.label.includes('mini-meal') ||
              entry.label.includes('mini meal')) &&
            isSnackish(entry.label),
        ) ??
        find((entry) => entry.label.includes('afternoon') && isSnackish(entry.label))
      );
    case 'evening_snack':
      return (
        find(
          (entry) =>
            entry.label.includes('evening') && isSnackish(entry.label),
        ) ??
        find(
          (entry) =>
            entry.block === 'evening' && isSnackish(entry.label),
        )
      );
    default:
      return null;
  }
}

export function resolvePlanSlotForCreateKey(
  keyRaw: string,
  daySlots: PlanSlot[],
  scheduleContext?: ResolvePlanSlotScheduleContext | null,
): PlanSlot | null {
  const key = keyRaw.toLowerCase().trim().replace(/-/g, '_');
  if (!key) return null;

  const occasion = coerceMealOccasionKey(key);
  const enabledSlots = scheduleContext?.enabledSlots ?? null;

  if (occasion && enabledSlots && enabledSlots.length > 0) {
    const structural = resolveByStructuralEvidence(occasion, daySlots, enabledSlots);
    if (structural) return structural;
    // Schedule known but no structural match: fail closed for v2 identity.
    // Legacy raw keys may still use old-plan label heuristics.
    if (isLegacyMealSlotKey(key)) {
      return resolveByLegacyLabelHeuristics(key, daySlots);
    }
    return null;
  }

  // Compatibility fallback when schedule context is unavailable.
  if (isLegacyMealSlotKey(key)) {
    return resolveByLegacyLabelHeuristics(key, daySlots);
  }

  if (occasion) {
    const legacy = legacySlotForOccasion(occasion);
    if (legacy) {
      // Only when the occasion maps to a historically unique labeled meal
      // (breakfast/lunch/dinner/snack variants). Still fail closed when the
      // heuristic would collide across identical Mini Meal labels.
      const candidate = resolveByLegacyLabelHeuristics(legacy, daySlots);
      if (!candidate) return null;
      const want = normalizeLabel(candidate.slot_label);
      const collisions = daySlots.filter(
        (slot) => normalizeLabel(slot.slot_label) === want,
      );
      if (collisions.length === 1) return candidate;
      return null;
    }
    return null;
  }

  const phrase = key.replace(/_/g, ' ');
  const phraseMatches = daySlots.filter((slot) => {
    const label = (slot.slot_label ?? '').toLowerCase();
    return label === phrase || label.includes(phrase);
  });
  return phraseMatches.length === 1 ? (phraseMatches[0] ?? null) : null;
}
