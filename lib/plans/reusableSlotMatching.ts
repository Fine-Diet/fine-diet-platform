/**
 * Shared slot matching for reusable planning structures.
 *
 * Package 5B slot-fidelity contract:
 *   1. source_id when the reusable snapshot still points at a live target slot
 *   2. semantic identity (compatible block + normalized label + normalized time)
 *   3. ordinal only when it does not contradict semantic identity
 *   4. never silently map Breakfast/morning → Lunch/midday (etc.) via ordinal
 *   5. claimed target slots cannot be reused by a second source slot with meals
 *
 * Day templates and week patterns must share this matcher.
 */

import type { PlanDayTemplateSlot, PlanSlot, PlanSlotBlock, PlannedMealType } from './types';

export type ReusableSlotMatchReason =
  | 'source_id'
  | 'semantic'
  | 'ordinal'
  | 'none'
  | 'duplicate_claim';

export type ReusablePlacementConflictReason =
  | 'unresolved'
  | 'duplicate_claim'
  | 'semantic_contradiction';

export interface ReusableSlotMatch {
  slot: PlanSlot | null;
  reason: ReusableSlotMatchReason;
}

export interface ReusablePlacementConflict {
  source_plan_slot_id: string;
  source_slot_ordinal: number;
  source_slot_block: PlanSlotBlock | null;
  source_slot_label: string | null;
  meal_names: string[];
  reason: ReusablePlacementConflictReason;
  detail: string;
  preferred_meal_type?: PlannedMealType | null;
}

export interface MatchReusableSlotOptions {
  preferredMealType?: PlannedMealType | null;
  /** Target slot ids already claimed by prior source slots with meals. */
  claimedTargetSlotIds?: ReadonlySet<string>;
}

/** Normalize HH:MM and HH:MM:SS (and loose variants) to HH:MM for comparison. */
export function normalizeSlotTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(trimmed);
  if (!match) return trimmed.toLowerCase();
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return trimmed.toLowerCase();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function normalizeSlotLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

export type SlotSemanticRole = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export function slotLabelRole(label: string | null | undefined): SlotSemanticRole | null {
  const normalized = normalizeSlotLabel(label);
  if (!normalized) return null;
  if (/\bbreakfast\b/.test(normalized) || normalized === 'morning') return 'breakfast';
  if (/\blunch\b/.test(normalized) || normalized === 'midday') return 'lunch';
  if (/\bdinner\b/.test(normalized) || /\bsupper\b/.test(normalized) || normalized === 'evening') {
    return 'dinner';
  }
  if (/\bsnack\b/.test(normalized)) return 'snack';
  return null;
}

export function mealTypeRole(mealType: PlannedMealType | null | undefined): SlotSemanticRole | null {
  if (mealType === 'breakfast') return 'breakfast';
  if (mealType === 'lunch') return 'lunch';
  if (mealType === 'dinner') return 'dinner';
  if (mealType === 'snack') return 'snack';
  return null;
}

export function blockRole(block: PlanSlotBlock | null | undefined): SlotSemanticRole | null {
  if (block === 'morning') return 'breakfast';
  if (block === 'midday') return 'lunch';
  if (block === 'evening') return 'dinner';
  return null;
}

function rolesCompatible(a: SlotSemanticRole | null, b: SlotSemanticRole | null): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  // A snack source may land in a lunch/midday slot when no snack slot exists.
  // A lunch/breakfast/dinner source must NOT steal a snack (or other) slot.
  if (a === 'snack' && b === 'lunch') return true;
  return false;
}

export function semanticSlotIdentityCompatible(
  source: Pick<PlanDayTemplateSlot, 'slot_block' | 'slot_label'>,
  target: Pick<PlanSlot, 'slot_block' | 'slot_label'>,
  preferredMealType?: PlannedMealType | null,
): boolean {
  if (source.slot_block && target.slot_block && source.slot_block !== target.slot_block) {
    return false;
  }

  const sourceRole =
    slotLabelRole(source.slot_label) ??
    blockRole(source.slot_block) ??
    mealTypeRole(preferredMealType);
  const targetRole = slotLabelRole(target.slot_label) ?? blockRole(target.slot_block);

  if (!rolesCompatible(sourceRole, targetRole)) return false;
  if (!rolesCompatible(mealTypeRole(preferredMealType), targetRole)) return false;

  const sourceLabel = normalizeSlotLabel(source.slot_label);
  const targetLabel = normalizeSlotLabel(target.slot_label);
  if (sourceLabel && targetLabel) {
    if (sourceLabel === targetLabel) return true;
    const sourceLabelRole = slotLabelRole(sourceLabel);
    const targetLabelRole = slotLabelRole(targetLabel);
    // Unknown free-text labels must not loosely match known meal roles.
    if (!sourceLabelRole || !targetLabelRole) return false;
    if (!rolesCompatible(sourceLabelRole, targetLabelRole)) return false;
  }

  return true;
}

