/**
 * Durable grocery list item sorting (client-safe).
 */

import type { GroceryItem, GroceryItemStatus } from './types';

export type GroceryListSortMode =
  | 'newest'
  | 'oldest'
  | 'alpha_asc'
  | 'alpha_desc';

export const GROCERY_LIST_SORT_OPTIONS: Array<{
  value: GroceryListSortMode;
  label: string;
}> = [
  { value: 'newest', label: 'Date added — newest first' },
  { value: 'oldest', label: 'Date added — oldest first' },
  { value: 'alpha_asc', label: 'Alphabetical — A to Z' },
  { value: 'alpha_desc', label: 'Alphabetical — Z to A' },
];

const STORAGE_PREFIX = 'fd.grocery_list_sort.';

export function groceryListSortStorageKey(listId: string): string {
  return `${STORAGE_PREFIX}${listId}`;
}

export function loadGroceryListSortMode(listId: string): GroceryListSortMode {
  if (typeof window === 'undefined') return 'newest';
  try {
    const raw = window.localStorage.getItem(groceryListSortStorageKey(listId));
    if (
      raw === 'newest' ||
      raw === 'oldest' ||
      raw === 'alpha_asc' ||
      raw === 'alpha_desc'
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return 'newest';
}

export function saveGroceryListSortMode(listId: string, mode: GroceryListSortMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(groceryListSortStorageKey(listId), mode);
  } catch {
    // ignore
  }
}

function statusGroup(status: GroceryItemStatus): number {
  // Active (pending) first, then completed-like statuses.
  if (status === 'pending') return 0;
  if (status === 'have') return 1;
  if (status === 'bought') return 2;
  return 3; // skipped
}

function compareWithinGroup(
  a: GroceryItem,
  b: GroceryItem,
  mode: GroceryListSortMode,
  displayName: (item: GroceryItem) => string,
): number {
  if (mode === 'newest') {
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  }
  if (mode === 'oldest') {
    return a.created_at > b.created_at ? 1 : a.created_at < b.created_at ? -1 : 0;
  }
  const nameA = displayName(a).toLocaleLowerCase();
  const nameB = displayName(b).toLocaleLowerCase();
  if (mode === 'alpha_asc') return nameA.localeCompare(nameB);
  return nameB.localeCompare(nameA);
}

/**
 * Preserve status grouping (active vs completed), sort within groups.
 */
export function sortGroceryListItems(options: {
  items: GroceryItem[];
  mode: GroceryListSortMode;
  displayName?: (item: GroceryItem) => string;
}): GroceryItem[] {
  const displayName = options.displayName ?? ((item: GroceryItem) => item.name);
  return [...options.items].sort((a, b) => {
    const group = statusGroup(a.status) - statusGroup(b.status);
    if (group !== 0) return group;
    return compareWithinGroup(a, b, options.mode, displayName);
  });
}
