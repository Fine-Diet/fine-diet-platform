/**
 * Packet 3 — Simplified Meal Creation candidate policy v1.
 *
 * Deterministic, inspectable candidates from existing MealDocument search.
 * Logged-history / repeat ranking are deferred: no cheap meal-level read model.
 * Never invents meals or nutrition. No AI.
 */

import type { MealDocumentIntent, MealDocumentKind } from '@/lib/meals/types';
import type { MealSlotKey, PlannedMealType } from '@/lib/plans/types';

export const MEAL_CREATION_POLICY_ID = 'meal-creation.simplified' as const;
export const MEAL_CREATION_POLICY_VERSION = 'v1' as const;

export type MealCreationCandidateSource = 'saved_library';
export type MealCreationDeferredSource = 'logged_history' | 'repeat_ranking';

export interface MealCreationLibraryItem {
  id: string;
  title: string;
  document_kind: MealDocumentKind;
  intents: MealDocumentIntent[];
  archived?: boolean;
  updated_at: string | null;
}

export interface MealCreationCandidate {
  id: string;
  source: MealCreationCandidateSource;
  title: string;
  documentKind: MealDocumentKind;
  reasonCodes: string[];
  provenance: 'meal_documents.search';
  confidence: 'inferred' | 'unknown';
}

export interface MealCreationCandidateProposal {
  policyId: typeof MEAL_CREATION_POLICY_ID;
  policyVersion: typeof MEAL_CREATION_POLICY_VERSION;
  slotKey: MealSlotKey;
  candidates: MealCreationCandidate[];
  deferredSources: MealCreationDeferredSource[];
  reasonCodes: string[];
}

const DEFAULT_LIMIT = 8;

export function mealTypeForSlotKey(slot: MealSlotKey): PlannedMealType {
  if (slot === 'breakfast') return 'breakfast';
  if (slot === 'lunch') return 'lunch';
  if (slot === 'dinner') return 'dinner';
  if (slot.includes('snack')) return 'snack';
  return 'other';
}

export function occasionIntentForSlotKey(slot: MealSlotKey): MealDocumentIntent | null {
  const mealType = mealTypeForSlotKey(slot);
  if (mealType === 'other') return null;
  return mealType;
}

function matchesOccasion(
  item: MealCreationLibraryItem,
  slot: MealSlotKey,
): boolean {
  const intent = occasionIntentForSlotKey(slot);
  if (!intent) return false;
  return item.intents.includes(intent);
}

function recencyMs(item: MealCreationLibraryItem): number {
  if (!item.updated_at) return 0;
  const parsed = Date.parse(item.updated_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

function byRecencyThenId(a: MealCreationLibraryItem, b: MealCreationLibraryItem): number {
  const delta = recencyMs(b) - recencyMs(a);
  if (delta !== 0) return delta;
  return a.id.localeCompare(b.id);
}

export function proposeMealCreationCandidates(args: {
  slotKey: MealSlotKey;
  library: MealCreationLibraryItem[];
  limit?: number;
}): MealCreationCandidateProposal {
  const limit = args.limit ?? DEFAULT_LIMIT;
  const active = args.library.filter((item) => item.archived !== true && Boolean(item.id));
  const matching = active.filter((item) => matchesOccasion(item, args.slotKey));
  const remainder = active.filter((item) => !matchesOccasion(item, args.slotKey));

  const ranked = [
    ...matching.filter((item) => item.document_kind === 'meal').sort(byRecencyThenId),
    ...matching.filter((item) => item.document_kind !== 'meal').sort(byRecencyThenId),
    ...remainder.filter((item) => item.document_kind === 'meal').sort(byRecencyThenId),
    ...remainder.filter((item) => item.document_kind !== 'meal').sort(byRecencyThenId),
  ];

  const seen = new Set<string>();
  const candidates: MealCreationCandidate[] = [];
  for (const item of ranked) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const occasion = matchesOccasion(item, args.slotKey);
    candidates.push({
      id: item.id,
      source: 'saved_library',
      title: item.title,
      documentKind: item.document_kind,
      reasonCodes: occasion
        ? ['saved_reusable', 'occasion_intent_match']
        : ['saved_reusable', 'library_recency'],
      provenance: 'meal_documents.search',
      confidence: occasion ? 'inferred' : 'unknown',
    });
    if (candidates.length >= limit) break;
  }

  const reasonCodes = ['history_inference_deferred', 'repeat_ranking_deferred'];
  if (candidates.length === 0) reasonCodes.push('no_saved_library_candidates');
  else reasonCodes.push('saved_library_candidates');

  return {
    policyId: MEAL_CREATION_POLICY_ID,
    policyVersion: MEAL_CREATION_POLICY_VERSION,
    slotKey: args.slotKey,
    candidates,
    deferredSources: ['logged_history', 'repeat_ranking'],
    reasonCodes,
  };
}
