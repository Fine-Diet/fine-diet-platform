import type { GroceryShoppingOverride, GroceryShoppingOverrideBundle } from './types';
import type { GroceryListScope } from './groceryShoppingOverrideStore';

function scopeSpecificity(
  override: GroceryShoppingOverride,
  scope: GroceryListScope,
): number {
  const exact =
    override.date_range_start === scope.dateStart &&
    override.date_range_end === scope.dateEnd;
  if (exact) return 3;
  const contains =
    override.date_range_start <= scope.dateStart &&
    override.date_range_end >= scope.dateEnd;
  if (contains) return 2;
  const overlaps =
    override.date_range_start <= scope.dateEnd &&
    override.date_range_end >= scope.dateStart;
  return overlaps ? 1 : 0;
}

function daySpan(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

function pickBestOverride(
  candidates: GroceryShoppingOverride[],
  scope: GroceryListScope,
): GroceryShoppingOverride | null {
  const [chosen] = [...candidates].sort((a, b) => {
    const specificityDelta = scopeSpecificity(b, scope) - scopeSpecificity(a, scope);
    if (specificityDelta !== 0) return specificityDelta;
    const spanDelta =
      daySpan(a.date_range_start, a.date_range_end) -
      daySpan(b.date_range_start, b.date_range_end);
    if (spanDelta !== 0) return spanDelta;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return chosen ?? null;
}

export function buildShoppingOverrideBundle(
  overrides: GroceryShoppingOverride[],
  activeMatchKeys: Set<string>,
  scope?: GroceryListScope,
): GroceryShoppingOverrideBundle {
  const by_match_key: Record<string, GroceryShoppingOverride> = {};
  const unmatched: GroceryShoppingOverride[] = [];
  const grouped = new Map<string, GroceryShoppingOverride[]>();

  for (const override of overrides) {
    const bucket = grouped.get(override.match_key) ?? [];
    bucket.push(override);
    grouped.set(override.match_key, bucket);
  }

  for (const matchKey of Array.from(activeMatchKeys)) {
    const candidates = grouped.get(matchKey) ?? [];
    if (candidates.length === 0) continue;
    const chosen = scope ? pickBestOverride(candidates, scope) : candidates[0]!;
    if (!chosen) continue;
    if (!activeMatchKeys.has(chosen.match_key)) continue;
    by_match_key[matchKey] = chosen;
  }

  for (const override of overrides) {
    if (by_match_key[override.match_key]?.id === override.id) continue;
    if (activeMatchKeys.has(override.match_key)) continue;
    unmatched.push(override);
  }

  return { by_match_key, unmatched };
}