function timesCompatible(
  sourceTime: string | null | undefined,
  targetTime: string | null | undefined,
): boolean {
  const a = normalizeSlotTime(sourceTime);
  const b = normalizeSlotTime(targetTime);
  if (!a || !b) return true;
  return a === b;
}

/**
 * Resolve a reusable source slot onto a target day slot list.
 */
export function matchReusableSlotToTarget(
  reusableSlot: Pick<
    PlanDayTemplateSlot,
    'source_plan_slot_id' | 'slot_block' | 'slot_label' | 'target_time' | 'slot_ordinal'
  >,
  targetSlots: PlanSlot[],
  options?: MatchReusableSlotOptions,
): ReusableSlotMatch {
  const preferredMealType = options?.preferredMealType ?? null;
  const claimed = options?.claimedTargetSlotIds;

  const take = (slot: PlanSlot, reason: ReusableSlotMatchReason): ReusableSlotMatch => {
    if (claimed?.has(slot.id)) {
      return { slot: null, reason: 'duplicate_claim' };
    }
    return { slot, reason };
  };

  const bySourceId = targetSlots.find((slot) => slot.id === reusableSlot.source_plan_slot_id);
  if (bySourceId) {
    // Source-id is only trusted when the live slot still agrees semantically
    // with the reusable snapshot (same structure / not a recycled UUID misuse).
    if (semanticSlotIdentityCompatible(reusableSlot, bySourceId, preferredMealType)) {
      return take(bySourceId, 'source_id');
    }
  }

  const semanticCandidates = targetSlots.filter((slot) => {
    if (!semanticSlotIdentityCompatible(reusableSlot, slot, preferredMealType)) return false;
    if (!timesCompatible(reusableSlot.target_time, slot.target_time)) return false;
    // Prefer candidates that share block when source has one.
    if (reusableSlot.slot_block && slot.slot_block && reusableSlot.slot_block !== slot.slot_block) {
      return false;
    }
    const sourceLabel = normalizeSlotLabel(reusableSlot.slot_label);
    const targetLabel = normalizeSlotLabel(slot.slot_label);
    if (sourceLabel && targetLabel) {
      if (sourceLabel === targetLabel) return true;
      const sourceLabelRole = slotLabelRole(sourceLabel);
      const targetLabelRole = slotLabelRole(targetLabel);
      return Boolean(
        sourceLabelRole &&
          targetLabelRole &&
          rolesCompatible(sourceLabelRole, targetLabelRole),
      );
    }
    // Label missing on one side: block (+ meal type) is enough for semantic match.
    return Boolean(reusableSlot.slot_block && slot.slot_block);
  });

  // Prefer exact normalized label, then exact normalized time, then first semantic hit.
  const rankedSemantic = [...semanticCandidates].sort((a, b) => {
    const sourceLabel = normalizeSlotLabel(reusableSlot.slot_label);
    const aLabel = normalizeSlotLabel(a.slot_label) === sourceLabel ? 0 : 1;
    const bLabel = normalizeSlotLabel(b.slot_label) === sourceLabel ? 0 : 1;
    if (aLabel !== bLabel) return aLabel - bLabel;
    const sourceTime = normalizeSlotTime(reusableSlot.target_time);
    const aTime = normalizeSlotTime(a.target_time) === sourceTime ? 0 : 1;
    const bTime = normalizeSlotTime(b.target_time) === sourceTime ? 0 : 1;
    return aTime - bTime;
  });
  if (rankedSemantic[0]) return take(rankedSemantic[0], 'semantic');

  // Soft semantic: block + label role without requiring time equality.
  const softSemantic = targetSlots.find((slot) => {
    if (!semanticSlotIdentityCompatible(reusableSlot, slot, preferredMealType)) return false;
    if (reusableSlot.slot_block && slot.slot_block && reusableSlot.slot_block !== slot.slot_block) {
      return false;
    }
    const sourceLabel = normalizeSlotLabel(reusableSlot.slot_label);
    const targetLabel = normalizeSlotLabel(slot.slot_label);
    if (sourceLabel && targetLabel) {
      if (sourceLabel === targetLabel) return true;
      const sourceLabelRole = slotLabelRole(sourceLabel);
      const targetLabelRole = slotLabelRole(targetLabel);
      return Boolean(
        sourceLabelRole &&
          targetLabelRole &&
          rolesCompatible(sourceLabelRole, targetLabelRole),
      );
    }
    return Boolean(reusableSlot.slot_block && slot.slot_block);
  });
  if (softSemantic) return take(softSemantic, 'semantic');

  const byOrdinal = targetSlots.find((slot) => slot.slot_ordinal === reusableSlot.slot_ordinal);
  if (byOrdinal) {
    if (semanticSlotIdentityCompatible(reusableSlot, byOrdinal, preferredMealType)) {
      return take(byOrdinal, 'ordinal');
    }
    return { slot: null, reason: 'none' };
  }

  return { slot: null, reason: 'none' };
}

