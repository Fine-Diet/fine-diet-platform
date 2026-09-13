/**
 * NDS Integrity v1 — resolver behaviour.
 *
 * These tests drive the resolver through a fake persistence port that models the
 * guarantees the SQL provides: a monotonic per-day revision, an active
 * computation generation, and a publish that is REJECTED when either has moved.
 * That lets the concurrency outcomes be exercised deterministically here, and it
 * is deliberately not a substitute for running the migrations, which is reported
 * as BLOCKED / NOT RUN.
 */

import {
  cacheInvalidationReason,
  computeDependencyFingerprint,
  currentVersions,
  resolveDailyNDS,
  type CacheInvalidationReason,
} from '../resolveDailyNDS';
import { hasPrintableScore } from '../dailyNdsState';
import { NDS_DAY_POLICY_VERSION } from '../dayIdentity';
import { NDS_NORMALIZER_VERSION } from '../consumedInputs/types';
import { CLASSIFIER_VERSION, NDS_VERSION } from '../types';
import type { ConsumedEntryRow } from '../consumedInputs/normalizeConsumedEntry';
import type { ConsumedFoodEvidence } from '../consumedInputs/types';
import type {
  CachedDailyScore,
  DaySnapshot,
  NdsPersistencePort,
  PublishDailyScoreInput,
  PublishDailyScoreResult,
} from '../ndsPersistencePort';

const PERSON = 'person-1';
const DAY = '2026-09-12';

function chicagoDay(date: string, utcInstant: string) {
  return {
    date_local: date,
    time_zone: 'America/Chicago',
    utc_instant: utcInstant,
    policy_version: NDS_DAY_POLICY_VERSION,
  };
}

const SALMON_ID = 'food-salmon-bowl';

function realMeal(overrides: Partial<ConsumedEntryRow> = {}): ConsumedEntryRow {
  return {
    id: 'entry-1',
    person_id: PERSON,
    entry_type: 'intake',
    occurred_at: '2026-09-12T18:00:00.000Z',
    payload: {
      name: 'Salmon and quinoa bowl',
      quantity: 1,
      unit: 'serving',
      calories: 620,
      macros: { protein: 42, carbs: 55, fat: 22 },
      foodObjectId: SALMON_ID,
      servingSizeG: 400,
      consumed_day: chicagoDay(DAY, '2026-09-12T18:00:00.000Z'),
    },
    quantity_g: 400,
    ...overrides,
  } as ConsumedEntryRow;
}

/**
 * Evidence for the referenced food. `added_sugar_g` is a parameter because the
 * real catalog cannot supply it, and the difference between "known" and "absent"
 * is the whole point of several tests below.
 */
function salmonEvidence(addedSugarG: number | null): ConsumedFoodEvidence {
  return {
    foodObjectId: SALMON_ID,
    canonicalName: 'Salmon and quinoa bowl',
    brandName: null,
    category: 'seafood',
    tags: ['salmon', 'quinoa'],
    provenance: 'legacy_catalog_lookup',
    evidenceToken: 'test-catalog',
    perServing: {
      calories: 620,
      protein_g: 42,
      fiber_g: 9,
      added_sugar_g: addedSugarG,
      omega3_g: 2.1,
      omega6_g: 1.4,
      micronutrients: {
        potassium_mg: 900,
        magnesium_mg: 120,
        iron_mg: 3,
        calcium_mg: 120,
        zinc_mg: 3,
        folate_ug: 150,
        vitamin_a_ug_rae: 90,
        vitamin_c_mg: 20,
        vitamin_d_ug: 12,
        vitamin_b12_ug: 4,
      },
    },
    processingClass: 'whole',
    processingClassOverride: null,
  };
}

/**
 * Fake port modelling the SQL guarantees. `revision` and `generation` can be
 * moved between calls to simulate a concurrent mutation or a redeploy.
 */
class FakePort implements NdsPersistencePort {
  revision = 1;
  generation = 1;
  cache: CachedDailyScore | null = null;
  rows: ConsumedEntryRow[] = [];
  evidence = new Map<string, ConsumedFoodEvidence>();
  publishes: PublishDailyScoreInput[] = [];
  workRequests: Array<{ dateLocal: string; revision: number }> = [];
  /** Runs before the guard, to simulate a write landing mid-computation. */
  onPublishAttempt: (() => void) | null = null;
  failSnapshot = false;
  failRows = false;

  async readDaySnapshot(): Promise<DaySnapshot> {
    if (this.failSnapshot) throw new Error('snapshot unavailable');
    return {
      sourceRevision: this.revision,
      activeGeneration: this.generation,
      cache: this.cache,
    };
  }

