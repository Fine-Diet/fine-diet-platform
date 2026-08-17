/**
 * Resolve product-default staple lookup queries to canonical food_objects.
 * Exact case-insensitive canonical_name only — no fuzzy/AI inference.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { PANTRY_QUICK_START_STAPLES } from './catalog';
import type { ResolvedStapleFood } from './proposalPolicy';

async function lookupCanonicalFood(lookupQuery: string): Promise<ResolvedStapleFood | null> {
  const query = lookupQuery.trim();
  if (!query) return null;

  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select('id, canonical_name')
    .ilike('canonical_name', query)
    .limit(5);

  if (error || !data || data.length === 0) return null;

  const exact =
    data.find(
      (row) =>
        typeof row.canonical_name === 'string' &&
        row.canonical_name.trim().toLowerCase() === query.toLowerCase(),
    ) ?? data[0];

  if (!exact || typeof exact.id !== 'string' || typeof exact.canonical_name !== 'string') {
    return null;
  }

  return { id: exact.id, canonicalName: exact.canonical_name };
}

export async function resolvePantryQuickStartFoods(): Promise<
  Record<string, ResolvedStapleFood | null>
> {
  const entries = await Promise.all(
    PANTRY_QUICK_START_STAPLES.map(async (staple) => {
      const resolved = await lookupCanonicalFood(staple.lookupQuery);
      return [staple.id, resolved] as const;
    }),
  );
  return Object.fromEntries(entries);
}
