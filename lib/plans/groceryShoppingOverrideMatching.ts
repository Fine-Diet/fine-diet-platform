import type { GroceryShoppingOverride, GroceryShoppingOverrideBundle } from './types';

export function buildShoppingOverrideBundle(
  overrides: GroceryShoppingOverride[],
  activeMatchKeys: Set<string>,
): GroceryShoppingOverrideBundle {
  const by_match_key: Record<string, GroceryShoppingOverride> = {};
  const unmatched: GroceryShoppingOverride[] = [];

  for (const override of overrides) {
    if (override.match_status === 'unmatched' || !activeMatchKeys.has(override.match_key)) {
      unmatched.push(override);
      continue;
    }
    by_match_key[override.match_key] = override;
  }

  return { by_match_key, unmatched };
}
