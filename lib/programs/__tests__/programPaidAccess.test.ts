import {
  memberResolvedProgramStatus,
  programCurriculumVisible,
  unpaidOpenEnrollmentBlocksAccess,
} from '../programPaidAccess';

describe('paid program access', () => {
  it('does not treat an open enrollment as paid access', () => {
    for (const status of ['pre_start', 'active', 'paused'] as const) {
      expect(unpaidOpenEnrollmentBlocksAccess(status, false)).toBe(true);
      expect(memberResolvedProgramStatus(status, false)).toBe('cancelled');
      expect(memberResolvedProgramStatus(status, true)).toBe(status);
    }
  });

  it('leaves completed and cancelled history unchanged when payment has ended', () => {
    expect(memberResolvedProgramStatus('completed', false)).toBe('completed');
    expect(memberResolvedProgramStatus('cancelled', false)).toBe('cancelled');
    expect(unpaidOpenEnrollmentBlocksAccess('completed', false)).toBe(false);
  });

  it('hides curriculum for runtime state without a current entitlement', () => {
    for (const runtimeState of ['inactive', 'scheduled', 'active_now', 'completed', 'cancelled']) {
      expect(programCurriculumVisible({
        hasEntitlement: false,
        runtimeState,
      })).toBe(false);
    }
    expect(programCurriculumVisible({
      hasEntitlement: true,
      runtimeState: 'inactive',
    })).toBe(true);
  });
});
