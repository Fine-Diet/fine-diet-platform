/**
 * Resolve the daily NDS for one person and one day.
 *
 * NDS Integrity v1. This is the single read path. It replaces a cache predicate
 * that treated "score is 0" as "cache is probably wrong" — a heuristic that both
 * hid the real staleness problem and made a genuinely bad day recompute forever.
 *
 * Validity is now explicit. A cached score is current only when ALL of these
 * match the day's present state:
 *   - person and day
 *   - source revision (what was actually logged)
 *   - formula version, classifier version, normalizer version, day-policy version
 *   - dependency fingerprint (inputs that change results but carry no version)
 *   - computation generation (which deployment is allowed to publish)
 *
 * Any mismatch means recompute. A missing source revision is a mismatch, so
 * pre-contract rows are never served as fresh.
 *
 * Publication is guarded in the DATABASE, not here. This module computes, offers
 * the result, and honestly reports `updating` when the offer is refused because
 * the day moved underneath it. A JavaScript revision check followed by an
 * unconditional upsert would lose that race silently.
 */

import { calculateDailyNDS, type DailyNDSResult } from './dailyCalculator';
import {
  buildDailyMealsFromConsumedDay,
  SNACK_ISOLATION_MINUTES,
  SNACK_KCAL_THRESHOLD,
  type ConsumedDayCoverage,
  type ConsumedDayDiagnostics,
} from './consumedInputs/toDailyMeals';
import {
  collectReferencedFoodObjectIds,
  normalizeConsumedDay,
} from './consumedInputs/normalizeConsumedEntry';
import { NDS_NORMALIZER_VERSION, type ConsumedFoodEvidence } from './consumedInputs/types';
import { NDS_DAY_POLICY_VERSION } from './dayIdentity';
import { CLASSIFIER_VERSION, MAIN_MEAL_KCAL_THRESHOLD, NDS_VERSION } from './types';
import {
  emptyReadings,
  type DailyNdsCoverage,
  type DailyNdsDayProvenance,
  type DailyNdsLimitation,
  type DailyNdsReadings,
  type DailyNdsState,
  type DailyNdsSubscores,
  type DailyNdsVersions,
} from './dailyNdsState';
import type {
  CachedDailyScore,
  DaySnapshot,
  NdsPersistencePort,
  PublishDailyScoreInput,
} from './ndsPersistencePort';

// ============================================================================
// Computation context
// ============================================================================

/**
 * Inputs that change the score but carry no version string of their own.
 *
 * Bumping a version constant is easy to forget when a threshold moves, so the
 * thresholds themselves are folded into a fingerprint. If a value here changes,
 * every cached score is invalidated automatically.
 */
/**
 * Whether a day with NO added-sugar evidence anywhere may still be scored.
 *
 * This is a RELEASE DECISION, not an implementation detail, and it is a single
 * named constant so it can be flipped without redesigning anything.
 *
 * Why it defaults to false: `food_objects` stores TOTAL sugar, not added sugar,
 * so a day made of catalog foods has no added-sugar evidence at all. The audited
 * path handled that by hardcoding `added_sugar_g: 0`, which awards the maximum
 * added-sugar subscore — 10% of the total weight — and flatters the day. Scoring
 * an unmeasured nutrient at its best possible value is the failure this work
 * exists to remove, so the day is reported as `insufficient_data` instead.
 *
 * The consequence is deliberate and must be understood before release: until an
 * added-sugar source exists, most days built from catalog foods report
 * `insufficient_data` rather than a number. Grouped meals with authored nutrition
 * can carry `added_sugar_g` and are unaffected.
 *
 * Setting this true scores such days with whatever added sugar IS known, which is
 * a lower bound and therefore overstates the subscore. That is a product choice
 * about which inaccuracy is preferable; it is not a weighting scheme, and no
 * partial-credit weighting is introduced either way.
 */
export const SCORE_DAYS_WITHOUT_ADDED_SUGAR_EVIDENCE = false;

