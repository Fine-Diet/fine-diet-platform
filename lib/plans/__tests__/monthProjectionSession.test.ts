import {
  applyMonthProjectionResult,
  beginMonthProjectionRequest,
  newMonthProjectionSession,
  monthProjectionIdentity,
  shouldRefreshMonthAfterMutation,
} from '../monthProjectionSession';

describe('Packet 19 Correction C4 — month projection request identity', () => {
  it('ignores a mutation refresh whose origin month is no longer visible', async () => {
    const session = newMonthProjectionSession();
    const monthA = monthProjectionIdentity('2026-10', ['2026-10-01', '2026-10-15']);
    const monthB = monthProjectionIdentity('2026-11', ['2026-11-01', '2026-11-15']);
    const applied: string[] = [];

    const originA = beginMonthProjectionRequest(session, monthA);
    applyMonthProjectionResult(session, originA, () => applied.push('load-A'));

    const originB = beginMonthProjectionRequest(session, monthB);
    applyMonthProjectionResult(session, originB, () => applied.push('load-B'));

    expect(shouldRefreshMonthAfterMutation(session, monthA)).toBe(false);
    expect(shouldRefreshMonthAfterMutation(session, monthB)).toBe(true);

    if (shouldRefreshMonthAfterMutation(session, monthA)) {
      const lateA = beginMonthProjectionRequest(session, monthA);
      applyMonthProjectionResult(session, lateA, () => applied.push('refresh-A'));
    }

    expect(applied).toEqual(['load-A', 'load-B']);
    expect(session.identity).toBe(monthB);
  });

  it('keeps last-valid-request-wins for overlapping refreshes of the current month', async () => {
    const session = newMonthProjectionSession();
    const monthA = monthProjectionIdentity('2026-10', ['2026-10-01', '2026-10-15']);
    const applied: string[] = [];

    const first = beginMonthProjectionRequest(session, monthA);
    const second = beginMonthProjectionRequest(session, monthA);

    applyMonthProjectionResult(session, second, () => applied.push('second'));
    applyMonthProjectionResult(session, first, () => applied.push('first'));

    expect(applied).toEqual(['second']);
  });
});
