import { PROGRAMS_MVP_CATEGORIES } from './appProgramsMvp';

export const PROGRAM_PREREQUISITE_UNMET = 'PROGRAM_PREREQUISITE_UNMET';
export const PROGRAM_VALIDATION_ONLY = 'PROGRAM_VALIDATION_ONLY';

/** Server-assigned only. Ordinary member payloads must never set this. */
export type ServerEnrollmentAuthorization = 'member' | 'verified_admin_grant';

const REAL_PROGRAM_MVP_STATUSES = new Set([
  'available',
  'available_soon',
  'dependency_blocked',
]);

export function declaredPrerequisiteSlug(programSlug: string): string | null {
  const slug = programSlug.trim().toLowerCase();
  if (!slug) return null;
  for (const category of PROGRAMS_MVP_CATEGORIES) {
    for (const series of category.series) {
      for (const program of series.programs) {
        if (!REAL_PROGRAM_MVP_STATUSES.has(program.status)) continue;
        if (program.slug.toLowerCase() !== slug) continue;
        if (
          program.dependency?.type === 'previous_program_completion' &&
          program.dependency.programId
        ) {
          return program.dependency.programId.toLowerCase();
        }
        return null;
      }
    }
  }
  return null;
}

export function isValidationOnlyMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.content_status === 'validation_only';
}

export function isVerifiedAdminGrant(
  authorization: ServerEnrollmentAuthorization | null | undefined,
): boolean {
  return authorization === 'verified_admin_grant';
}
