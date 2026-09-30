import type { GroceryHaulItem } from '@/lib/plans/types';

export type HaulBuilderViewerRole = 'owner' | 'contributor';

export function isHaulContributorOriginItem(item: GroceryHaulItem): boolean {
  return item.origin_type === 'haul_contributor';
}

/** Whether the viewer may PATCH/DELETE this Haul-only contributor item while Draft. */
export function canMutateHaulContributorItem(
  item: GroceryHaulItem,
  viewer: { role: HaulBuilderViewerRole; personId: string },
  haulStatus: string,
): boolean {
  if (haulStatus !== 'planned') return false;
  if (!isHaulContributorOriginItem(item)) return false;
  if (viewer.role === 'owner') return true;
  return item.added_by_person_id === viewer.personId;
}

/** Names survive revoke: any invitation row with a person id can label historical items. */
export function contributorNamesFromInvitations(
  invitations: Array<{ invited_person_id: string | null; invited_display_name: string | null }>,
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const invitation of invitations) {
    if (!invitation.invited_person_id) continue;
    if (map.get(invitation.invited_person_id)) continue;
    map.set(invitation.invited_person_id, invitation.invited_display_name);
  }
  return map;
}

export function haulContributorAttributionLabel(
  item: GroceryHaulItem,
  namesByPersonId: Map<string, string | null>,
): string | null {
  if (!isHaulContributorOriginItem(item)) return null;
  const personId = item.added_by_person_id;
  if (!personId) return 'Added to Haul';
  const name = namesByPersonId.get(personId);
  return name ? `Added by ${name}` : 'Added to Haul';
}
