import type { GroceryHaulItem, GroceryHaulStatus } from '@/lib/plans/types';

/**
 * Canonical internal status labels (preserved for existing contracts/tests).
 * The canonical status values are planned / active / closed / cancelled.
 */
export const GROCERY_HAUL_STATUS_LABELS: Record<GroceryHaulStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function formatGroceryHaulStatusLabel(status: GroceryHaulStatus): string {
  return GROCERY_HAUL_STATUS_LABELS[status];
}

/**
 * Packet 11F — User-facing conceptual status labels.
 *
 * Maps canonical status to the shopping-occasion language a user naturally
 * expects. Presentation-only: does NOT change any canonical status value,
 * schema, or write path.
 *
 *   planned  → Planned   (unchanged — clearly pre-execution)
 *   active   → Shopping  (user is actively executing the haul)
 *   closed   → Complete  (haul execution finished)
 *   cancelled → Cancelled (unchanged — self-explanatory)
 */
export const GROCERY_HAUL_USER_FACING_STATUS_LABELS: Record<GroceryHaulStatus, string> = {
  planned: 'Planned',
  active: 'Shopping',
  closed: 'Complete',
  cancelled: 'Cancelled',
};

export function formatGroceryHaulUserFacingStatusLabel(status: GroceryHaulStatus): string {
  return GROCERY_HAUL_USER_FACING_STATUS_LABELS[status];
}

/**
 * Packet 11F — Presentation-only derived Haul display name.
 *
 * Derives a human-readable occasion label from shopping_date without
 * persisting any title. The Haul identity remains (id, status, shopping_date).
 *
 * Rules:
 *   - shopping_date is an ISO date string (YYYY-MM-DD), always treated as
 *     local calendar date (no timezone inference).
 *   - Today  → "Today's Haul"
 *   - Future/current week weekday → "<Weekday> Haul" (e.g. "Saturday Haul")
 *   - Past or further future → "<Mon DD> Haul" (e.g. "Aug 15 Haul")
 *
 * Deterministic: no Date.now() calls inside; caller supplies todayIso so
 * tests remain stable.
 */
export function formatGroceryHaulDisplayName(
  shoppingDateIso: string,
  todayIso: string,
): string {
  if (shoppingDateIso === todayIso) {
    return "Today's Haul";
  }

  const d = new Date(`${shoppingDateIso}T00:00:00`);
  const today = new Date(`${todayIso}T00:00:00`);

  // Days difference: positive = future, negative = past
  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  // Within the coming 6 days → use weekday name
  if (diffDays > 0 && diffDays <= 6) {
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} Haul`;
  }

  // Past or further future → "Mon DD Haul"
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${label} Haul`;
}

export function formatGroceryHaulSnapshotAmount(item: Pick<
  GroceryHaulItem,
  'quantity_snapshot' | 'unit_snapshot'
>): string {
  if (item.quantity_snapshot != null && item.unit_snapshot) {
    return `${item.quantity_snapshot} ${item.unit_snapshot}`;
  }
  if (item.quantity_snapshot != null) return String(item.quantity_snapshot);
  if (item.unit_snapshot) return item.unit_snapshot;
  return 'Amount not specified';
}

export function formatGroceryHaulSnapshotProvenance(
  sourceType: GroceryHaulItem['source_type_snapshot'],
): string | null {
  if (sourceType === 'planned_meal') return 'From a plan';
  if (sourceType === 'manual') return 'Added by you';
  if (sourceType && sourceType !== 'system') return sourceType.replace(/_/g, ' ');
  return null;
}
