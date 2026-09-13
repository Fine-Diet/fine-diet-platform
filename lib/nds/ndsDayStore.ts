/**
 * Browser-scoped shared refresh identity for the daily NDS.
 *
 * NDS Integrity v1.
 *
 * Before this, every mounted consumer of `useNDS` owned a private fetch, a
 * private cache and a private idea of when to refetch. Four surfaces render the
 * same day at once — the log page gauge, the app home scroller, the journal home
 * card and insights — so a single day of eating could be requested four times and
 * then displayed as four different numbers, and a mutation on one surface had no
 * way to tell the others that their number was now wrong. The log page papered
 * over this with a page-local entry fingerprint that had to guess whether the
 * first population of the entry list was a user mutation.
 *
 * The fix is one entry per (person, day) shared by every subscriber:
 *   - one in-flight request, so simultaneous mounts cannot disagree;
 *   - one snapshot, so every surface prints the same state;
 *   - one invalidation entry point, `notifyNdsSourceChanged`, so a write anywhere
 *     refreshes everywhere without any page deciding what "changed" means.
 *
 * This is a small purpose-built store rather than a data-fetching framework: no
 * dependency is added, and the only cached thing is a value the server already
 * declares the freshness of.
 *
 * The server is the authority on freshness. A client never asks for a
 * recomputation; it asks for the current state, and the state tells it whether a
 * newer one is coming. `updating` therefore drives a BOUNDED backoff refresh, so
 * a day converges after the worker publishes without any surface polling forever.
 */

import type { DailyNdsState } from './dailyNdsState';

// ============================================================================
// Public shape
// ============================================================================

export interface NdsResponseMeta {
  invalidation_reason: string | null;
  publish_reason: string | null;
  resolved_at: string;
}

export interface NdsDaySnapshot {
  /** The server's state for this day, or null before the first answer. */
  state: DailyNdsState | null;
  isLoading: boolean;
  /**
   * A human-facing failure to REACH the score, e.g. the network is down. A day
   * the server could not score arrives as `state.state === 'unavailable'`, not
   * here, because that is an answer rather than a failure to get one.
   */
  error: string | null;
  meta: NdsResponseMeta | null;
  debugData: Record<string, unknown> | null;
}

export interface NdsAuthContext {
  /** Increments on sign-in, sign-out, and account switch. Token refresh does not. */
  sessionEpoch: number;
  /** Resolved subject after auth; null before identity is known. */
  subjectPersonId: string | null;
}

let authContext: NdsAuthContext = { sessionEpoch: 0, subjectPersonId: null };
let lastAuthUserId: string | null = null;

export function getNdsAuthContext(): NdsAuthContext {
  return authContext;
}

/**
 * Bind the store to the current authenticated subject.
 *
 * Implicit `@self` and an explicit person id for the same subject share one
 * cache identity after this is set. A new epoch clears protected values.
 */
export function bindNdsAuthContext(next: {
  subjectPersonId?: string | null;
  authUserId?: string | null;
  epochChanged?: boolean;
}): void {
  const authUserChanged =
    next.authUserId !== undefined && next.authUserId !== lastAuthUserId;
  const epochChanged = next.epochChanged === true || authUserChanged;
  if (next.authUserId !== undefined) lastAuthUserId = next.authUserId;
  const nextSubject =
    next.subjectPersonId !== undefined ? next.subjectPersonId : authContext.subjectPersonId;
  const subjectChanged = nextSubject !== authContext.subjectPersonId;
  if (epochChanged || subjectChanged) {
    resetNdsDayStore();
    authContext = {
      sessionEpoch: authContext.sessionEpoch + 1,
      subjectPersonId: nextSubject,
    };
    return;
  }
  authContext = { ...authContext, subjectPersonId: nextSubject };
}

export interface NdsDayKeyParts {
  /** Omitted means "the authenticated person", which the server resolves. */
  personId?: string | null;
  dateLocal: string;
  sessionEpoch?: number;
}

function canonicalPersonId(personId?: string | null): string {
  if (personId && personId === authContext.subjectPersonId) return personId;
  if (!personId && authContext.subjectPersonId) return authContext.subjectPersonId;
  return personId ?? '@self';
}

