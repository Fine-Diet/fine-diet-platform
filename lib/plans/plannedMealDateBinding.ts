/**
 * Explicit plannedMealId lookups must bind to the meal's plan-day date.
 */
export function assertPlannedMealDateBinding(
  planDayDateLocal: string,
  requestedDateLocal: string | undefined,
): void {
  if (requestedDateLocal && planDayDateLocal !== requestedDateLocal) {
    throw new Error('Planned meal not found for this date.');
  }
}

export function plannedMealMatchesRequestedDate(
  planDayDateLocal: string,
  requestedDateLocal: string | undefined,
): boolean {
  if (!requestedDateLocal) return true;
  return planDayDateLocal === requestedDateLocal;
}
