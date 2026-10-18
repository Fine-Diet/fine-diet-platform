import type { ProgramDeliveryModuleDefinition } from './deliveryModuleTypes';
import type { ProgramBlueprintRuntimeConfig } from './programBlueprint';

export interface ProgramDayObservationRecord {
  draft_text: string;
  response_text: string | null;
  saved_at: string | null;
  updated_at: string | null;
}

export interface ProgramDayCompletionRecord {
  id: string;
  enrollment_id: string;
  program_version_id: string;
  program_day: number;
  completed_at: string;
}

export interface MemberDayRequestIdentity {
  enrollmentId: string;
  versionId: string;
  day: number;
  contentKey?: string;
}

export interface MemberDayInteractionError {
  status: number;
  message: string;
  code?: string;
}

export interface MemberObservationTarget {
  contentKey: string;
  prompt: string;
  required: boolean;
}

type InteractionConfig = ProgramBlueprintRuntimeConfig['interactions'];

export function canWriteMemberProgramDay(status: string, day: number): boolean {
  return status === 'active' || (status === 'pre_start' && day === 0);
}

export function memberDayReadOnlyReason(status: string, day: number): string | null {
  if (canWriteMemberProgramDay(status, day)) return null;
  if (status === 'paused') {
    return 'This enrollment is paused. Saved responses stay available to read.';
  }
  if (status === 'completed') {
    return 'This enrollment is completed. Saved responses stay available to read.';
  }
  if (status === 'pre_start') {
    return 'Only Day 0 accepts responses before the Program starts.';
  }
  return 'This enrollment is read-only and cannot accept new day responses or completion.';
}

export function observationTargetForViewedDay(input: {
  day: number;
  interactions: InteractionConfig | null;
  modules: readonly Pick<ProgramDeliveryModuleDefinition, 'id' | 'dayStart' | 'dayEnd'>[];
}): MemberObservationTarget | null {
  const authored = input.interactions?.observations.find((item) => item.day === input.day);
  if (!authored) return null;
  const published = input.modules.some((module) => {
    const start = module.dayStart ?? input.day;
    const end = module.dayEnd ?? input.day;
    return module.id === authored.moduleKey && input.day >= start && input.day <= end;
  });
  if (!published) return null;
  return {
    contentKey: authored.moduleKey,
    prompt: authored.prompt,
    required: authored.requiredForCompletion,
  };
}

export function checkinRequiredForDay(
  interactions: InteractionConfig | null,
  day: number,
): boolean {
  return Boolean(interactions?.checkIns.some((item) => item.day === day && item.requiredForCompletion));
}

export function memberDayPanelModel(input: {
  status: string;
  day: number;
  enrollmentId: string;
  versionId: string;
  modules: readonly Pick<ProgramDeliveryModuleDefinition, 'id' | 'dayStart' | 'dayEnd'>[];
  interactions: InteractionConfig | null;
  latestCheckin: { checkin_day: number; response_status: string } | null;
}) {
  const checkinRequired = checkinRequiredForDay(input.interactions, input.day);
  return {
    enrollmentId: input.enrollmentId,
    versionId: input.versionId,
    day: input.day,
    writable: canWriteMemberProgramDay(input.status, input.day),
    readOnlyReason: memberDayReadOnlyReason(input.status, input.day),
    observation: observationTargetForViewedDay({
      day: input.day,
      interactions: input.interactions,
      modules: input.modules,
    }),
    checkinRequired,
    checkinHandled: !checkinRequired || isMemberCheckinHandled(input.latestCheckin, input.day),
  };
}

export function isMemberCheckinHandled(
  response: { checkin_day: number; response_status: string } | null | undefined,
  day: number,
): boolean {
  if (!response || response.checkin_day !== day) return false;
  return response.response_status === 'completed' || response.response_status === 'skipped';
}

