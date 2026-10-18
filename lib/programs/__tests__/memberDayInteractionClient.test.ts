import {
  acceptCompletionRecord,
  canWriteMemberProgramDay,
  checkinRequiredForDay,
  completeProgramDay,
  displayObservation,
  fetchProgramDayCompletion,
  fetchProgramDayObservation,
  isMemberCheckinHandled,
  memberCompletionUrl,
  memberDayPanelModel,
  memberObservationUrl,
  observationTargetForViewedDay,
  sameMemberDayIdentity,
  writeProgramDayObservation,
  type ProgramDayCompletionRecord,
} from '../memberDayInteractionClient';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '../baselineDay0To21Candidate';

const ENROLLMENT_ID = 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2';
const VERSION_ID = 'f5c52fd9-b8a0-48bc-a7bb-2100d21b0021';
const OTHER_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const KEY = 'baseline-candidate-day-7-reflection';

function completion(overrides: Partial<ProgramDayCompletionRecord> = {}): ProgramDayCompletionRecord {
  return {
    id: 'completion-1',
    enrollment_id: ENROLLMENT_ID,
    program_version_id: VERSION_ID,
    program_day: 7,
    completed_at: '2026-10-17T18:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('member day interaction ownership and lifecycle', () => {
  it('keeps writes on active days and Day 0 before the start, and closes paused or completed enrollments', () => {
    expect(canWriteMemberProgramDay('active', 7)).toBe(true);
    expect(canWriteMemberProgramDay('pre_start', 0)).toBe(true);
    expect(canWriteMemberProgramDay('pre_start', 1)).toBe(false);
    expect(canWriteMemberProgramDay('paused', 7)).toBe(false);
    expect(canWriteMemberProgramDay('completed', 21)).toBe(false);
  });

  it('uses a published module on the enrolled day and ignores a client-only blueprint key', () => {
    const interactions = BASELINE_DAY_0_TO_21_BLUEPRINT.interactions;
    expect(observationTargetForViewedDay({
      day: 7,
      interactions,
      modules: [{ id: KEY, dayStart: 7, dayEnd: 7 }],
    })).toMatchObject({ contentKey: KEY, required: true });
    expect(observationTargetForViewedDay({
      day: 7,
      interactions,
      modules: [{ id: 'other-version-module', dayStart: 7, dayEnd: 7 }],
    })).toBeNull();
    expect(observationTargetForViewedDay({
      day: 8,
      interactions,
      modules: [{ id: KEY, dayStart: 7, dayEnd: 7 }],
    })).toBeNull();
    expect(checkinRequiredForDay(interactions, 7)).toBe(true);
    expect(checkinRequiredForDay(interactions, 6)).toBe(false);
  });

  it('keeps a required check-in closed until that same day is completed or skipped', () => {
    const interactions = BASELINE_DAY_0_TO_21_BLUEPRINT.interactions;
    for (const day of [7, 14, 21]) {
      const modules = [{ id: `baseline-candidate-day-${day}-reflection`, dayStart: day, dayEnd: day }];
      const model = (latestCheckin: { checkin_day: number; response_status: string } | null) => memberDayPanelModel({
        status: 'active',
        day,
        enrollmentId: ENROLLMENT_ID,
        versionId: VERSION_ID,
        modules,
        interactions,
        latestCheckin,
      });
      expect(model(null)).toMatchObject({ checkinRequired: true, checkinHandled: false });
      expect(model({ checkin_day: day, response_status: 'completed' }).checkinHandled).toBe(true);
      expect(model({ checkin_day: day, response_status: 'skipped' }).checkinHandled).toBe(true);
      const staleDay = day === 21 ? 14 : day + 7;
      expect(model({ checkin_day: staleDay, response_status: 'completed' }).checkinHandled).toBe(false);
      expect(isMemberCheckinHandled({ checkin_day: day, response_status: 'draft' }, day)).toBe(false);
    }
    expect(memberDayPanelModel({
      status: 'pre_start',
      day: 0,
      enrollmentId: ENROLLMENT_ID,
      versionId: VERSION_ID,
      modules: [{ id: 'baseline-candidate-day-0-orientation', dayStart: 0, dayEnd: 0 }],
      interactions,
      latestCheckin: { checkin_day: 7, response_status: 'completed' },
    })).toMatchObject({ writable: true, checkinRequired: false, checkinHandled: true, observation: null });
  });

  it('rejects a completion recorded for another version or day', () => {
    const requested = { enrollmentId: ENROLLMENT_ID, versionId: VERSION_ID, day: 7 };
    expect(acceptCompletionRecord(requested, completion())).toMatchObject({ program_day: 7 });
    expect(() => acceptCompletionRecord(requested, completion({ program_version_id: OTHER_VERSION_ID })))
      .toThrow(/enrollment version/);
    expect(sameMemberDayIdentity(
      { ...requested, contentKey: KEY },
      { enrollmentId: ENROLLMENT_ID, versionId: OTHER_VERSION_ID, day: 7, contentKey: KEY },
    )).toBe(false);
  });
});