export function ndsDayKey({ personId, dateLocal, sessionEpoch }: NdsDayKeyParts): string {
  const epoch = sessionEpoch ?? authContext.sessionEpoch;
  return `${epoch}|${canonicalPersonId(personId)}|${dateLocal}`;
}

const IDLE_SNAPSHOT: NdsDaySnapshot = Object.freeze({
  state: null,
  isLoading: false,
  error: null,
  meta: null,
  debugData: null,
});

/** Stable identity for a day nothing has asked about yet. */
export function initialNdsDaySnapshot(): NdsDaySnapshot {
  return IDLE_SNAPSHOT;
}

// ============================================================================
// Backoff schedule for a day the server says is still being recomputed
// ============================================================================

/**
 * Delays, in ms, before each follow-up read of a day reported as `updating`.
 * Deliberately finite: if the worker never publishes, the UI keeps showing the
 * labelled stale score rather than hammering the endpoint forever.
 */
const UPDATING_BACKOFF_MS = [1_500, 3_000, 6_000, 12_000] as const;

// ============================================================================
// Internal entry
// ============================================================================

interface NdsDayEntry {
  key: string;
  parts: NdsDayKeyParts;
  snapshot: NdsDaySnapshot;
  listeners: Set<() => void>;
  inFlight: Promise<void> | null;
  /** Monotonic; a response from an older sequence is discarded. */
  sequence: number;
  pollTimer: ReturnType<typeof setTimeout> | null;
  pollAttempt: number;
  includeDebug: boolean;
  /**
   * Set when the day is known to have changed while a read was already in
   * flight. That read may have observed the pre-change revision, so coalescing
   * into it would leave the UI one revision behind with nothing scheduled to fix
   * it. The read is repeated exactly once instead.
   */
  refreshAgainWhenDone: boolean;
  /** True when a committed mutation or lifecycle event made this snapshot noncurrent. */
  dirty: boolean;
}

const entries = new Map<string, NdsDayEntry>();

function entryFor(parts: NdsDayKeyParts): NdsDayEntry {
  const key = ndsDayKey(parts);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      key,
      parts: {
        personId: parts.personId ?? null,
        dateLocal: parts.dateLocal,
        sessionEpoch: parts.sessionEpoch ?? authContext.sessionEpoch,
      },
      snapshot: IDLE_SNAPSHOT,
      listeners: new Set(),
      inFlight: null,
      sequence: 0,
      pollTimer: null,
      pollAttempt: 0,
      includeDebug: false,
      refreshAgainWhenDone: false,
      dirty: false,
    };
    entries.set(key, entry);
  }
  return entry;
}

function publish(entry: NdsDayEntry, snapshot: NdsDaySnapshot): void {
  entry.snapshot = snapshot;
  // Copy first: a listener may unsubscribe during notification.
  const listeners = Array.from(entry.listeners);
  for (const listener of listeners) listener();
}

function clearPoll(entry: NdsDayEntry): void {
  if (entry.pollTimer !== null) {
    clearTimeout(entry.pollTimer);
    entry.pollTimer = null;
  }
}

// ============================================================================
// Transport
// ============================================================================

export interface NdsFetchResult {
  state: DailyNdsState;
  meta: NdsResponseMeta | null;
  debugData: Record<string, unknown> | null;
}

export type NdsDayFetcher = (
  parts: NdsDayKeyParts & { includeDebug: boolean },
) => Promise<NdsFetchResult>;

