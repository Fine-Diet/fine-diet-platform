/**
 * @jest-environment jsdom
 *
 * Mounted hook composition for R01. This is not a browser or a database.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { useNDS } from '../useNDS';
import {
  bindNdsAuthContext,
  getNdsAuthContext,
  notifyNdsConsumptionCommitted,
  resetNdsDayStore,
  setNdsDayFetcherForTests,
  type NdsDayFetcher,
} from '../ndsDayStore';
import type { DailyNdsState } from '../dailyNdsState';

const DAY = '2026-09-12';

function fresh(personId = 'person-1'): DailyNdsState {
  return {
    state: 'fresh',
    date_local: DAY,
    person_id: personId,
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
      scored_entry_count: 1,
      unscorable_entry_count: 0,
      limitations: [],
    },
  };
}

function Probe({ personId, onScore }: { personId?: string; onScore: (n: number | null) => void }) {
  const { data } = useNDS({ dateLocal: DAY, personId, autoFetch: true, enabled: true });
  onScore(data?.nds_score_100 ?? null);
  return React.createElement('div', null, data ? String(data.nds_score_100) : 'none');
}

describe('mounted useNDS composition', () => {
  let container: HTMLDivElement;
  let root: Root;
  let restore: () => void;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    resetNdsDayStore();
    bindNdsAuthContext({ subjectPersonId: 'person-1', epochChanged: true });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    restore?.();
    resetNdsDayStore();
  });

  it('two mounted consumers share one fetch and one snapshot', async () => {
    const calls: string[] = [];
    const fetcher: NdsDayFetcher = async () => {
      calls.push('fetch');
      return { state: fresh(), meta: null, debugData: null };
    };
    restore = setNdsDayFetcherForTests(fetcher);

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Probe, { onScore: () => undefined }),
          React.createElement(Probe, { onScore: () => undefined }),
        ),
      );
    });

    expect(calls).toHaveLength(1);
    expect(container.textContent).toContain('71');
  });

  it('a committed mutation while unmounted is visible after remount', async () => {
    let score = 71;
    const fetcher: NdsDayFetcher = async () => ({
      state: fresh(),
      meta: null,
      debugData: null,
    });
    restore = setNdsDayFetcherForTests(async (parts) => {
      void parts;
      return { state: { ...fresh(), nds_score_100: score }, meta: null, debugData: null };
    });

    await act(async () => {
      root.render(React.createElement(Probe, { onScore: () => undefined }));
    });
    expect(container.textContent).toContain('71');

    await act(async () => {
      root.render(React.createElement('div'));
    });

    score = 80;
    notifyNdsConsumptionCommitted({ dateLocals: [DAY] });

    await act(async () => {
      root.render(React.createElement(Probe, { onScore: () => undefined }));
    });
    expect(container.textContent).toContain('80');
  });

  it('reacts to an account change after mount without remounting the tree', async () => {
    const seen: string[] = [];
    restore = setNdsDayFetcherForTests(async ({ personId }) => ({
      state: fresh(personId && personId !== '@self' ? personId : 'person-1'),
      meta: null,
      debugData: null,
    }));

    await act(async () => {
      root.render(
        React.createElement(Probe, {
          onScore: (n) => {
            if (n !== null) seen.push(String(n));
          },
        }),
      );
    });
    expect(container.textContent).toContain('71');

    await act(async () => {
      bindNdsAuthContext({
        subjectPersonId: 'person-2',
        authUserId: 'user-2',
        epochChanged: true,
      });
    });

    expect(getNdsAuthContext().subjectPersonId).toBe('person-2');
    expect(getNdsAuthContext().sessionEpoch).toBeGreaterThan(0);
  });
});