describe('member day observation and completion requests', () => {
  const identity = { enrollmentId: ENROLLMENT_ID, versionId: VERSION_ID, day: 7, contentKey: KEY };

  it('reloads the saved response separately from an auto-preserved draft', () => {
    expect(displayObservation({
      draft_text: 'newer draft',
      response_text: 'saved note',
      saved_at: '2026-10-17T18:00:00.000Z',
      updated_at: '2026-10-17T18:05:00.000Z',
    })).toEqual({ editorText: 'newer draft', savedResponse: 'saved note' });
  });

  it('sends draft and explicit save to the enrollment endpoint and reloads that response', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return jsonResponse({
          draft_text: 'saved note',
          response_text: 'saved note',
          saved_at: '2026-10-17T18:00:00.000Z',
          updated_at: '2026-10-17T18:00:00.000Z',
        });
      }
      const body = JSON.parse(String(init?.body));
      return jsonResponse({
        draft_text: body.text,
        response_text: body.action === 'save' ? body.text : 'saved note',
        saved_at: body.action === 'save' ? '2026-10-17T18:02:00.000Z' : '2026-10-17T18:00:00.000Z',
        updated_at: '2026-10-17T18:02:00.000Z',
      });
    });

    await writeProgramDayObservation(identity, 'draft note', 'draft', fetchImpl as unknown as typeof fetch);
    const saved = await writeProgramDayObservation(identity, 'saved note', 'save', fetchImpl as unknown as typeof fetch);
    const reloaded = await fetchProgramDayObservation(identity, fetchImpl as unknown as typeof fetch);

    expect(memberObservationUrl(ENROLLMENT_ID, 7, KEY)).toContain(`/enrollments/${ENROLLMENT_ID}/observations`);
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      day: 7,
      content_key: KEY,
      text: 'draft note',
      action: 'draft',
    });
    expect(JSON.parse(String(calls[1].init?.body)).action).toBe('save');
    expect(saved.response_text).toBe('saved note');
    expect(reloaded.response_text).toBe('saved note');
    expect(JSON.stringify(calls)).not.toContain(VERSION_ID);
  });

  it('treats a repeated completion as the same record and surfaces requirement failures', async () => {
    const record = completion();
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(record);
      return jsonResponse(record);
    });
    const first = await completeProgramDay(identity, fetchImpl as unknown as typeof fetch);
    const second = await completeProgramDay(identity, fetchImpl as unknown as typeof fetch);
    expect(second).toEqual(first);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ day: 7 });
    expect(memberCompletionUrl(ENROLLMENT_ID, 7)).toContain('day=7');

    const failing = jest.fn(async () => jsonResponse({
      error: 'This day has no published delivery content and cannot be completed.',
      code: 'PROGRAM_DAY_REQUIREMENTS_UNMET',
    }, 409));
    await expect(fetchProgramDayCompletion(identity, failing as unknown as typeof fetch))
      .rejects.toMatchObject({ code: 'PROGRAM_DAY_REQUIREMENTS_UNMET' });
  });
});
