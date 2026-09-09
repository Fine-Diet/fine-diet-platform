import type {
  MealDocument,
  PlannedMealAuthoringGroup,
} from '@/lib/meals/types';
import type { PlannedMealType } from './types';

const STORE_PREFIX = 'fine-diet:plans-slot-draft:v1';

export interface PlanComposerDraftIdentity {
  personId: string;
  planId: string;
  planDayId: string;
  planSlotId: string;
  dateLocal: string;
}

export interface PlanComposerDraft {
  mealType: PlannedMealType;
  document: MealDocument;
  authoringGroups: PlannedMealAuthoringGroup[];
}

interface StoredPlanComposerDraftV1 {
  version: 1;
  identity: PlanComposerDraftIdentity;
  baselineSignature: string;
  draft: PlanComposerDraft;
  updatedAt: string;
}

function validIdentity(identity: PlanComposerDraftIdentity): boolean {
  return Object.values(identity).every(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}

export function planComposerDraftStorageKey(
  identity: PlanComposerDraftIdentity,
): string | null {
  if (!validIdentity(identity)) return null;
  return [
    STORE_PREFIX,
    identity.personId,
    identity.planId,
    identity.planDayId,
    identity.planSlotId,
    identity.dateLocal,
  ].map(encodeURIComponent).join(':');
}

export function loadPlanComposerDraft(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  identity: PlanComposerDraftIdentity,
  baselineSignature: string,
): PlanComposerDraft | null {
  const key = planComposerDraftStorageKey(identity);
  if (!key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw) as StoredPlanComposerDraftV1;
    const exactIdentity =
      record.version === 1 &&
      record.identity.personId === identity.personId &&
      record.identity.planId === identity.planId &&
      record.identity.planDayId === identity.planDayId &&
      record.identity.planSlotId === identity.planSlotId &&
      record.identity.dateLocal === identity.dateLocal;
    const validDraft =
      record.draft &&
      typeof record.draft === 'object' &&
      record.draft.document &&
      Array.isArray(record.draft.authoringGroups);
    if (!exactIdentity || !validDraft || record.baselineSignature !== baselineSignature) {
      storage.removeItem(key);
      return null;
    }
    return record.draft;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function savePlanComposerDraft(
  storage: Pick<Storage, 'setItem'>,
  identity: PlanComposerDraftIdentity,
  baselineSignature: string,
  draft: PlanComposerDraft,
): void {
  const key = planComposerDraftStorageKey(identity);
  if (!key) return;
  const record: StoredPlanComposerDraftV1 = {
    version: 1,
    identity,
    baselineSignature,
    draft,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(key, JSON.stringify(record));
  } catch {
    // Storage can be unavailable or full; the in-memory draft still works.
  }
}

export function clearPlanComposerDraft(
  storage: Pick<Storage, 'removeItem'>,
  identity: PlanComposerDraftIdentity,
): void {
  const key = planComposerDraftStorageKey(identity);
  if (!key) return;
  try {
    storage.removeItem(key);
  } catch {
    // Clearing persistence must never block a successful Plans save.
  }
}
