/**
 * NDS Integrity v1 — shared browser-scoped refresh identity.
 *
 * The store is deliberately plain (no React), so these tests exercise the actual
 * sharing, coalescing and backoff rules rather than a component's behaviour.
 */

import type { DailyNdsState } from '../dailyNdsState';
import {
  ensureNdsDayLoaded,
  getNdsDaySnapshot,
  ndsDayKey,
  notifyNdsSourceChanged,
  refreshNdsDay,
  resetNdsDayStore,
  setNdsDayFetcherForTests,
  subscribeToNdsDay,
  type NdsDayFetcher,
} from '../ndsDayStore';

const DAY = '2026-09-12';
const OTHER_DAY = '2026-09-13';

function freshState(overrides: Partial<DailyNdsState> = {}): DailyNdsState {
  return {
    state: 'fresh',
    date_local: DAY,
    person_id: 'person-1',
    nds_score_100: 71,
    subscores_10: { wfr: 8, ps: 7, pnd: 6, fp: 6, as: 9, mnc: 6, ob: 5 },
    readings: {
      wfr_percent: 80,
      protein_score_10: 7,
      fiber_g: 24,
      added_sugar_g: 6,
      plant_variety_score_10: 6,
      omega_balance_score_10: 5,
      micronutrient_coverage_score_10: 6,
    },
    computed_as_of: '2026-09-12T18:00:00.000Z',
    source_revision: 1,
    day_provenance: 'explicit',
    versions: {
      nds_version: 'v10',
      classifier_version: 'v2',
      normalizer_version: 'n1',
      day_policy_version: 'd1',
    },
    coverage: {
      added_sugar: 'known',
      scored_entry_count: 2,
      unscorable_entry_count: 0,
      limitations: [],
    },
    ...overrides,
  } as DailyNdsState;
}

function updatingState(): DailyNdsState {
  return {
    ...(freshState() as Record<string, unknown>),
    state: 'updating',
    stale_source_revision: 1,
    current_source_revision: 2,
  } as unknown as DailyNdsState;
}

/** Fetcher whose resolution the test controls, so races are deterministic. */
function deferredFetcher() {
  const calls: Array<{
    dateLocal: string;
    resolve: (state: DailyNdsState) => void;
    reject: (error: Error) => void;
  }> = [];

  const fetcher: NdsDayFetcher = ({ dateLocal }) =>
    new Promise((resolve, reject) => {
      calls.push({
        dateLocal,
        resolve: (state) => resolve({ state, meta: null, debugData: null }),
        reject,
      });
    });

  return { fetcher, calls };
}

let restoreFetcher: (() => void) | null = null;

afterEach(() => {
  restoreFetcher?.();
  restoreFetcher = null;
  resetNdsDayStore();
  jest.useRealTimers();
});

function install(fetcher: NdsDayFetcher) {
  restoreFetcher = setNdsDayFetcherForTests(fetcher);
}

describe('key identity', () => {
  it('treats an unspecified person as one shared identity', () => {
    // Four surfaces render "my score for today" without naming a person. They
    // must land on the same entry or they will disagree with each other.
    expect(ndsDayKey({ dateLocal: DAY })).toBe(ndsDayKey({ personId: null, dateLocal: DAY }));
  });

  it('keeps distinct people and distinct days apart', () => {
    expect(ndsDayKey({ personId: 'a', dateLocal: DAY })).not.toBe(
      ndsDayKey({ personId: 'b', dateLocal: DAY }),
    );
    expect(ndsDayKey({ dateLocal: DAY })).not.toBe(ndsDayKey({ dateLocal: OTHER_DAY }));
  });
});

describe('shared reads', () => {
  it('serves simultaneous consumers from one request', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const first = ensureNdsDayLoaded({ dateLocal: DAY });
    const second = ensureNdsDayLoaded({ dateLocal: DAY });

    expect(calls).toHaveLength(1);

    calls[0].resolve(freshState());
    await Promise.all([first, second]);

    expect(getNdsDaySnapshot({ dateLocal: DAY }).state?.state).toBe('fresh');
  });

  it('notifies every subscriber with the same snapshot', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);

    const seen: Array<unknown> = [];
    // Two distinct closures, as two mounted components would be.
    subscribeToNdsDay({ dateLocal: DAY }, () => {
      seen.push(getNdsDaySnapshot({ dateLocal: DAY }).state);
    });
    subscribeToNdsDay({ dateLocal: DAY }, () => {
      seen.push(getNdsDaySnapshot({ dateLocal: DAY }).state);
    });

    const pending = ensureNdsDayLoaded({ dateLocal: DAY });
    calls[0].resolve(freshState());
    await pending;

    const answered = seen.filter((state) => state !== null);
    expect(answered).toHaveLength(2);
    expect(answered[0]).toBe(answered[1]); // Same object, not two parses.
  });

  it('does not re-read a day that has already been answered', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const pending = ensureNdsDayLoaded({ dateLocal: DAY });
    calls[0].resolve(freshState());
    await pending;

    await ensureNdsDayLoaded({ dateLocal: DAY });
    expect(calls).toHaveLength(1);
  });

  it('retries a day whose previous read failed', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const failing = ensureNdsDayLoaded({ dateLocal: DAY });
    calls[0].reject(new Error('offline'));
    await failing;

    void ensureNdsDayLoaded({ dateLocal: DAY });
    expect(calls).toHaveLength(2);
  });
});

