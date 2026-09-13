import type { PlanDayTemplate } from './types';

export const DAY_PLAN_DRAFT_VERSION = 1 as const;
export const DAY_PLAN_DRAFT_STORAGE_PREFIX = 'fine-diet:day-plan-draft:v1';
export const UNNAMED_DAY_PLAN = 'Unnamed Day Plan';

export type EmbeddedDayDraftSource = 'blank' | 'dated' | 'reusable';

export interface DayPlanDraftEnvelope {
  version: typeof DAY_PLAN_DRAFT_VERSION;
  personId: string;
  dayPlanId: string | null;
  baselineUpdatedAt: string | null;
  draft: PlanDayTemplate;
  savedAt: string;
  source?: EmbeddedDayDraftSource;
  pendingSavedTemplateId?: string | null;
  pendingSavedSnapshot?: PlanDayTemplate | null;
  baseline?: PlanDayTemplate;
  actionError?: string | null;
}

export interface DayPlanDraftSession {
  draft: PlanDayTemplate;
  baseline: PlanDayTemplate;
  source: EmbeddedDayDraftSource;
  pendingSavedTemplateId: string | null;
  pendingSavedSnapshot: PlanDayTemplate | null;
  actionError: string | null;
}

export function dayPlanDraftStorageKey(personId: string, dayPlanId: string | null): string {
  return `${DAY_PLAN_DRAFT_STORAGE_PREFIX}:${encodeURIComponent(personId)}:${encodeURIComponent(dayPlanId ?? 'new')}`;
}

export function normalizeDayPlanName(name: string | null | undefined): string {
  return name?.trim() || UNNAMED_DAY_PLAN;
}

export function dayPlanDraftSignature(template: PlanDayTemplate): string {
  return JSON.stringify({
    name: normalizeDayPlanName(template.name),
    slots: template.slots,
    unassigned_meals: template.unassigned_meals ?? [],
  });
}

export function saveDayPlanDraft(
  storage: Pick<Storage, 'setItem'>,
  personId: string,
  dayPlanId: string | null,
  baselineUpdatedAt: string | null,
  draft: PlanDayTemplate,
): void {
  const envelope: DayPlanDraftEnvelope = {
    version: DAY_PLAN_DRAFT_VERSION,
    personId,
    dayPlanId,
    baselineUpdatedAt,
    draft,
    savedAt: new Date().toISOString(),
  };
  storage.setItem(dayPlanDraftStorageKey(personId, dayPlanId), JSON.stringify(envelope));
}

function parseDraftEnvelope(
  storage: Pick<Storage, 'getItem'>,
  personId: string,
  dayPlanId: string | null,
): DayPlanDraftEnvelope | null {
  try {
    const raw = storage.getItem(dayPlanDraftStorageKey(personId, dayPlanId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DayPlanDraftEnvelope>;
    if (
      parsed.version !== DAY_PLAN_DRAFT_VERSION ||
      parsed.personId !== personId ||
      parsed.dayPlanId !== dayPlanId ||
      !parsed.draft ||
      !Array.isArray(parsed.draft.slots)
    ) {
      return null;
    }
    return parsed as DayPlanDraftEnvelope;
  } catch {
    return null;
  }
}

export function loadDayPlanDraft(
  storage: Pick<Storage, 'getItem'>,
  personId: string,
  dayPlanId: string | null,
  baselineUpdatedAt: string | null,
): PlanDayTemplate | null {
  const parsed = parseDraftEnvelope(storage, personId, dayPlanId);
  if (!parsed || parsed.baselineUpdatedAt !== baselineUpdatedAt) return null;
  return parsed.draft;
}

export function saveDayPlanDraftSession(
  storage: Pick<Storage, 'setItem'>,
  personId: string,
  dayPlanId: string | null,
  session: DayPlanDraftSession,
): void {
  const envelope: DayPlanDraftEnvelope = {
    version: DAY_PLAN_DRAFT_VERSION,
    personId,
    dayPlanId,
    baselineUpdatedAt: session.baseline.updated_at || null,
    draft: session.draft,
    savedAt: new Date().toISOString(),
    source: session.source,
    pendingSavedTemplateId: session.pendingSavedTemplateId,
    pendingSavedSnapshot: session.pendingSavedSnapshot,
    baseline: session.baseline,
    actionError: session.actionError,
  };
  storage.setItem(dayPlanDraftStorageKey(personId, dayPlanId), JSON.stringify(envelope));
}

export function loadDayPlanDraftSession(
  storage: Pick<Storage, 'getItem'>,
  personId: string,
  dayPlanId: string | null,
  fallback: PlanDayTemplate,
  inferredSource: EmbeddedDayDraftSource,
): DayPlanDraftSession | null {
  const parsed = parseDraftEnvelope(storage, personId, dayPlanId);
  if (!parsed) return null;
  return {
    draft: parsed.draft,
    baseline: parsed.baseline ?? fallback,
    source: parsed.source ?? inferredSource,
    pendingSavedTemplateId: parsed.pendingSavedTemplateId ?? null,
    pendingSavedSnapshot: parsed.pendingSavedSnapshot ?? null,
    actionError: parsed.actionError ?? null,
  };
}

export function clearDayPlanDraft(
  storage: Pick<Storage, 'removeItem'>,
  personId: string,
  dayPlanId: string | null,
): void {
  storage.removeItem(dayPlanDraftStorageKey(personId, dayPlanId));
}