  async listCandidateEntryRows(): Promise<ConsumedEntryRow[]> {
    if (this.failRows) throw new Error('entry read failed');
    return this.rows;
  }

  async loadFoodEvidence(ids: string[]): Promise<Map<string, ConsumedFoodEvidence>> {
    const resolved = new Map<string, ConsumedFoodEvidence>();
    for (const id of ids) {
      const found = this.evidence.get(id);
      // An unresolvable reference is ABSENT, never a default row.
      if (found) resolved.set(id, found);
    }
    return resolved;
  }

  async publishDailyScore(input: PublishDailyScoreInput): Promise<PublishDailyScoreResult> {
    this.publishes.push(input);
    this.onPublishAttempt?.();

    if (input.generation !== this.generation) {
      return {
        published: false,
        reason: 'stale_generation',
        currentRevision: this.revision,
        currentGeneration: this.generation,
      };
    }
    if (input.computedFromRevision !== this.revision) {
      return {
        published: false,
        reason: 'source_changed',
        currentRevision: this.revision,
        currentGeneration: this.generation,
      };
    }

    this.cache = {
      sourceRevision: input.computedFromRevision,
      generation: input.generation,
      ndsVersion: input.ndsVersion,
      classifierVersion: input.classifierVersion,
      normalizerVersion: input.normalizerVersion,
      dayPolicyVersion: input.dayPolicyVersion,
      dependencyFingerprint: input.dependencyFingerprint,
      responseState: input.responseState,
      score100: input.score100,
      subscores: input.subscores,
      readings: input.readings,
      addedSugarCoverage: input.addedSugarCoverage,
      dayProvenance: input.dayProvenance,
      computedAsOf: '2026-09-12T19:00:00.000Z',
      debugData: input.debugData,
    };

    return {
      published: true,
      reason: 'published',
      currentRevision: this.revision,
      currentGeneration: this.generation,
    };
  }

  async requestWork(_personId: string, dateLocal: string, revision: number): Promise<void> {
    this.workRequests.push({ dateLocal, revision });
  }
}

function validCache(overrides: Partial<CachedDailyScore> = {}): CachedDailyScore {
  return {
    sourceRevision: 1,
    generation: 1,
    ndsVersion: NDS_VERSION,
    classifierVersion: CLASSIFIER_VERSION,
    normalizerVersion: NDS_NORMALIZER_VERSION,
    dayPolicyVersion: NDS_DAY_POLICY_VERSION,
    dependencyFingerprint: computeDependencyFingerprint(),
    responseState: 'fresh',
    score100: 71.5,
    subscores: { wfr: 8, ps: 7, pnd: 6, fp: 7, as: 9, mnc: 5, ob: 6 },
    readings: {
      wfr_percent: 80,
      protein_score_10: 7,
      fiber_g: 9,
      added_sugar_g: 3,
      plant_variety_score_10: 6,
      omega_balance_score_10: 6,
      micronutrient_coverage_score_10: 5,
    },
    addedSugarCoverage: 'known',
    dayProvenance: 'explicit',
    computedAsOf: '2026-09-12T19:00:00.000Z',
    debugData: null,
    ...overrides,
  };
}

function snapshot(cache: CachedDailyScore | null, revision = 1, generation = 1): DaySnapshot {
  return { sourceRevision: revision, activeGeneration: generation, cache };
}

const expected = {
  versions: currentVersions(),
  dependencyFingerprint: computeDependencyFingerprint(),
};

describe('cache validity', () => {
  it('accepts a cache that matches on every axis', () => {
    expect(cacheInvalidationReason(snapshot(validCache()), expected)).toBeNull();
  });

  const cases: Array<[string, Partial<CachedDailyScore> | 'no_cache', CacheInvalidationReason]> = [
    ['no cached row at all', 'no_cache', 'no_cache_row'],
    ['a pre-contract row with no revision', { sourceRevision: null }, 'missing_source_revision'],
    ['a revision that has since moved', { sourceRevision: 0 }, 'source_revision_moved'],
    ['a superseded deployment', { generation: 0 }, 'generation_changed'],
    ['a changed formula version', { ndsVersion: 'nds_daily_old.v1' }, 'formula_version_changed'],
    [
      'a changed classifier version',
      { classifierVersion: 'processing_classifier_old.v1' },
      'classifier_version_changed',
    ],
    [
      'a changed normalizer version',
      { normalizerVersion: 'nds_consumed_normalizer_old.v0' },
      'normalizer_version_changed',
    ],
    [
      'a changed day policy version',
      { dayPolicyVersion: 'nds_day_policy_old.v0' },
      'day_policy_version_changed',
    ],
    [
      'a changed threshold fingerprint',
      { dependencyFingerprint: 'snack_kcal_threshold=999' },
      'dependency_fingerprint_changed',
    ],
    [
      'a response state this build does not recognise',
      { responseState: 'partially_estimated' },
      'unrecognized_response_state',
    ],
  ];

  it.each(cases)('rejects %s', (_label, override, reason) => {
    const cache = override === 'no_cache' ? null : validCache(override);
    expect(cacheInvalidationReason(snapshot(cache), expected)).toBe(reason);
  });

  it('does not treat a zero score as evidence that the cache is wrong', () => {
    // The audited predicate recomputed on every read whenever the stored score
    // was 0, which both masked staleness and punished a genuinely bad day.
    const cache = validCache({ score100: 0, subscores: { wfr: 0, ps: 0, pnd: 0, fp: 0, as: 0, mnc: 0, ob: 0 } });
    expect(cacheInvalidationReason(snapshot(cache), expected)).toBeNull();
  });

  it('does not treat a high score as evidence that the cache is right', () => {
    const cache = validCache({ score100: 98, sourceRevision: 1 });
    expect(cacheInvalidationReason(snapshot(cache, 2), expected)).toBe('source_revision_moved');
  });
});

