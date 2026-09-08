import type {
  GeneratedGroceryList,
  GroceryHaulItem,
  GroceryHaulStatus,
} from '@/lib/plans/types';

export function groceryListTitle(list: GeneratedGroceryList): string {
  return list.title?.trim() || (list.is_default ? 'Essentials' : 'Untitled List');
}

export function haulStatusLabel(status: GroceryHaulStatus): string {
  if (status === 'planned') return 'Draft';
  if (status === 'active') return 'In progress';
  if (status === 'closed') return 'Completed';
  return 'Cancelled';
}

export function formatHaulDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatHaulCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function sourceDemandLabel(item: GroceryHaulItem): string {
  const quantity = item.quantity_snapshot;
  if (quantity == null) return item.unit_snapshot ? `Need · ${item.unit_snapshot}` : 'Need';
  return `Need · ${quantity}${item.unit_snapshot ? ` ${item.unit_snapshot}` : ''}`;
}

export function itemStoreLabel(item: GroceryHaulItem): string | null {
  return [item.retailer, item.store_location, item.postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' · ') || null;
}
