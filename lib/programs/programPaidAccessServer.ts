import { hasEntitlement } from '@/lib/access/accessService';
import { listAssignments } from '@/lib/plans/programAssignmentServerService';
import { assignmentIndependentlyAuthorizesCurriculum } from './programCurriculumAccess';

/**
 * Paid program access right now. An open enrollment is not consulted.
 * A current entitlement authorizes on its own. An active in-window
 * admin_grant, offer, bundle, or other assignment authorizes on its own.
 * A purchase assignment never authorizes here; curriculum reads require
 * the shared source_ref correlation in programCurriculumAccess.
 */
export async function personHasCurrentProgramAccess(
  personId: string,
  programSlug: string,
): Promise<boolean> {
  const slug = programSlug.trim().toLowerCase();
  if (!personId || !slug) return false;
  if (await hasEntitlement(personId, `program:${slug}`)) return true;

  const { rows } = await listAssignments({
    personId,
    programSlug: slug,
    status: 'active',
    limit: 20,
  });
  const now = new Date();
  return rows.some((row) =>
    assignmentIndependentlyAuthorizesCurriculum(
      {
        program_slug: row.program_slug,
        acquisition_source: row.acquisition_source,
        status: row.status,
        active_from: row.active_from,
        active_to: row.active_to,
        source_ref: row.source_ref,
      },
      slug,
      now,
    )
  );
}