describe('serving a valid cache', () => {
  it('returns it as fresh without computing or publishing', async () => {
    const port = new FakePort();
    port.cache = validCache();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('fresh');
    expect(outcome.invalidationReason).toBeNull();
    expect(port.publishes).toHaveLength(0);
    expect(port.workRequests).toHaveLength(0);
  });

  it('serves a stored empty day as empty, not as a score of zero', async () => {
    const port = new FakePort();
    port.cache = validCache({ responseState: 'empty', score100: 0 });

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('empty');
    expect(hasPrintableScore(outcome.state)).toBe(false);
    expect(outcome.state).not.toHaveProperty('nds_score_100');
  });

  it('serves a stored unscorable day as insufficient_data', async () => {
    const port = new FakePort();
    port.cache = validCache({ responseState: 'insufficient_data', score100: 0 });

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('insufficient_data');
    expect(hasPrintableScore(outcome.state)).toBe(false);
  });
});

describe('computing a stale day', () => {
  it('computes, publishes and returns fresh', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.invalidationReason).toBe('no_cache_row');
    expect(outcome.publishReason).toBe('published');
    expect(outcome.state.state).toBe('fresh');
    if (!hasPrintableScore(outcome.state)) throw new Error('expected a score');
    expect(outcome.state.nds_score_100).toBeGreaterThan(0);
    expect(outcome.state.source_revision).toBe(1);
  });

  it('persists readings so an ordinary read never depends on a debug request', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));

    await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY, includeDebug: false });

    const published = port.publishes[0];
    expect(published.readings.fiber_g).toBe(9);
    expect(published.readings.added_sugar_g).toBe(3);
    expect(published.readings.wfr_percent).not.toBeNull();
  });

  it('withholds debug data from a caller that did not ask for it', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));

    const withoutDebug = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });
    expect(withoutDebug.debugData).toBeNull();

    port.cache = null;
    const withDebug = await resolveDailyNDS(port, {
      personId: PERSON,
      dateLocal: DAY,
      includeDebug: true,
    });
    expect(withDebug.debugData).not.toBeNull();
  });

  it('queues work for the day whenever the cache was rejected', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));

    await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(port.workRequests[0]).toEqual({ dateLocal: DAY, revision: 1 });
  });
});

describe('day states from real inputs', () => {
  it('reports a day with nothing logged as empty', async () => {
    const port = new FakePort();
    port.rows = [];

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('empty');
    expect(port.publishes[0].responseState).toBe('empty');
  });

  it('reports logged food with no added-sugar evidence as insufficient_data', async () => {
    // The audited path hardcoded added_sugar_g: 0, which awards the maximum
    // added-sugar subscore. Absent evidence must not become a free 10.
    const port = new FakePort();
    const { added_sugar_g: _omitted, ...payload } = realMeal().payload as Record<string, unknown>;
    port.rows = [realMeal({ payload })];

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('insufficient_data');
    expect(outcome.state.coverage.added_sugar).toBe('unknown');
    expect(outcome.state.coverage.limitations).toContain('added_sugar_unknown');
  });

  it('distinguishes an empty day from an unscorable one', async () => {
    const emptyPort = new FakePort();
    emptyPort.rows = [];
    const emptyDay = await resolveDailyNDS(emptyPort, { personId: PERSON, dateLocal: DAY });

    const unscorablePort = new FakePort();
    const { added_sugar_g: _omitted, ...payload } = realMeal().payload as Record<string, unknown>;
    unscorablePort.rows = [realMeal({ payload })];
    const unscorable = await resolveDailyNDS(unscorablePort, { personId: PERSON, dateLocal: DAY });

    // Nothing logged is a fact about the day. Food we cannot read is a fact about
    // our data, and must not be presented as the same thing.
    expect(emptyDay.state.state).toBe('empty');
    expect(unscorable.state.state).toBe('insufficient_data');
  });

  it('labels a day built on the UTC compatibility bucket honestly', async () => {
    const port = new FakePort();
    const { consumed_day: _dropped, ...payload } = realMeal().payload as Record<string, unknown>;
    port.rows = [realMeal({ payload })];

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.day_provenance).toBe('legacy_unverified');
  });
});