async function httpFetchNdsDay({
  personId,
  dateLocal,
  includeDebug,
}: NdsDayKeyParts & { includeDebug: boolean }): Promise<NdsFetchResult> {
  const params = new URLSearchParams();
  params.set('date_local', dateLocal);
  if (personId) params.set('person_id', personId);
  if (includeDebug) params.set('include_debug', 'true');

  const timeZone = browserTimeZone();
  const response = await fetch(`/api/journal/nds?${params.toString()}`, {
    headers: timeZone ? { 'x-fd-time-zone': timeZone } : undefined,
  });

  const body = await response.json().catch(() => null);

  // 503 is the documented carrier for `state: 'unavailable'`. It is an ANSWER
  // about the day, so it is returned as state rather than thrown as a transport
  // failure; anything else without a usable body is a real failure.
  const state = body && typeof body === 'object' ? (body as Record<string, unknown>).nds : null;
  if (!response.ok && !isDailyNdsState(state)) {
    const message =
      body && typeof (body as Record<string, unknown>).error === 'string'
        ? ((body as Record<string, unknown>).error as string)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!isDailyNdsState(state)) {
    throw new Error('Malformed nutrition density response');
  }

  const rawMeta = (body as Record<string, unknown>)._meta;
  const rawDebug = (body as Record<string, unknown>).debug_data;
  return {
    state,
    meta: isPlainRecord(rawMeta) ? (rawMeta as unknown as NdsResponseMeta) : null,
    debugData: isPlainRecord(rawDebug) ? (rawDebug as Record<string, unknown>) : null,
  };
}

let fetcher: NdsDayFetcher = httpFetchNdsDay;

/** Test seam. Returns a restore function; there is no other way to swap this. */
export function setNdsDayFetcherForTests(next: NdsDayFetcher): () => void {
  const previous = fetcher;
  fetcher = next;
  return () => {
    fetcher = previous;
  };
}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const KNOWN_STATES = new Set([
  'fresh',
  'updating',
  'empty',
  'insufficient_data',
  'unavailable',
]);

/**
 * Accepts only a state this build understands.
 *
 * A state name added by a newer server is treated as malformed rather than
 * rendered blank, because a silent blank gauge is indistinguishable from a day
 * with no food in it.
 */
function isDailyNdsState(value: unknown): value is DailyNdsState {
  if (!isPlainRecord(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.state === 'string' && KNOWN_STATES.has(record.state);
}

// ============================================================================
// Reads
// ============================================================================

export function getNdsDaySnapshot(parts: NdsDayKeyParts): NdsDaySnapshot {
  return entries.get(ndsDayKey(parts))?.snapshot ?? IDLE_SNAPSHOT;
}

export function subscribeToNdsDay(parts: NdsDayKeyParts, listener: () => void): () => void {
  const entry = entryFor(parts);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      // Nothing is watching, so stop the backoff. The snapshot is kept so a
      // remount shows the last known state instead of flashing to loading.
      clearPoll(entry);
      entry.pollAttempt = 0;
    }
  };
}

/**
 * Read the day if it has never been read, or if a previous read failed.
 *
 * Safe to call on every render of every consumer; a day already answered is not
 * re-requested.
 */
export function ensureNdsDayLoaded(
  parts: NdsDayKeyParts & { includeDebug?: boolean },
): Promise<void> {
  const entry = entryFor(parts);
  if (parts.includeDebug) entry.includeDebug = true;

  const needsDebug = entry.includeDebug && entry.snapshot.debugData === null;
  const answered = entry.snapshot.state !== null && entry.snapshot.error === null;
  if (answered && !needsDebug && !entry.dirty) return Promise.resolve();

  return refreshNdsDay(parts);
}

/**
 * Read the day now, coalescing with any read already in flight.
 *
 * There is no `force`, and no client-driven recomputation: the server decides
 * whether the cached score is still valid from the day's source revision, which
 * is the only fact that actually settles it.
 */
