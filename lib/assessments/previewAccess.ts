/**
 * Preview access gating — single source of truth for who can view unpublished
 * question-set / results-pack revisions.
 *
 * `?preview=1` is honored only for editor and admin roles. This rule was
 * previously inlined in four places (resolveQuestionSet, resolveResultsPack,
 * resolveAssessmentExperience, /api/question-sets/resolve); centralizing it
 * here keeps the gating from drifting across surfaces.
 */

export type PreviewUserRole = 'user' | 'editor' | 'admin' | 'staff' | 'coach';

/**
 * True when the given role is allowed to view unpublished preview revisions.
 */
export function canPreview(userRole: PreviewUserRole | string | null | undefined): boolean {
  return userRole === 'editor' || userRole === 'admin';
}