export const UNRESOLVED_PLACEMENT_NOTE =
  'Reusable slot placement unresolved — meal kept unassigned for review.';

export const DUPLICATE_CLAIM_PLACEMENT_NOTE =
  'Reusable slot placement conflict — target slot already claimed; meal kept unassigned for review.';

export function buildPlacementConflict(args: {
  sourceSlot: Pick<
    PlanDayTemplateSlot,
    'source_plan_slot_id' | 'slot_ordinal' | 'slot_block' | 'slot_label' | 'meals'
  >;
  match: ReusableSlotMatch;
  preferredMealType?: PlannedMealType | null;
}): ReusablePlacementConflict | null {
  if (args.match.slot && args.match.reason !== 'duplicate_claim') return null;
  if ((args.sourceSlot.meals ?? []).length === 0) return null;

  const meal_names = (args.sourceSlot.meals ?? [])
    .map((meal) => meal.name?.trim() || 'Untitled meal')
    .filter(Boolean);

  if (args.match.reason === 'duplicate_claim') {
    return {
      source_plan_slot_id: args.sourceSlot.source_plan_slot_id,
      source_slot_ordinal: args.sourceSlot.slot_ordinal,
      source_slot_block: args.sourceSlot.slot_block,
      source_slot_label: args.sourceSlot.slot_label,
      meal_names,
      reason: 'duplicate_claim',
      detail: DUPLICATE_CLAIM_PLACEMENT_NOTE,
      preferred_meal_type: args.preferredMealType ?? null,
    };
  }

  return {
    source_plan_slot_id: args.sourceSlot.source_plan_slot_id,
    source_slot_ordinal: args.sourceSlot.slot_ordinal,
    source_slot_block: args.sourceSlot.slot_block,
    source_slot_label: args.sourceSlot.slot_label,
    meal_names,
    reason: 'unresolved',
    detail: UNRESOLVED_PLACEMENT_NOTE,
    preferred_meal_type: args.preferredMealType ?? null,
  };
}

/**
 * Match a source slot, claim the target when meals will be placed there, and
 * emit an explicit conflict when placement cannot proceed safely.
 */
export function placeReusableSlot(
  sourceSlot: PlanDayTemplateSlot,
  targetSlots: PlanSlot[],
  claimedTargetSlotIds: Set<string>,
): {
  planSlotId: string | null;
  match: ReusableSlotMatch;
  conflict: ReusablePlacementConflict | null;
} {
  const preferredMealType = sourceSlot.meals[0]?.meal_type ?? null;
  const match = matchReusableSlotToTarget(sourceSlot, targetSlots, {
    preferredMealType,
    claimedTargetSlotIds,
  });

  if (match.slot && (sourceSlot.meals?.length ?? 0) > 0) {
    claimedTargetSlotIds.add(match.slot.id);
    return { planSlotId: match.slot.id, match, conflict: null };
  }

  const conflict = buildPlacementConflict({
    sourceSlot,
    match,
    preferredMealType,
  });
  return { planSlotId: null, match, conflict };
}

export function stampPlacementConflictOnPayload(
  payload: Record<string, unknown>,
  conflict: ReusablePlacementConflict,
): Record<string, unknown> {
  return {
    ...payload,
    placement_review_note: conflict.detail,
    placement_conflict: {
      reason: conflict.reason,
      source_plan_slot_id: conflict.source_plan_slot_id,
      source_slot_ordinal: conflict.source_slot_ordinal,
      source_slot_block: conflict.source_slot_block,
      source_slot_label: conflict.source_slot_label,
    },
  };
}