export function displayObservation(record: ProgramDayObservationRecord): {
  editorText: string;
  savedResponse: string | null;
} {
  const saved = typeof record.response_text === 'string' && record.response_text.trim().length > 0
    ? record.response_text
    : null;
  return {
    editorText: record.draft_text || saved || '',
    savedResponse: saved,
  };
}

export function sameMemberDayIdentity(
  requested: MemberDayRequestIdentity,
  received: MemberDayRequestIdentity,
): boolean {
  return requested.enrollmentId === received.enrollmentId
    && requested.versionId === received.versionId
    && requested.day === received.day
    && requested.contentKey === received.contentKey;
}

export function acceptCompletionRecord(
  requested: MemberDayRequestIdentity,
  record: ProgramDayCompletionRecord | null,
): ProgramDayCompletionRecord | null {
  if (!record) return null;
  if (
    record.enrollment_id !== requested.enrollmentId
    || record.program_version_id !== requested.versionId
    || record.program_day !== requested.day
  ) {
    throw Object.assign(new Error('Day completion did not match this enrollment version.'), {
      code: 'MEMBER_DAY_STALE_RESPONSE',
    });
  }
  return record;
}

export function memberObservationUrl(enrollmentId: string, day: number, contentKey: string): string {
  const params = new URLSearchParams({
    day: String(day),
    content_key: contentKey,
  });
  return `/api/journal/programs/enrollments/${encodeURIComponent(enrollmentId)}/observations?${params}`;
}

export function memberCompletionUrl(enrollmentId: string, day: number): string {
  const params = new URLSearchParams({ day: String(day) });
  return `/api/journal/programs/enrollments/${encodeURIComponent(enrollmentId)}/complete-day?${params}`;
}

async function readFailure(response: Response): Promise<MemberDayInteractionError> {
  const body = await response.json().catch(() => ({} as { error?: string; code?: string }));
  return {
    status: response.status,
    message: typeof body.error === 'string' ? body.error : 'The Program day request failed.',
    code: typeof body.code === 'string' ? body.code : undefined,
  };
}

export async function fetchProgramDayObservation(
  identity: MemberDayRequestIdentity & { contentKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ProgramDayObservationRecord> {
  const response = await fetchImpl(memberObservationUrl(identity.enrollmentId, identity.day, identity.contentKey), {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!response.ok) throw await readFailure(response);
  return response.json() as Promise<ProgramDayObservationRecord>;
}

export async function writeProgramDayObservation(
  identity: MemberDayRequestIdentity & { contentKey: string },
  text: string,
  action: 'draft' | 'save',
  fetchImpl: typeof fetch = fetch,
): Promise<ProgramDayObservationRecord> {
  const response = await fetchImpl(
    `/api/journal/programs/enrollments/${encodeURIComponent(identity.enrollmentId)}/observations`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        day: identity.day,
        content_key: identity.contentKey,
        text,
        action,
      }),
    },
  );
  if (!response.ok) throw await readFailure(response);
  return response.json() as Promise<ProgramDayObservationRecord>;
}

export async function fetchProgramDayCompletion(
  identity: MemberDayRequestIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<ProgramDayCompletionRecord | null> {
  const response = await fetchImpl(memberCompletionUrl(identity.enrollmentId, identity.day), {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!response.ok) throw await readFailure(response);
  const body = (await response.json()) as ProgramDayCompletionRecord | null;
  return acceptCompletionRecord(identity, body);
}

export async function completeProgramDay(
  identity: MemberDayRequestIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<ProgramDayCompletionRecord> {
  const response = await fetchImpl(
    `/api/journal/programs/enrollments/${encodeURIComponent(identity.enrollmentId)}/complete-day`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: identity.day }),
    },
  );
  if (!response.ok) throw await readFailure(response);
  const body = (await response.json()) as ProgramDayCompletionRecord | null;
  const accepted = acceptCompletionRecord(identity, body);
  if (!accepted) {
    throw Object.assign(new Error('Day completion did not return a saved record.'), {
      code: 'MEMBER_DAY_STALE_RESPONSE',
    });
  }
  return accepted;
}
