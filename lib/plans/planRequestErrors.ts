/**
 * Typed request-layer errors for Plans mutation endpoints.
 *
 * API routes translate these to explicit HTTP status codes via
 * `instanceof` checks, so malformed client input (bad application_mode,
 * out-of-range repeat_weeks, malformed until_date_local, impossible date
 * ordering, oversized span requests, etc.) always surfaces as a 4xx with a
 * clear message instead of falling through to a generic 500.
 */

/** Client sent a malformed or out-of-bounds request. Maps to HTTP 400. */
export class PlanRequestValidationError extends Error {
  readonly status = 400 as const;
  readonly code = 'PLAN_REQUEST_INVALID' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PlanRequestValidationError';
    // TypeScript compiles classes extending built-ins down to ES5 per this
    // repo's tsconfig target, which breaks `instanceof` for subclasses
    // unless the prototype chain is restored explicitly.
    Object.setPrototypeOf(this, PlanRequestValidationError.prototype);
  }
}

/** Referenced plan/pattern/template/day was not found for this person. Maps to HTTP 404. */
export class PlanNotFoundError extends Error {
  readonly status = 404 as const;
  readonly code = 'PLAN_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PlanNotFoundError';
    Object.setPrototypeOf(this, PlanNotFoundError.prototype);
  }
}

/** Target span already has content and the caller must confirm append. Maps to HTTP 409. */
export class PlanAppendConflictError extends Error {
  readonly status = 409 as const;
  readonly code = 'PLAN_APPEND_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PlanAppendConflictError';
    Object.setPrototypeOf(this, PlanAppendConflictError.prototype);
  }
}

/**
 * Plan data failed an internal integrity check (e.g. non-contiguous
 * plan_days) that the request itself did not cause. Maps to HTTP 409 —
 * distinct from a 500 because it is a well-understood, actionable data
 * state rather than an unexpected server fault.
 */
export class PlanIntegrityError extends Error {
  readonly status = 409 as const;
  readonly code = 'PLAN_INTEGRITY_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PlanIntegrityError';
    Object.setPrototypeOf(this, PlanIntegrityError.prototype);
  }
}

export function httpStatusForPlanError(err: unknown): number | null {
  if (
    err instanceof PlanRequestValidationError ||
    err instanceof PlanNotFoundError ||
    err instanceof PlanAppendConflictError ||
    err instanceof PlanIntegrityError
  ) {
    return err.status;
  }
  return null;
}
