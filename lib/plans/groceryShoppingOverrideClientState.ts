import type { GroceryShoppingOverride, GroceryShoppingOverrideBundle } from './types';

/**
 * Applies the authoritative override returned by price confirmation without
 * waiting for a grocery-list reload.
 */
export function applyConfirmedShoppingOverride(
  bundle: GroceryShoppingOverrideBundle,
  override: GroceryShoppingOverride | null,
): GroceryShoppingOverrideBundle {
  if (!override) return bundle;

  return {
    by_match_key: {
      ...bundle.by_match_key,
      [override.match_key]: override,
    },
    unmatched: bundle.unmatched.filter(
      (candidate) =>
        candidate.id !== override.id && candidate.match_key !== override.match_key,
    ),
  };
}
