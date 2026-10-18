import { PROGRAMS_MVP_CATEGORIES } from './appProgramsMvp';

export const PROGRAM_PREREQUISITE_UNMET = 'PROGRAM_PREREQUISITE_UNMET';
export const PROGRAM_VALIDATION_ONLY = 'PROGRAM_VALIDATION_ONLY';
export const PROGRAM_DEFAULT_VERSION_INVALID = 'PROGRAM_DEFAULT_VERSION_INVALID';
export const PROGRAM_VERSION_SELECTION_DENIED = 'PROGRAM_VERSION_SELECTION_DENIED';

/**
 * Optional pointer on `public.programs.metadata`. When absent, new enrollments
 * and pre-enrollment Day 0 previews keep latest-published selection. When
 * present, the referenced version must belong to that program and be published.
 */
export const DEFAULT_ENROLLMENT_VERSION_METADATA_KEY = 'defaultEnrollmentVersionId';

/** Server-assigned only. Ordinary member payloads must never set this. */
export type ServerEnrollmentAuthorization = 'member' | 'verified_admin_grant';

export type ConfiguredDefaultEnrollmentVersion =
  | { status: 'absent' }
  | { status: 'configured'; versionId: string }
  | { status: 'invalid' };

/** Read the server-controlled default. Blank values count as unconfigured.
 * A present non-string value is invalid and must fail closed. */
export function readConfiguredDefaultEnrollmentVersion(
  metadata: Record<string, unknown> | null | undefined,
): ConfiguredDefaultEnrollmentVersion {
  if (metadata == null) return { status: 'absent' };
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { status: 'invalid' };
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, DEFAULT_ENROLLMENT_VERSION_METADATA_KEY)) {
    return { status: 'absent' };
  }
  const value = metadata[DEFAULT_ENROLLMENT_VERSION_METADATA_KEY];
  if (value == null) return { status: 'absent' };
  if (typeof value !== 'string') return { status: 'invalid' };
  const versionId = value.trim();
  if (!versionId) return { status: 'absent' };
  return { status: 'configured', versionId };
}

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
