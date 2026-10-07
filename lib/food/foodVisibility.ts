/**
 * Administrative food search uses the service role, which bypasses RLS.
 * These checks repeat the documented SELECT policies from
 * scripts/createFoodObjectsTables.sql:
 * - "Anyone can read public foods": not deleted, and not another person's user food
 * - "Users can read own foods": person_id matches the viewer
 *
 * A user-sourced row with a null person_id stays public, matching that policy.
 * This is inherited search hardening, not preparation ranking.
 */

const SAFE_VIEWER_ID = /^[A-Za-z0-9_-]{1,80}$/;

export interface FoodVisibilityRow {
  source_type?: string | null;
  person_id?: string | null;
  is_deleted?: boolean | null;
}

export function foodVisibleToViewer(
  row: FoodVisibilityRow,
  viewerPersonId: string | null,
): boolean {
  if (row.is_deleted) return false;
  if (row.source_type !== 'user' || row.person_id == null) return true;
  return viewerPersonId != null && row.person_id === viewerPersonId;
}

/** PostgREST OR filter ANDed with the text query. Fail closed on an unsafe id. */
export function foodViewerOrFilter(viewerPersonId: string | null): string {
  const publicFoods = 'source_type.neq.user,person_id.is.null';
  if (viewerPersonId && SAFE_VIEWER_ID.test(viewerPersonId)) {
    return `${publicFoods},person_id.eq.${viewerPersonId}`;
  }
  return publicFoods;
}
