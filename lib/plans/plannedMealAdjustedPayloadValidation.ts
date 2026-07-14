/**
 * Server-side trust boundary for log_adjusted payloads.
 *
 * Client derivation is the primary path, but the execute endpoint rejects
 * review-required or internally inconsistent grouped payloads before writing.
 */
import type { GroupedMealEntryPayload } from '@/lib/meals/types';

export function assertAdjustedIntakePayloadAcceptable(payload: GroupedMealEntryPayload): void {
  const group = payload.meal_group;
  if (!group) {
    throw new Error('Adjusted intake payload must include a meal_group.');
  }
  if (group.needs_review) {
    throw new Error('Adjusted intake payload requires nutrition review.');
  }
  if (group.components.some((c) => c.needs_review)) {
    throw new Error('Adjusted intake payload has components needing review.');
  }
  if (group.totals?.calories == null) {
    throw new Error('Adjusted intake payload is missing derived nutrition totals.');
  }
  if (
    payload.calories != null &&
    Math.round(payload.calories) !== Math.round(group.totals.calories)
  ) {
    throw new Error('Adjusted intake payload has inconsistent calorie totals.');
  }
}
