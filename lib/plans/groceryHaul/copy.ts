import type { GroceryHaulItem, GroceryHaulStatus } from '@/lib/plans/types';

export const GROCERY_HAUL_STATUS_LABELS: Record<GroceryHaulStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function formatGroceryHaulStatusLabel(status: GroceryHaulStatus): string {
  return GROCERY_HAUL_STATUS_LABELS[status];
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