export function refreshNdsDay(
  parts: NdsDayKeyParts & { includeDebug?: boolean; sourceChanged?: boolean },
): Promise<void> {
  const entry = entryFor(parts);
  if (parts.includeDebug) entry.includeDebug = true;
  if (entry.inFlight) {
    if (parts.sourceChanged) entry.refreshAgainWhenDone = true;
    return entry.inFlight;
  }

  const sequence = ++entry.sequence;
  clearPoll(entry);

  publish(entry, {
    ...entry.snapshot,
    // Preserve the previous state while reloading. Blanking it here would make
    // every refresh flash the gauge through "no score".
    isLoading: true,
  });

  const request = (async () => {
    try {
      const result = await fetcher({
        personId: entry.parts.personId,
        dateLocal: entry.parts.dateLocal,
        includeDebug: entry.includeDebug,
      });
      if (sequence !== entry.sequence) return;
      if (result.state.state === 'unavailable' && result.state.reason === 'not_authorized') {
        publish(entry, IDLE_SNAPSHOT);
        entry.dirty = false;
        return;
      }
      entry.dirty = false;
      publish(entry, {
        state: result.state,
        isLoading: false,
        error: null,
        meta: result.meta,
        debugData: result.debugData,
      });
      scheduleUpdatingFollowUp(entry);
    } catch (error) {
      if (sequence !== entry.sequence) return;
      const message = error instanceof Error ? error.message : 'Failed to load nutrition density';
      const unauthorized = /401|403|not authorized|unauthorized/i.test(message);
      if (unauthorized) {
        publish(entry, {
          state: null,
          isLoading: false,
          error: message,
          meta: null,
          debugData: null,
        });
        entry.dirty = false;
        return;
      }
      publish(entry, {
        // The last known state is retained. A transport failure is not evidence
        // that the day has no score, and it is not permission to relabel it fresh.
        state: entry.snapshot.state,
        isLoading: false,
        error: message,
        meta: entry.snapshot.meta,
        debugData: entry.snapshot.debugData,
      });
    } finally {
      if (sequence === entry.sequence) {
        entry.inFlight = null;
        if (entry.refreshAgainWhenDone) {
          entry.refreshAgainWhenDone = false;
          entry.pollAttempt = 0;
          void refreshNdsDay(entry.parts);
        }
      }
    }
  })();

  entry.inFlight = request;
  return request;
}

function scheduleUpdatingFollowUp(entry: NdsDayEntry): void {
  if (entry.snapshot.state?.state !== 'updating') {
    entry.pollAttempt = 0;
    return;
  }
  if (entry.listeners.size === 0) return;

  const delay = UPDATING_BACKOFF_MS[entry.pollAttempt];
  if (delay === undefined) return; // Bounded: give up and keep the labelled score.
  entry.pollAttempt += 1;

  // A settled day reschedules nothing, so the chain ends on its own.
  entry.pollTimer = setTimeout(() => {
    entry.pollTimer = null;
    if (entry.listeners.size === 0) return;
    void refreshNdsDay(entry.parts);
  }, delay);
}

/**
 * Tell every surface that a person's logged intake changed.
 *
 * This replaces per-page mutation detection. `dateLocal` is optional because a
 * caller often does not know which day it touched — moving an entry across
 * midnight changes two — and re-reading a day is cheap and idempotent.
 */
export function notifyNdsSourceChanged(parts: { personId?: string | null; dateLocal?: string } = {}): void {
  const targetPerson = parts.personId ?? null;
  for (const entry of Array.from(entries.values())) {
    if (parts.dateLocal && entry.parts.dateLocal !== parts.dateLocal) continue;
    if (
      targetPerson &&
      canonicalPersonId(entry.parts.personId) !== canonicalPersonId(targetPerson)
    ) {
      continue;
    }
    entry.dirty = true;
    entry.pollAttempt = 0;
    if (entry.listeners.size === 0) continue;
    void refreshNdsDay({ ...entry.parts, sourceChanged: true });
  }
}

/**
 * Shared write-boundary notification. Call after a committed consumption
 * mutation. Marks every affected day dirty, including unmounted caches.
 */
export function notifyNdsConsumptionCommitted(input: {
  personId?: string | null;
  dateLocals: readonly string[];
}): void {
  const days = input.dateLocals.length > 0 ? input.dateLocals : [undefined];
  for (const dateLocal of days) {
    notifyNdsSourceChanged({ personId: input.personId, dateLocal });
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('fd_nds_invalidate', String(Date.now()));
    } catch {
      // Same-tab invalidation already happened above.
    }
  }
}

/** Drops all cached days. Used on sign-out and by tests. */
export function resetNdsDayStore(): void {
  for (const entry of Array.from(entries.values())) {
    clearPoll(entry);
    entry.sequence += 1; // Invalidate any in-flight response.
  }
  entries.clear();
}
