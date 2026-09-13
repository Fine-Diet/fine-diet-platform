export interface MonthProjectionRequest {
  token: number;
  identity: string;
}

export interface MonthProjectionSession {
  generation: number;
  identity: string;
}

export function newMonthProjectionSession(): MonthProjectionSession {
  return {
    generation: 0,
    identity: '',
  };
}

export function monthProjectionIdentity(
  monthKey: string,
  visibleDates: readonly string[],
): string {
  return `${monthKey}::${visibleDates.join('|')}`;
}

export function beginMonthProjectionRequest(
  session: MonthProjectionSession,
  identity: string,
): MonthProjectionRequest {
  session.generation += 1;
  session.identity = identity;
  return {
    token: session.generation,
    identity,
  };
}

export function isCurrentMonthProjectionRequest(
  session: MonthProjectionSession,
  request: MonthProjectionRequest,
): boolean {
  return request.token === session.generation && request.identity === session.identity;
}

export function applyMonthProjectionResult(
  session: MonthProjectionSession,
  request: MonthProjectionRequest,
  apply: () => void,
): boolean {
  if (!isCurrentMonthProjectionRequest(session, request)) return false;
  apply();
  return true;
}

export function shouldRefreshMonthAfterMutation(
  session: MonthProjectionSession,
  originIdentity: string,
): boolean {
  return session.identity === originIdentity;
}
