import {
  httpStatusForPlanError,
  PlanAppendConflictError,
  PlanIntegrityError,
  PlanNotFoundError,
  PlanRequestValidationError,
} from '../planRequestErrors';

describe('planRequestErrors', () => {
  test('each typed error passes instanceof checks after being thrown/caught (ES5 target safe)', () => {
    try {
      throw new PlanRequestValidationError('bad request');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanRequestValidationError);
      expect(err).toBeInstanceOf(Error);
    }

    try {
      throw new PlanNotFoundError('missing');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanNotFoundError);
    }

    try {
      throw new PlanAppendConflictError('conflict');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanAppendConflictError);
    }

    try {
      throw new PlanIntegrityError('integrity');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanIntegrityError);
    }
  });

  test('httpStatusForPlanError maps each typed error to its documented status code', () => {
    expect(httpStatusForPlanError(new PlanRequestValidationError('x'))).toBe(400);
    expect(httpStatusForPlanError(new PlanNotFoundError('x'))).toBe(404);
    expect(httpStatusForPlanError(new PlanAppendConflictError('x'))).toBe(409);
    expect(httpStatusForPlanError(new PlanIntegrityError('x'))).toBe(409);
  });

  test('httpStatusForPlanError returns null for plain errors so callers can fall back safely', () => {
    expect(httpStatusForPlanError(new Error('generic'))).toBeNull();
    expect(httpStatusForPlanError('not an error')).toBeNull();
  });
});
