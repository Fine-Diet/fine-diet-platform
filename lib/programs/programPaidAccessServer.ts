import { hasEntitlement } from '@/lib/access/accessService';
import { listAssignments } from '@/lib/plans/programAssignmentServerService';

/** Paid program access right now. An open enrollment is not consulted. */
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
  const now = Date.now();
  return rows.some((row) => {
    const starts = !row.active_from || Date.parse(row.active_from) <= now;
    const ends = !row.active_to || Date.parse(row.active_to) > now;
    return starts && ends;
  });
}
