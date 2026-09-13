/**
 * NDS Integrity v1 — consumer adoption.
 *
 * The audited defect these tests exist to prevent is not in the scoring maths: it
 * is that four display surfaces each turned "no score" into a confident number,
 * usually zero, and then decided for themselves whether the day had food in it.
 *
 * Two layers are covered:
 *   1. the pure projection and view-model builders, exercised directly;
 *   2. a static scan of the display surfaces, because a future edit could
 *      reintroduce a `?? 0` fallback without failing any behavioural test.
 *
 * The static scan is a genuine but PARTIAL substitute for rendering assertions.
 * No React renderer is available in this repo, and adding one is out of scope for
 * this packet, so no test here claims to prove what a browser actually paints.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { buildNdsViewModel } from '../../app/home/adapters';
import type { DailyNdsState } from '../dailyNdsState';
import { projectLegacyNdsData } from '../useNDS';

const DAY = '2026-09-12';

function base() {
  return {
    date_local: DAY,
    person_id: 'person-1',
    day_provenance: 'explicit' as const,
    versions: {
      nds_version: 'nds_daily_2026-01-26.v10',
      classifier_version: 'processing_classifier_2026-02-08.v2',
      normalizer_version: 'n1',
      day_policy_version: 'd1',
    },
    coverage: {
      added_sugar: 'known' as const,
      scored_entry_count: 2,
      unscorable_entry_count: 0,
      limitations: [],
    },
  };
}

const SUBSCORES = { wfr: 8, ps: 7, pnd: 6, fp: 6, as: 9, mnc: 6, ob: 5 };

const READINGS = {
  wfr_percent: 80,
  protein_score_10: 7,
  fiber_g: 24,
  added_sugar_g: 6,
  plant_variety_score_10: 6,
  omega_balance_score_10: 5,
  micronutrient_coverage_score_10: 6,
};

function fresh(score = 71): DailyNdsState {
  return {
    ...base(),
    state: 'fresh',
    nds_score_100: score,
    subscores_10: SUBSCORES,
    readings: READINGS,
    computed_as_of: '2026-09-12T18:00:00.000Z',
    source_revision: 3,
  };
}

function updating(): DailyNdsState {
  return {
    ...base(),
    state: 'updating',
    nds_score_100: 64,
    subscores_10: SUBSCORES,
    readings: READINGS,
    computed_as_of: '2026-09-12T18:00:00.000Z',
    stale_source_revision: 2,
    current_source_revision: 3,
  };
}

function empty(): DailyNdsState {
  return {
    ...base(),
    coverage: { ...base().coverage, scored_entry_count: 0 },
    state: 'empty',
    source_revision: 1,
  };
}

function insufficient(): DailyNdsState {
  return {
    ...base(),
    coverage: {
      added_sugar: 'unknown',
      scored_entry_count: 1,
      unscorable_entry_count: 0,
      limitations: ['added_sugar_unknown'],
    },
    state: 'insufficient_data',
    source_revision: 4,
  };
}

function unavailable(): DailyNdsState {
  return {
    ...base(),
    state: 'unavailable',
    reason: 'storage_unavailable',
  };
}

describe('projecting a state onto the legacy display shape', () => {
  it('carries the score for a fresh day', () => {
    const data = projectLegacyNdsData(fresh());
    expect(data?.nds_score_100).toBe(71);
    expect(data?.is_provisional).toBe(false);
    expect(data?.nds_version).toBe('nds_daily_2026-01-26.v10');
  });

  it('carries a genuine score of zero', () => {
    // A day of eating that scores zero is a measurement. It must survive the
    // projection intact, which is only safe now that absence is a null state.
    const data = projectLegacyNdsData(fresh(0));
    expect(data).not.toBeNull();
    expect(data?.nds_score_100).toBe(0);
  });

  it('labels a stale-but-real score as provisional', () => {
    expect(projectLegacyNdsData(updating())?.is_provisional).toBe(true);
  });

  it.each([
    ['empty', empty()],
    ['insufficient_data', insufficient()],
    ['unavailable', unavailable()],
  ])('yields no display data for %s', (_label, state) => {
    // This is the whole adoption: a consumer writing `data?.nds_score_100 ?? 0`
    // now reads "no score" rather than inventing a zero.
    expect(projectLegacyNdsData(state)).toBeNull();
  });

  it('yields no display data before the first answer', () => {
    expect(projectLegacyNdsData(null)).toBeNull();
  });

  it('passes unknown readings through as null rather than zero', () => {
    const state = fresh();
    const withGaps = {
      ...state,
      readings: { ...READINGS, added_sugar_g: null, fiber_g: null },
    } as DailyNdsState;
    const data = projectLegacyNdsData(withGaps);
    expect(data?.readings.added_sugar_g).toBeNull();
    expect(data?.readings.fiber_g).toBeNull();
  });

  it('reports entry coverage instead of leaving the caller to guess', () => {
    const data = projectLegacyNdsData(fresh());
    expect(data?._meta?.scored_entry_count).toBe(2);
    expect(data?._meta?.unscorable_entry_count).toBe(0);
  });
});

describe('app home nutrition density rail', () => {
  function vm(state: DailyNdsState | null, opts: { isLoading?: boolean; error?: boolean } = {}) {
    return buildNdsViewModel({
      data: projectLegacyNdsData(state),
      isLoading: opts.isLoading ?? false,
      error: opts.error,
      state,
    });
  }

  it('prints a real score', () => {
    const model = vm(fresh());
    expect(model.status).toBe('populated');
    expect(model.metrics.find((m) => m.id === 'overall')?.value).toBe('71');
  });

  it('prints a genuine zero rather than treating it as no input', () => {
    // The old `hasInput` heuristic required a score above zero, so the worst
    // possible day of eating rendered exactly like an unlogged one.
    const model = vm(fresh(0));
    expect(model.status).toBe('populated');
    expect(model.metrics.find((m) => m.id === 'overall')?.value).toBe('0');
  });

  it('says a provisional score is catching up', () => {
    const model = vm(updating());
    expect(model.status).toBe('populated');
    expect(model.note).toBe('Updating with your latest entry.');
  });

  it('shows an empty day as empty with no number', () => {
    const model = vm(empty());
    expect(model.status).toBe('empty');
    expect(model.metrics.every((m) => m.value === '–')).toBe(true);
    expect(model.note).toBeUndefined();
  });

  it('distinguishes an unscorable day from an empty one, and says whose gap it is', () => {
    const model = vm(insufficient());
    expect(model.metrics.every((m) => m.value === 'Not scored')).toBe(true);
    expect(model.errorMessage).toBe(
      "Today's entries don't yet include enough detail to score.",
    );
  });

  it('treats a server-side unavailable day as an error, not an empty day', () => {
    const model = vm(unavailable());
    expect(model.status).toBe('error');
    expect(model.metrics.every((m) => m.value === 'Unavailable')).toBe(true);
  });

  it('reports a transport failure the same way', () => {
    expect(vm(null, { error: true }).status).toBe('error');
  });

  it('withholds fiber grams rather than substituting the fiber subscore', () => {
    // The subscore is DERIVED from the grams, so printing it when the grams are
    // unknown presents a number computed from an absent measurement.
    const state = { ...fresh(), readings: { ...READINGS, fiber_g: null } } as DailyNdsState;
    const model = vm(state);
    expect(model.metrics.find((m) => m.id === 'fiber')?.value).toBe('–');
  });
});

describe('no display surface reintroduces a fabricated score', () => {
  const SURFACES = [
    'pages/journal.tsx',
    'pages/journal/home.tsx',
    'pages/journal/insights.tsx',
    'components/app/home/AppHomeView.tsx',
    'components/app/home/NutritionDensityRail.tsx',
    'components/journal/home/NutritionDensityScroller.tsx',
    'lib/app/home/adapters.ts',
    'lib/nds/useNDS.ts',
  ] as const;

  function read(relative: string): string {
    return readFileSync(join(process.cwd(), relative), 'utf8');
  }

  it.each(SURFACES)('%s never defaults a score or subscore to zero', (relative) => {
    const source = read(relative);
    expect(source).not.toMatch(/nds_score_100\s*\?\?\s*0/);
    expect(source).not.toMatch(/subscores_10\??\.\w+\s*\?\?\s*0/);
    expect(source).not.toMatch(/Number\(\s*\w+\.subscores_10/);
  });

  it('the scroller does not decide for itself whether food was logged', () => {
    const source = read('components/journal/home/NutritionDensityScroller.tsx');
    expect(source).toMatch(/const hasInput = data !== null;/);
    expect(source).not.toMatch(/intake_count/);
    expect(source).not.toMatch(/meal_count/);
  });

  it('the log page does not gate the gauge on a separately computed calorie total', () => {
    const source = read('pages/journal.tsx');
    expect(source).not.toMatch(/hasFood/);
    expect(source).toMatch(/notifyNdsSourceChanged/);
    // The fingerprint guess that used to decide when to recompute is gone.
    expect(source).not.toMatch(/computeEntriesFingerprint/);
    expect(source).not.toMatch(/entriesPopulatedRef/);
  });

  it('every surface reads the shared store rather than fetching the endpoint itself', () => {
    for (const relative of SURFACES) {
      if (relative === 'lib/nds/useNDS.ts') continue;
      expect(read(relative)).not.toMatch(/api\/journal\/nds/);
    }
  });

  it('the hook does not offer a client-driven recompute', () => {
    // Freshness is settled by the day's source revision on the server. A client
    // "force recompute" button could only ever be a second opinion.
    const source = read('lib/nds/useNDS.ts');
    expect(source).not.toMatch(/forceRecompute/);
    expect(source).not.toMatch(/force=true/);
  });
});
