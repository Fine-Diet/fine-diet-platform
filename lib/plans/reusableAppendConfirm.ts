/**
 * Append confirmation helpers for reusable template/pattern instantiation.
 *
 * `allow_duplicate_append` is server authorization to bypass the populated-target
 * guard. It must be sent ONLY after an explicit user confirmation — never as a
 * default when the client snapshot happens to look empty.
 */

export interface AppendConfirmDecision {
  shouldProceed: boolean;
  /** Include in instantiate request body only when true. */
  allowDuplicateAppend?: true;
}

export function resolveAppendConfirmDecision(
  targetHasMeals: boolean,
  userConfirmed: boolean,
): AppendConfirmDecision {
  if (!targetHasMeals) {
    return { shouldProceed: true };
  }
  if (!userConfirmed) {
    return { shouldProceed: false };
  }
  return { shouldProceed: true, allowDuplicateAppend: true };
}

export function buildInstantiateAppendBody(
  base: Record<string, unknown>,
  decision: AppendConfirmDecision,
): Record<string, unknown> {
  if (!decision.allowDuplicateAppend) return base;
  return { ...base, allow_duplicate_append: true };
}
