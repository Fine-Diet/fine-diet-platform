import type { ProgramEnrollmentStatus } from './runtimeTypes';

const OPEN_ENROLLMENT_STATUSES = new Set<ProgramEnrollmentStatus>([
  'pre_start',
  'active',
  'paused',
]);

/**
 * An open enrollment is a runtime record, not proof of payment. The
 * boolean is supplied by the shared curriculum decision. Completed and
 * cancelled enrollments are history and are left unchanged.
 */
export function memberResolvedProgramStatus(
  resolvedStatus: ProgramEnrollmentStatus,
  hasCurrentProgramAccess: boolean,
): ProgramEnrollmentStatus {
  if (!OPEN_ENROLLMENT_STATUSES.has(resolvedStatus)) return resolvedStatus;
  return hasCurrentProgramAccess ? resolvedStatus : 'cancelled';
}

export function unpaidOpenEnrollmentBlocksAccess(
  resolvedStatus: ProgramEnrollmentStatus,
  hasCurrentProgramAccess: boolean,
): boolean {
  return memberResolvedProgramStatus(resolvedStatus, hasCurrentProgramAccess) !== resolvedStatus;
}

/**
 * Runtime state is not payment. Scheduled, completed, cancelled, and
 * inactive states do not reveal curriculum unless a current entitlement
 * already exists. Purchase-assignment correlation is enforced by
 * programCurriculumAccess before content is read.
 */
export function programCurriculumVisible(input: {
  hasEntitlement: boolean;
  runtimeState: string;
}): boolean {
  void input.runtimeState;
  return input.hasEntitlement;
}