export const NDS_DEPENDENCY_INPUTS: Record<string, number> = {
  snack_kcal_threshold: SNACK_KCAL_THRESHOLD,
  snack_isolation_minutes: SNACK_ISOLATION_MINUTES,
  main_meal_kcal_threshold: MAIN_MEAL_KCAL_THRESHOLD,
  // Folded in so flipping the policy invalidates every cached score rather than
  // leaving a mix of old and new answers in storage.
  score_without_added_sugar: SCORE_DAYS_WITHOUT_ADDED_SUGAR_EVIDENCE ? 1 : 0,
};

export function computeDependencyFingerprint(
  inputs: Record<string, number> = NDS_DEPENDENCY_INPUTS,
): string {
  return Object.keys(inputs)
    .sort()
    .map((key) => `${key}=${inputs[key]}`)
    .join('|');
}

export function currentVersions(): DailyNdsVersions {
  return {
    nds_version: NDS_VERSION,
    classifier_version: CLASSIFIER_VERSION,
    normalizer_version: NDS_NORMALIZER_VERSION,
    day_policy_version: NDS_DAY_POLICY_VERSION,
  };
}

// ============================================================================
// Cache validity
// ============================================================================

export type CacheInvalidationReason =
  | 'no_cache_row'
  | 'missing_source_revision'
  | 'source_revision_moved'
  | 'formula_version_changed'
  | 'classifier_version_changed'
  | 'normalizer_version_changed'
  | 'day_policy_version_changed'
  | 'dependency_fingerprint_changed'
  | 'generation_changed'
  | 'unrecognized_response_state';

const PUBLISHABLE_STATES = new Set(['fresh', 'empty', 'insufficient_data']);

/**
 * Decide whether a cached score may be served as current.
 *
 * Returns null when the cache is valid, or the FIRST reason it is not. The
 * reason is returned rather than a bare boolean so recomputation is explainable
 * in logs and in tests.
 */
export function cacheInvalidationReason(
  snapshot: DaySnapshot,
  expected: {
    versions: DailyNdsVersions;
    dependencyFingerprint: string;
  },
): CacheInvalidationReason | null {
  const cache = snapshot.cache;
  if (!cache) return 'no_cache_row';

  // A pre-contract row cannot be verified against a revision, so it is invalid.
  // It is deliberately not grandfathered in on the strength of being non-zero.
  if (cache.sourceRevision === null) return 'missing_source_revision';
  if (cache.sourceRevision !== snapshot.sourceRevision) return 'source_revision_moved';

  if (cache.generation !== snapshot.activeGeneration) return 'generation_changed';

  if (cache.ndsVersion !== expected.versions.nds_version) return 'formula_version_changed';
  if (cache.classifierVersion !== expected.versions.classifier_version) {
    return 'classifier_version_changed';
  }
  if (cache.normalizerVersion !== expected.versions.normalizer_version) {
    return 'normalizer_version_changed';
  }
  if (cache.dayPolicyVersion !== expected.versions.day_policy_version) {
    return 'day_policy_version_changed';
  }
  if (cache.dependencyFingerprint !== expected.dependencyFingerprint) {
    return 'dependency_fingerprint_changed';
  }

  if (!cache.responseState || !PUBLISHABLE_STATES.has(cache.responseState)) {
    return 'unrecognized_response_state';
  }

  return null;
}

// ============================================================================
// Computation
// ============================================================================

export interface ComputedDay {
  responseState: 'fresh' | 'empty' | 'insufficient_data';
  score100: number;
  subscores: DailyNdsSubscores;
  readings: DailyNdsReadings;
  coverage: DailyNdsCoverage;
  dayProvenance: DailyNdsDayProvenance;
  debugData: Record<string, unknown> | null;
  diagnostics: ConsumedDayDiagnostics;
}

function toSubscores(result: DailyNDSResult): DailyNdsSubscores {
  return {
    wfr: result.subscores.wfr_10,
    ps: result.subscores.ps_10,
    pnd: result.subscores.pnd_10,
    fp: result.subscores.fp_10,
    as: result.subscores.as_10,
    mnc: result.subscores.mnc_10,
    ob: result.subscores.ob_10,
  };
}

