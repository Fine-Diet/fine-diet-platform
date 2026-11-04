import { hasEntitlement } from '@/lib/access/accessService';
import { listActiveAssignmentsForPerson } from '@/lib/plans/programAssignmentServerService';

export const PROGRAM_ACCESS_DENIED = 'PROGRAM_ACCESS_DENIED';

export type CurrentProgramAccess =
  | { sourceType: 'entitlement'; assignmentId: null; entitlementKey: string }
  | { sourceType: 'assignment'; assignmentId: string; entitlementKey: null };

/** Resolve the current, program-specific access grant for a person. */
export async function resolveCurrentProgramAccess(
  personId: string,
  programSlug: string,
): Promise<CurrentProgramAccess | null> {
  const slug = programSlug.trim().toLowerCase();
  if (!personId || !slug) return null;

  const entitlementKey = `program:${slug}`;
  if (await hasEntitlement(personId, entitlementKey)) {
    return { sourceType: 'entitlement', assignmentId: null, entitlementKey };
  }

  const assignments = await listActiveAssignmentsForPerson(personId, slug);
  const assignment = assignments[0];
  if (!assignment) return null;

  return {
    sourceType: 'assignment',
    assignmentId: assignment.id,
    entitlementKey: null,
  };
}

export async function hasCurrentProgramAccess(
  personId: string,
  programSlug: string,
): Promise<boolean> {
  return (await resolveCurrentProgramAccess(personId, programSlug)) !== null;
}