describe('source change notification', () => {
  it('re-reads the day after a write instead of trusting the cached snapshot', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const initial = ensureNdsDayLoaded({ dateLocal: DAY });
    calls[0].resolve(freshState());
    await initial;

    notifyNdsSourceChanged({ dateLocal: DAY });
    expect(calls).toHaveLength(2);
  });

  it('repeats a read that was already in flight when the day changed', async () => {
    // The in-flight read may have observed the pre-change revision on the server.
    // Coalescing into it would leave the UI one revision behind for good.
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const inFlight = refreshNdsDay({ dateLocal: DAY });
    notifyNdsSourceChanged({ dateLocal: DAY });
    expect(calls).toHaveLength(1); // Coalesced, not duplicated immediately.

    calls[0].resolve(freshState());
    await inFlight;
    await Promise.resolve();

    expect(calls).toHaveLength(2);
  });

  it('leaves other days alone', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});
    subscribeToNdsDay({ dateLocal: OTHER_DAY }, () => {});

    const a = ensureNdsDayLoaded({ dateLocal: DAY });
    const b = ensureNdsDayLoaded({ dateLocal: OTHER_DAY });
    calls[0].resolve(freshState());
    calls[1].resolve(freshState({ date_local: OTHER_DAY }));
    await Promise.all([a, b]);

    notifyNdsSourceChanged({ dateLocal: DAY });

    expect(calls.filter((call) => call.dateLocal === DAY)).toHaveLength(2);
    expect(calls.filter((call) => call.dateLocal === OTHER_DAY)).toHaveLength(1);
  });

  it('ignores days nothing is watching', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    const unsubscribe = subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const initial = ensureNdsDayLoaded({ dateLocal: DAY });
    calls[0].resolve(freshState());
    await initial;

    unsubscribe();
    notifyNdsSourceChanged({ dateLocal: DAY });

    expect(calls).toHaveLength(1);
  });
});

describe('a day the server says is still updating', () => {
  it('follows up on a bounded schedule and stops once the day settles', async () => {
    jest.useFakeTimers();
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    void refreshNdsDay({ dateLocal: DAY });
    calls[0].resolve(updatingState());
    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(1_500);
    expect(calls).toHaveLength(2);

    calls[1].resolve(freshState());
    await Promise.resolve();
    await Promise.resolve();

    // Settled: nothing further is scheduled, however long we wait.
    jest.advanceTimersByTime(120_000);
    expect(calls).toHaveLength(2);
  });

  it('gives up after a finite number of attempts rather than polling forever', async () => {
    jest.useFakeTimers();
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    void refreshNdsDay({ dateLocal: DAY });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const call = calls[calls.length - 1];
      call.resolve(updatingState());
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(60_000);
    }

    // One initial read plus the four scheduled follow-ups.
    expect(calls).toHaveLength(5);
    // The labelled stale score is still shown; it was never blanked.
    expect(getNdsDaySnapshot({ dateLocal: DAY }).state?.state).toBe('updating');
  });

  it('stops following up when the last consumer unmounts', async () => {
    jest.useFakeTimers();
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    const unsubscribe = subscribeToNdsDay({ dateLocal: DAY }, () => {});

    void refreshNdsDay({ dateLocal: DAY });
    calls[0].resolve(updatingState());
    await Promise.resolve();
    await Promise.resolve();

    unsubscribe();
    jest.advanceTimersByTime(60_000);

    expect(calls).toHaveLength(1);
  });
});

describe('failure handling', () => {
  it('keeps the last known state when a read fails', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const initial = refreshNdsDay({ dateLocal: DAY });
    calls[0].resolve(freshState());
    await initial;

    const failing = refreshNdsDay({ dateLocal: DAY });
    calls[1].reject(new Error('network down'));
    await failing;

    const snapshot = getNdsDaySnapshot({ dateLocal: DAY });
    // A transport failure is not evidence that the day has no score.
    expect(snapshot.state?.state).toBe('fresh');
    expect(snapshot.error).toBe('network down');
    expect(snapshot.isLoading).toBe(false);
  });

  it('does not blank the previous state while reloading', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    const initial = refreshNdsDay({ dateLocal: DAY });
    calls[0].resolve(freshState());
    await initial;

    void refreshNdsDay({ dateLocal: DAY });
    const during = getNdsDaySnapshot({ dateLocal: DAY });
    expect(during.isLoading).toBe(true);
    expect(during.state?.state).toBe('fresh');
  });

  it('discards a response from a superseded read', async () => {
    const { fetcher, calls } = deferredFetcher();
    install(fetcher);
    subscribeToNdsDay({ dateLocal: DAY }, () => {});

    void refreshNdsDay({ dateLocal: DAY });
    resetNdsDayStore(); // e.g. sign-out while the request was open
    calls[0].resolve(freshState());
    await Promise.resolve();

    expect(getNdsDaySnapshot({ dateLocal: DAY }).state).toBeNull();
  });
});
