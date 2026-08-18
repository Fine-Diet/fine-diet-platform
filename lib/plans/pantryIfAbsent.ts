/**
 * Packet 5 — if_absent insert semantics without a new schema.
 *
 * Reuses the existing (person_id, key) unique conflict. ON CONFLICT DO NOTHING
 * so an existing pantry row always wins and its quantity/unit stay unchanged.
 */

import type { PantryOnHandItem } from './types';

export const PANTRY_IF_ABSENT_UPSERT = {
  onConflict: 'person_id,key',
  ignoreDuplicates: true,
} as const;

export function resolvePantryIfAbsentWrite(args: {
  attempted: Pick<PantryOnHandItem, 'key' | 'quantity' | 'unit'>;
  inserted: PantryOnHandItem | null;
  existing: PantryOnHandItem | null;
}): { item: PantryOnHandItem; created: boolean } {
  if (args.inserted) {
    return { item: args.inserted, created: true };
  }
  if (args.existing) {
    return { item: args.existing, created: false };
  }
  throw new Error('Pantry on-hand item was not created and no existing row was found.');
}