function round(value: number | null, decimals = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Build the UI-printable readings.
 *
 * These are derived at computation time and PERSISTED, so an ordinary read never
 * depends on an admin debug request having been made. Values that were not
 * measured stay null rather than becoming zero.
 */
function buildReadings(
  result: DailyNDSResult,
  coverage: ConsumedDayCoverage,
): DailyNdsReadings {
  const debug = (result.debug_data ?? null) as Record<string, unknown> | null;
  const wfr = debug?.wfr as Record<string, unknown> | undefined;
  const wfrRatio = numberOrNull(wfr?.ratio);

  return {
    wfr_percent: wfrRatio === null ? null : round(wfrRatio * 100, 0),
    protein_score_10: round(result.subscores.ps_10),
    fiber_g: coverage.fiber === 'unknown' ? null : round(numberOrNull(debug?.totalFiber)),
    // An unmeasured added-sugar total must not print as 0 g; that reads as a
    // verified absence of added sugar.
    added_sugar_g:
      coverage.addedSugar === 'unknown' ? null : round(numberOrNull(debug?.totalAddedSugar)),
    plant_variety_score_10: round(result.subscores.pnd_10),
    omega_balance_score_10: round(result.subscores.ob_10),
    micronutrient_coverage_score_10: round(result.subscores.mnc_10),
  };
}

function collectLimitations(
  coverage: ConsumedDayCoverage,
  diagnostics: ConsumedDayDiagnostics,
  issueCodes: ReadonlySet<string>,
): DailyNdsLimitation[] {
  const limitations: DailyNdsLimitation[] = [];

  if (coverage.addedSugar !== 'known') limitations.push('added_sugar_unknown');
  if (diagnostics.malformedGroupCount > 0) limitations.push('malformed_meal_group');
  if (diagnostics.parentComponentMismatchCount > 0) {
    limitations.push('parent_component_calorie_mismatch');
  }
  if (issueCodes.has('grouped_totals_missing')) limitations.push('grouped_totals_missing');
  if (issueCodes.has('recipe_reference_snapshot_missing')) {
    limitations.push('recipe_reference_snapshot_missing');
  }
  if (issueCodes.has('food_reference_unresolved')) limitations.push('food_reference_unresolved');
  if (issueCodes.has('component_quantity_basis_unknown') || issueCodes.has('grams_not_convertible')) {
    limitations.push('quantity_basis_unknown');
  }

  return limitations;
}

/**
 * Compute one day from raw journal rows.
 *
 * Debug data is ALWAYS produced internally because the persisted readings are
 * derived from it. Whether a caller is allowed to see it is a separate,
 * authorization-level decision made by the API layer.
 */
export function computeDayFromRows(
  personId: string,
  dateLocal: string,
  rows: Awaited<ReturnType<NdsPersistencePort['listCandidateEntryRows']>>,
  foodEvidence?: ReadonlyMap<string, ConsumedFoodEvidence>,
): ComputedDay {
  const normalized = normalizeConsumedDay(personId, dateLocal, rows, { foodEvidence });
  const { meals, coverage, diagnostics } = buildDailyMealsFromConsumedDay(normalized);
  const issueCodes = new Set(normalized.issues.map((issue) => issue.code));

  const result = calculateDailyNDS(meals, true);
  const readings = buildReadings(result, coverage);
  const limitations = collectLimitations(coverage, diagnostics, issueCodes);

  const { responseState, extraLimitations } = decideResponseState(diagnostics, coverage);

  const ndsCoverage: DailyNdsCoverage = {
    added_sugar: coverage.addedSugar,
    scored_entry_count: diagnostics.eligibleEntryCount,
    unscorable_entry_count: Math.max(
      diagnostics.intakeCount -
        diagnostics.eligibleEntryCount -
        diagnostics.entriesExcludedAsIsolatedSnacks,
      0,
    ),
    limitations: [...limitations, ...extraLimitations],
  };

  return {
    responseState,
    score100: result.nds_score_100,
    subscores: toSubscores(result),
    readings: responseState === 'fresh' ? readings : emptyReadings(),
    coverage: ndsCoverage,
    dayProvenance: diagnostics.dayProvenance,
    debugData: (result.debug_data ?? null) as Record<string, unknown> | null,
    diagnostics,
  };
}

/**
 * Choose between a real score, a verified-empty day, and an unscorable day.
 *
 * The distinctions here are the point of the whole contract:
 *
 * - Nothing logged is a FACT about the day, so it is `empty`, not a score of 0.
 * - Food logged but not interpretable is a fact about OUR DATA. Scoring it would
 *   blame the person for our gap, so it is `insufficient_data`.
 * - Added sugar with no evidence anywhere in the day is the specific trap the
 *   audit found: the old path hardcoded 0 g, which awards the maximum added-sugar
 *   subscore and flatters the day. Absent evidence is therefore
 *   `insufficient_data`, never a free 10.
 *
 * `partial` added-sugar evidence still produces a score, because the alternative
 * would be to invent a weighting for partial coverage. It is reported through
 * `coverage.added_sugar` and the `added_sugar_unknown` limitation so a consumer
 * can label the score as incomplete rather than present it as settled.
 */
export function decideResponseState(
  diagnostics: ConsumedDayDiagnostics,
  coverage: ConsumedDayCoverage,
): {
  responseState: 'fresh' | 'empty' | 'insufficient_data';
  extraLimitations: DailyNdsLimitation[];
} {
  if (diagnostics.intakeCount === 0) {
    return { responseState: 'empty', extraLimitations: [] };
  }

  // Everything logged was excluded or uninterpretable.
  if (diagnostics.eligibleEntryCount === 0) {
    return { responseState: 'insufficient_data', extraLimitations: ['no_scorable_entries'] };
  }

  // Energy is load-bearing for pacing and eligibility, so its absence is always
  // disqualifying.
  if (coverage.calories === 'unknown') {
    return { responseState: 'insufficient_data', extraLimitations: [] };
  }

  if (coverage.addedSugar === 'unknown' && !SCORE_DAYS_WITHOUT_ADDED_SUGAR_EVIDENCE) {
    return { responseState: 'insufficient_data', extraLimitations: [] };
  }

  return { responseState: 'fresh', extraLimitations: [] };
}

// ============================================================================
// Resolution
// ============================================================================

export interface ResolveDailyNDSOptions {
  personId: string;
  dateLocal: string;
  /**
   * When false the resolver never computes inline; it reads, and requests work
   * for anything stale. Used by read paths that must stay fast and by any caller
   * that should not be able to trigger computation load.
   */
  allowInlineCompute?: boolean;
  /** Attach debug data to the returned state. Authorization is the caller's job. */
  includeDebug?: boolean;
  now?: () => Date;
}

export interface ResolveDailyNDSOutcome {
  state: DailyNdsState;
  /** Present when the cache was rejected. Diagnostic only. */
  invalidationReason: CacheInvalidationReason | null;
  /** Present when this call computed the day. */
  computed: ComputedDay | null;
  /** Present when a computed result was offered to storage. */
  publishReason: string | null;
  debugData: Record<string, unknown> | null;
}

function stateFromCache(
  personId: string,
  dateLocal: string,
  snapshot: DaySnapshot,
  cache: CachedDailyScore,
  versions: DailyNdsVersions,
): DailyNdsState {
  const base = {
    date_local: dateLocal,
    person_id: personId,
    day_provenance: cache.dayProvenance ?? 'legacy_unverified',
    versions,
    coverage: {
      added_sugar: cache.addedSugarCoverage ?? 'unknown',
      scored_entry_count: 0,
      unscorable_entry_count: 0,
      limitations: [] as DailyNdsLimitation[],
    } satisfies DailyNdsCoverage,
  };

  if (cache.responseState === 'empty') {
    return { ...base, state: 'empty', source_revision: snapshot.sourceRevision };
  }
  if (cache.responseState === 'insufficient_data') {
    return { ...base, state: 'insufficient_data', source_revision: snapshot.sourceRevision };
  }

  return {
    ...base,
    state: 'fresh',
    nds_score_100: cache.score100 ?? 0,
    subscores_10: cache.subscores ?? {
      wfr: 0,
      ps: 0,
      pnd: 0,
      fp: 0,
      as: 0,
      mnc: 0,
      ob: 0,
    },
    readings: cache.readings ?? emptyReadings(),
    computed_as_of: cache.computedAsOf ?? new Date(0).toISOString(),
    source_revision: snapshot.sourceRevision,
  };
}

function stateFromComputed(
  personId: string,
  dateLocal: string,
  computed: ComputedDay,
  versions: DailyNdsVersions,
  nowIso: string,
  revision: number,
): DailyNdsState {
  const base = {
    date_local: dateLocal,
    person_id: personId,
    day_provenance: computed.dayProvenance,
    versions,
    coverage: computed.coverage,
  };

  if (computed.responseState === 'empty') {
    return { ...base, state: 'empty', source_revision: revision };
  }
  if (computed.responseState === 'insufficient_data') {
    return { ...base, state: 'insufficient_data', source_revision: revision };
  }

  return {
    ...base,
    state: 'fresh',
    nds_score_100: computed.score100,
    subscores_10: computed.subscores,
    readings: computed.readings,
    computed_as_of: nowIso,
    source_revision: revision,
  };
}

/**
 * Present a real-but-stale score as `updating`.
 *
 * Only reachable when a usable prior score exists. Without one there is nothing
 * honest to show, and the caller gets `unavailable` instead of a zero.
 */
function updatingFromCache(
  personId: string,
  dateLocal: string,
  snapshot: DaySnapshot,
  cache: CachedDailyScore,
  versions: DailyNdsVersions,
): DailyNdsState | null {
  if (cache.responseState !== 'fresh' || cache.score100 === null) return null;

  return {
    date_local: dateLocal,
    person_id: personId,
    day_provenance: cache.dayProvenance ?? 'legacy_unverified',
    versions,
    coverage: {
      added_sugar: cache.addedSugarCoverage ?? 'unknown',
      scored_entry_count: 0,
      unscorable_entry_count: 0,
      limitations: [],
    },
    state: 'updating',
    nds_score_100: cache.score100,
    subscores_10: cache.subscores ?? { wfr: 0, ps: 0, pnd: 0, fp: 0, as: 0, mnc: 0, ob: 0 },
    readings: cache.readings ?? emptyReadings(),
    computed_as_of: cache.computedAsOf ?? new Date(0).toISOString(),
    stale_source_revision: cache.sourceRevision,
    current_source_revision: snapshot.sourceRevision,
  };
}

function unavailable(
  personId: string,
  dateLocal: string,
  reason: 'computation_failed' | 'storage_unavailable',
): DailyNdsState {
  return {
    date_local: dateLocal,
    person_id: personId,
    day_provenance: 'empty',
    versions: currentVersions(),
    coverage: {
      added_sugar: 'unknown',
      scored_entry_count: 0,
      unscorable_entry_count: 0,
      limitations: [],
    },
    state: 'unavailable',
    reason,
  };
}

export async function resolveDailyNDS(
  port: NdsPersistencePort,
  options: ResolveDailyNDSOptions,
): Promise<ResolveDailyNDSOutcome> {
  const { personId, dateLocal } = options;
  const allowInlineCompute = options.allowInlineCompute ?? true;
  const now = options.now ?? (() => new Date());
  const versions = currentVersions();
  const dependencyFingerprint = computeDependencyFingerprint();

  let snapshot: DaySnapshot;
  try {
    snapshot = await port.readDaySnapshot(personId, dateLocal);
  } catch (error) {
    console.error('[NDS] Day snapshot read failed:', error);
    return {
      state: unavailable(personId, dateLocal, 'storage_unavailable'),
      invalidationReason: null,
      computed: null,
      publishReason: null,
      debugData: null,
    };
  }

  const invalidationReason = cacheInvalidationReason(snapshot, {
    versions,
    dependencyFingerprint,
  });

  if (invalidationReason === null && snapshot.cache) {
    return {
      state: stateFromCache(personId, dateLocal, snapshot, snapshot.cache, versions),
      invalidationReason: null,
      computed: null,
      publishReason: null,
      debugData: options.includeDebug ? snapshot.cache.debugData : null,
    };
  }

  // The cache is not usable. Make sure the day is queued regardless of whether
  // this request computes it, so a read path that declines to compute still
  // causes the score to converge.
  await port
    .requestWork(personId, dateLocal, snapshot.sourceRevision)
    .catch((error) => console.warn('[NDS] Could not request recompute work:', error));

  if (!allowInlineCompute) {
    const updating = snapshot.cache
      ? updatingFromCache(personId, dateLocal, snapshot, snapshot.cache, versions)
      : null;
    return {
      state: updating ?? unavailable(personId, dateLocal, 'computation_failed'),
      invalidationReason,
      computed: null,
      publishReason: null,
      debugData: null,
    };
  }

  let computed: ComputedDay;
  try {
    const rows = await port.listCandidateEntryRows(personId, dateLocal);
    // Load every referenced food's evidence in one query before normalizing, so
    // nutrient detail is available without the normalizer touching storage.
    const foodEvidence = await port.loadFoodEvidence(collectReferencedFoodObjectIds(rows));
    computed = computeDayFromRows(personId, dateLocal, rows, foodEvidence);
  } catch (error) {
    // A computation failure is reported as a state, not as a 200 response
    // carrying a zero score and a raw error string.
    console.error('[NDS] Day computation failed:', error);
    const updating = snapshot.cache
      ? updatingFromCache(personId, dateLocal, snapshot, snapshot.cache, versions)
      : null;
    return {
      state: updating ?? unavailable(personId, dateLocal, 'computation_failed'),
      invalidationReason,
      computed: null,
      publishReason: null,
      debugData: null,
    };
  }

  const publishInput: PublishDailyScoreInput = {
    personId,
    dateLocal,
    computedFromRevision: snapshot.sourceRevision,
    generation: snapshot.activeGeneration,
    ndsVersion: versions.nds_version,
    classifierVersion: versions.classifier_version,
    normalizerVersion: versions.normalizer_version,
    dayPolicyVersion: versions.day_policy_version,
    dependencyFingerprint,
    responseState: computed.responseState,
    dayProvenance: computed.dayProvenance,
    addedSugarCoverage: computed.coverage.added_sugar,
    score100: computed.score100,
    subscores: computed.subscores,
    readings: computed.readings,
    debugData: computed.debugData,
  };

  let publishReason: string | null = null;
  try {
    const publishResult = await port.publishDailyScore(publishInput);
    publishReason = publishResult.reason;

    if (!publishResult.published) {
      // The day moved, or this deployment was superseded, while we computed. The
      // number we hold is real but already behind, so it is labelled `updating`
      // rather than published or presented as current.
      await port
        .requestWork(personId, dateLocal, publishResult.currentRevision)
        .catch(() => undefined);

      const staleState = stateFromComputed(
        personId,
        dateLocal,
        computed,
        versions,
        now().toISOString(),
        snapshot.sourceRevision,
      );

      if (staleState.state === 'fresh') {
        return {
          state: {
            ...staleState,
            state: 'updating',
            stale_source_revision: snapshot.sourceRevision,
            current_source_revision: publishResult.currentRevision,
          },
          invalidationReason,
          computed,
          publishReason,
          debugData: options.includeDebug ? computed.debugData : null,
        };
      }

      // An empty or unscorable day has no number to show provisionally. Report
      // the prior real score if there is one, otherwise report the computed
      // non-score as-is; both are honest, neither invents a zero.
      const updating = snapshot.cache
        ? updatingFromCache(personId, dateLocal, snapshot, snapshot.cache, versions)
        : null;
      return {
        state: updating ?? staleState,
        invalidationReason,
        computed,
        publishReason,
        debugData: options.includeDebug ? computed.debugData : null,
      };
    }
  } catch (error) {
    console.error('[NDS] Publish failed:', error);
    publishReason = 'publish_error';
    // The computation itself is sound; only storing it failed. Serve it as
    // provisional rather than discarding it or claiming it was saved.
    const staleState = stateFromComputed(
      personId,
      dateLocal,
      computed,
      versions,
      now().toISOString(),
      snapshot.sourceRevision,
    );
    return {
      state:
        staleState.state === 'fresh'
          ? {
              ...staleState,
              state: 'updating',
              stale_source_revision: snapshot.sourceRevision,
              current_source_revision: snapshot.sourceRevision,
            }
          : staleState,
      invalidationReason,
      computed,
      publishReason,
      debugData: options.includeDebug ? computed.debugData : null,
    };
  }

  return {
    state: stateFromComputed(
      personId,
      dateLocal,
      computed,
      versions,
      now().toISOString(),
      snapshot.sourceRevision,
    ),
    invalidationReason,
    computed,
    publishReason,
    debugData: options.includeDebug ? computed.debugData : null,
  };
}