describe('concurrency', () => {
  it('reports updating, not fresh, when the day changes mid-computation', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));
    // A second food is logged while the score is being computed.
    port.onPublishAttempt = () => {
      port.revision = 2;
    };

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.publishReason).toBe('source_changed');
    expect(outcome.state.state).toBe('updating');
    if (outcome.state.state !== 'updating') throw new Error('expected updating');
    expect(outcome.state.stale_source_revision).toBe(1);
    expect(outcome.state.current_source_revision).toBe(2);
    // The number is real, so it is still shown — labelled, not discarded.
    expect(outcome.state.nds_score_100).toBeGreaterThan(0);
  });

  it('requeues the day when its publish loses the race', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));
    port.onPublishAttempt = () => {
      port.revision = 3;
    };

    await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(port.workRequests.map((request) => request.revision)).toContain(3);
  });

  it('never overwrites storage when the publish is refused', async () => {
    const port = new FakePort();
    const priorCache = validCache({ score100: 88, sourceRevision: 1 });
    port.cache = priorCache;
    port.revision = 2; // cache is stale, so a recompute happens
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));
    port.onPublishAttempt = () => {
      port.revision = 3;
    };

    await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(port.cache).toBe(priorCache);
  });

  it('refuses to publish from a superseded deployment', async () => {
    const port = new FakePort();
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));
    port.onPublishAttempt = () => {
      port.generation = 2; // a newer build took over
    };

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.publishReason).toBe('stale_generation');
    expect(outcome.state.state).toBe('updating');
    expect(port.cache).toBeNull();
  });
});

describe('read-only resolution', () => {
  it('shows the prior score as updating and queues work instead of computing', async () => {
    const port = new FakePort();
    port.cache = validCache({ sourceRevision: 1, score100: 64 });
    port.revision = 5;
    port.rows = [realMeal()];
    port.evidence.set(SALMON_ID, salmonEvidence(3));

    const outcome = await resolveDailyNDS(port, {
      personId: PERSON,
      dateLocal: DAY,
      allowInlineCompute: false,
    });

    expect(port.publishes).toHaveLength(0);
    expect(outcome.state.state).toBe('updating');
    if (outcome.state.state !== 'updating') throw new Error('expected updating');
    expect(outcome.state.nds_score_100).toBe(64);
    expect(outcome.state.current_source_revision).toBe(5);
    expect(port.workRequests).toHaveLength(1);
  });

  it('reports unavailable rather than zero when there is nothing to show', async () => {
    const port = new FakePort();
    port.revision = 1;

    const outcome = await resolveDailyNDS(port, {
      personId: PERSON,
      dateLocal: DAY,
      allowInlineCompute: false,
    });

    expect(outcome.state.state).toBe('unavailable');
    expect(outcome.state).not.toHaveProperty('nds_score_100');
  });
});

describe('failure handling', () => {
  it('reports storage_unavailable instead of an empty score', async () => {
    const port = new FakePort();
    port.failSnapshot = true;

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('unavailable');
    if (outcome.state.state !== 'unavailable') throw new Error('expected unavailable');
    expect(outcome.state.reason).toBe('storage_unavailable');
  });

  it('falls back to the prior real score when computation fails', async () => {
    const port = new FakePort();
    port.cache = validCache({ sourceRevision: 1, score100: 55 });
    port.revision = 2;
    port.failRows = true;

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('updating');
    if (outcome.state.state !== 'updating') throw new Error('expected updating');
    expect(outcome.state.nds_score_100).toBe(55);
  });

  it('reports computation_failed when there is no prior score to fall back to', async () => {
    const port = new FakePort();
    port.failRows = true;

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(outcome.state.state).toBe('unavailable');
    if (outcome.state.state !== 'unavailable') throw new Error('expected unavailable');
    expect(outcome.state.reason).toBe('computation_failed');
  });

  it('never carries a raw error message into the returned state', async () => {
    const port = new FakePort();
    port.failRows = true;

    const outcome = await resolveDailyNDS(port, { personId: PERSON, dateLocal: DAY });

    expect(JSON.stringify(outcome.state)).not.toContain('entry read failed');
  });
});
