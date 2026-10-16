jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: {} }));

import { ProgramDeliveryModuleCreateSchema } from '../deliveryModuleAdminServerService';
import {
  BASELINE_DAY_0_TO_21_CANDIDATE,
  toBaselineCandidateModulePayloads,
} from '../baselineDay0To21Candidate';

describe('Baseline Day 0–21 candidate', () => {
  it('serializes every authored module into the existing draft-only API contract', () => {
    const versionId = 'f5c52fd9-b8a0-48bc-a7bb-2100d21b0021';
    const payloads = toBaselineCandidateModulePayloads(versionId);
    expect(payloads.length).toBe(BASELINE_DAY_0_TO_21_CANDIDATE.modules.length);
    expect(payloads.every((payload) => payload.program_version_id === versionId)).toBe(true);
    expect(payloads.every((payload) => payload.status === 'draft')).toBe(true);
    expect(payloads.map((payload) => ProgramDeliveryModuleCreateSchema.safeParse(payload).success)).toEqual(
      payloads.map(() => true),
    );
    expect(new Set(payloads.map((payload) => payload.module_key)).size).toBe(payloads.length);
    expect(new Set(payloads.flatMap((payload) => payload.day_start == null ? [] : [payload.day_start])).size).toBe(21);
    for (let day = 0; day <= 21; day += 1) {
      expect(payloads.some((payload) => payload.anchor_json.groupId === `baseline-candidate-day-${day}`)).toBe(true);
    }
  });

  it('isolates version identity from the published Baseline v1 fallback', () => {
    expect(BASELINE_DAY_0_TO_21_CANDIDATE.versionKey).toBe('baseline-day-0-21-candidate');
    const versionId = 'f5c52fd9-b8a0-48bc-a7bb-2100d21b0021';
    expect(toBaselineCandidateModulePayloads(versionId).every((payload) => payload.program_version_id === versionId)).toBe(true);
  });
});
