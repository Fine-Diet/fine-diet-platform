/**
 * Pure helpers for durable-list haul provenance scopes.
 */

import type { GroceryItem } from './types';
import type { GroceryListScope } from './groceryShoppingOverrideStore';

export function extractPlanScopesFromPersistentItems(items: GroceryItem[]): GroceryListScope[] {
  const scopes = new Map<string, GroceryListScope>();
  for (const item of items) {
    if (item.source_type !== 'planned_meal') continue;
    if (typeof item.source_id !== 'string' || !item.source_id) continue;
    const detail = (item.source_detail_json ?? {}) as Record<string, unknown>;
    const dateStart = detail.date_range_start;
    const dateEnd = detail.date_range_end;
    if (typeof dateStart !== 'string' || typeof dateEnd !== 'string') continue;
    if (!dateStart || !dateEnd) continue;
    const key = `${item.source_id}|${dateStart}|${dateEnd}`;
    if (!scopes.has(key)) {
      scopes.set(key, {
        planId: item.source_id,
        dateStart,
        dateEnd,
      });
    }
  }
  return Array.from(scopes.values());
}

export function itemProvenanceScope(item: GroceryItem): GroceryListScope | null {
  if (item.source_type !== 'planned_meal') return null;
  if (typeof item.source_id !== 'string' || !item.source_id) return null;
  const detail = (item.source_detail_json ?? {}) as Record<string, unknown>;
  const dateStart = detail.date_range_start;
  const dateEnd = detail.date_range_end;
  if (typeof dateStart !== 'string' || typeof dateEnd !== 'string') return null;
  return { planId: item.source_id, dateStart, dateEnd };
}

export function persistentListScopeKey(scope: GroceryListScope): string {
  return `${scope.planId}|${scope.dateStart}|${scope.dateEnd}`;
}
