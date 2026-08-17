/**
 * Canonical Pantry Quick Start writes.
 *
 * Session identity is applied by POST /api/journal/plans/pantry. This helper
 * never includes a person identifier, never writes the client DB, and always
 * sends if_absent so product defaults cannot overwrite saved Pantry truth.
 */

import type { PantryOnHandItem } from '@/lib/plans/types';
import type { PantryQuickStartWrite } from './proposalPolicy';

export async function savePantryQuickStartWrites(
  writes: PantryQuickStartWrite[],
): Promise<
  | { ok: true; saved: PantryOnHandItem[]; skippedExisting: number }
  | { ok: false; error: string }
> {
  const saved: PantryOnHandItem[] = [];
  let skippedExisting = 0;

  for (const write of writes) {
    try {
      const res = await fetch('/api/journal/plans/pantry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          food_object_id: write.foodObjectId,
          quantity: write.quantity,
          unit: write.unit,
          if_absent: true,
        }),
      });
      if (res.status === 409) {
        skippedExisting += 1;
        continue;
      }
      if (!res.ok) {
        return { ok: false, error: 'Could not save your pantry starters. Try again.' };
      }
      const json = (await res.json()) as { pantry_item?: PantryOnHandItem; created?: boolean };
      if (json.pantry_item) saved.push(json.pantry_item);
      if (json.created === false) skippedExisting += 1;
    } catch {
      return { ok: false, error: 'Could not save your pantry starters. Try again.' };
    }
  }

  return { ok: true, saved, skippedExisting };
}
