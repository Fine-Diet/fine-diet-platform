/**
 * The storage contract the daily NDS resolver depends on.
 *
 * NDS Integrity v1. Declaring this as a port has one purpose: the resolver's
 * correctness rules — cache validity, guarded publication, version fencing, and
 * what happens when a write loses a race — become testable without a database.
 * The Supabase-backed implementation lives in lib/nds/ndsPersistenceSupabase.ts.
 *
 * Every method here maps to exactly one database round trip. That matters for
 * `readDaySnapshot`: at READ COMMITTED, two sequential SELECTs are not
 * guaranteed to see the same snapshot, so the revision and the cached row's
 * validity metadata must arrive together or the comparison is meaningless.
 */

import type { ConsumedEntryRow } from './consumedInputs/normalizeConsumedEntry';
import type {
  DailyNdsDayProvenance,
  DailyNdsReadings,
  DailyNdsSubscores,
} from './dailyNdsState';
import type { ConsumedFoodEvidence, NutrientAvailability } from './consumedInputs/types';

/** A previously published score, with everything needed to judge its validity. */
export interface CachedDailyScore {
  /**
   * The source revision this score was computed from. NULL on rows written
   * before the contract existed; such a row is INVALID, never grandfathered,
   * because a stored number whose source cannot be verified is exactly the
   * failure mode this work removes.
   */
  sourceRevision: number | null;
  generation: number | null;
  ndsVersion: string | null;
  classifierVersion: string | null;
  normalizerVersion: string | null;
  dayPolicyVersion: string | null;
  dependencyFingerprint: string | null;
  /** The state this score was published as. */
  responseState: string | null;
  score100: number | null;
  subscores: DailyNdsSubscores | null;
  readings: DailyNdsReadings | null;
  addedSugarCoverage: NutrientAvailability | null;
  dayProvenance: DailyNdsDayProvenance | null;
  computedAsOf: string | null;
  debugData: Record<string, unknown> | null;
}

export interface DaySnapshot {
  /** Current revision of the day's source. 0 when the day has never been touched. */
  sourceRevision: number;
  /** The computation generation currently permitted to publish. */
  activeGeneration: number;
  cache: CachedDailyScore | null;
}

export interface PublishDailyScoreInput {
  personId: string;
  dateLocal: string;
  computedFromRevision: number;
  generation: number;
  ndsVersion: string;
  classifierVersion: string;
  normalizerVersion: string;
  dayPolicyVersion: string;
  dependencyFingerprint: string;
  responseState: 'fresh' | 'empty' | 'insufficient_data';
  dayProvenance: DailyNdsDayProvenance;
  addedSugarCoverage: NutrientAvailability;
  score100: number;
  subscores: DailyNdsSubscores;
  readings: DailyNdsReadings;
  debugData: Record<string, unknown> | null;
}

/**
 * Outcome of a guarded publish.
 *
 * `published: false` is a normal, expected result, not an error: it means the
 * day changed underneath the computation or the deployment was superseded. The
 * resolver reports that truthfully instead of overwriting newer state.
 */
export interface PublishDailyScoreResult {
  published: boolean;
  reason:
    | 'published'
    | 'source_changed'
    | 'stale_generation'
    | 'newer_result_present'
    | 'newer_generation_present';
  currentRevision: number;
  currentGeneration: number;
}

export interface NdsPersistencePort {
  /** One statement: revision, active generation, and cache validity metadata. */
  readDaySnapshot(personId: string, dateLocal: string): Promise<DaySnapshot>;

  /**
   * Every journal row that could belong to the day, over a window wide enough to
   * cover any timezone. Membership is decided in application code by the shared
   * day helper, not by the query's date arithmetic.
   */
  listCandidateEntryRows(personId: string, dateLocal: string): Promise<ConsumedEntryRow[]>;

  /**
   * Nutrient and processing evidence for every food object the day refers to,
   * loaded in ONE query rather than once per entry.
   *
   * A referenced id that cannot be resolved must be ABSENT from the returned map.
   * The normalizer then records `food_reference_unresolved` and leaves the
   * nutrients unknown, instead of substituting a default.
   */
  loadFoodEvidence(foodObjectIds: string[]): Promise<Map<string, ConsumedFoodEvidence>>;

  publishDailyScore(input: PublishDailyScoreInput): Promise<PublishDailyScoreResult>;

  /** Enqueue (or coalesce into) outstanding recompute work for a day. */
  requestWork(personId: string, dateLocal: string, revision: number): Promise<void>;
}
