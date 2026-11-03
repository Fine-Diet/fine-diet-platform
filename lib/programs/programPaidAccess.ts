import type { ProgramEnrollmentStatus } from './runtimeTypes';

const OPEN_ENROLLMENT_STATUSES = new Set<ProgramEnrollmentStatus>([
  'pre_start',
  'active',
  'paused',
]);

/**
 * An open enrollment is a runtime record, not proof of payment. Current
 * access is an active program entitlement or an in-window active assignment.
 * Completed and cancelled enrollments are history and are left unchanged.
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

/** Inactive and missing assignments do not expose the program curriculum. */
export function programCurriculumVisible(input: {
  hasEntitlement: boolean;
  runtimeState: string;
}): boolean {
  if (input.hasEntitlement) return true;
  return input.runtimeState === 'active_now'
    || input.runtimeState === 'scheduled'
    || input.runtimeState === 'completed'
    || input.runtimeState === 'cancelled';
}
