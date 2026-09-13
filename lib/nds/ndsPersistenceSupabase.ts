/**
 * Supabase implementation of the NDS persistence port.
 *
 * NDS Integrity v1. Server-only: never import from browser code.
 *
 * Every method is one round trip, and the guarded operations are database
 * functions rather than client-side read-then-write sequences. See
 * scripts/sql/ndsIntegrityV1_02_resolverAndWorker.sql for their definitions and
 * docs/nds/NDS-01-MIGRATION-ACTIVATION.md for their (not yet performed) apply.
 */

import { supabaseAdmin } from '../supabaseServerClient';
import { consumedDayScanWindow } from './dayIdentity';
import type { ConsumedEntryRow } from './consumedInputs/normalizeConsumedEntry';
import type {
  CachedDailyScore,
  DaySnapshot,
  NdsPersistencePort,
  PublishDailyScoreInput,
  PublishDailyScoreResult,
} from './ndsPersistencePort';
import type { DailyNdsDayProvenance, DailyNdsReadings, DailyNdsSubscores } from './dailyNdsState';
import type { ConsumedFoodEvidence, NutrientAvailability } from './consumedInputs/types';

interface SnapshotRow {
  source_revision: number | null;
  active_generation: number | null;
  cached_revision: number | null;
  cached_generation: number | null;
  cached_nds_version: string | null;
  cached_classifier_version: string | null;
  cached_normalizer_version: string | null;
  cached_day_policy_version: string | null;
  cached_dependency_fingerprint: string | null;
  cached_response_state: string | null;
  cached_score_100: number | string | null;
  cached_readings: DailyNdsReadings | null;
  cached_added_sugar_coverage: string | null;
  cached_day_provenance: string | null;
  cached_computed_as_of: string | null;
  cache_row_exists: boolean | null;
}

/**
 * Numeric columns arrive as strings from PostgREST for NUMERIC types. Coerce
 * explicitly and return null on anything non-finite, so a malformed value can
 * never masquerade as a real score of 0.
 */
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read all seven subscores, or none.
 *
 * A partially readable cache row is rejected wholesale rather than filling the
 * gaps with zeros, which would silently understate the day.
 */
function subscoresFrom(row: Record<string, unknown>): DailyNdsSubscores | null {
  const wfr = numeric(row.wfr_10);
  const ps = numeric(row.ps_10);
  const pnd = numeric(row.pnd_10);
  const fp = numeric(row.fp_10);
  const as = numeric(row.as_10);
  const mnc = numeric(row.mnc_10);
  const ob = numeric(row.ob_10);
  if ([wfr, ps, pnd, fp, as, mnc, ob].some((value) => value === null)) return null;
  return {
    wfr: wfr as number,
    ps: ps as number,
    pnd: pnd as number,
    fp: fp as number,
    as: as as number,
    mnc: mnc as number,
    ob: ob as number,
  };
}

const DAY_PROVENANCE_VALUES = new Set<DailyNdsDayProvenance>([
  'explicit',
  'legacy_unverified',
  'mixed',
  'empty',
]);

const AVAILABILITY_VALUES = new Set<NutrientAvailability>(['known', 'unknown', 'partial']);

export function createSupabaseNdsPersistence(): NdsPersistencePort {
  return {
    async readDaySnapshot(personId: string, dateLocal: string): Promise<DaySnapshot> {
      // One statement. Assembling this from separate SELECTs would compare values
      // from different snapshots under READ COMMITTED.
      const { data, error } = await supabaseAdmin
        .rpc('nds_read_day_snapshot', { p_person_id: personId, p_date_local: dateLocal })
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to read NDS day snapshot: ${error.message}`);
      }

      const row = (data ?? null) as (SnapshotRow & Record<string, unknown>) | null;
      if (!row) {
        // No generation row means the fence has not been installed. Treating this
        // as "generation 0, no cache" forces a recompute rather than serving a
        // score whose validity cannot be established.
        return { sourceRevision: 0, activeGeneration: 0, cache: null };
      }

      const cache: CachedDailyScore | null = row.cache_row_exists
        ? {
            sourceRevision: numeric(row.cached_revision),
            generation: numeric(row.cached_generation),
            ndsVersion: row.cached_nds_version,
            classifierVersion: row.cached_classifier_version,
            normalizerVersion: row.cached_normalizer_version,
            dayPolicyVersion: row.cached_day_policy_version,
            dependencyFingerprint: row.cached_dependency_fingerprint,
            responseState: row.cached_response_state,
            score100: numeric(row.cached_score_100),
            subscores: subscoresFrom(row),
            readings: row.cached_readings ?? null,
            addedSugarCoverage: AVAILABILITY_VALUES.has(
              row.cached_added_sugar_coverage as NutrientAvailability,
            )
              ? (row.cached_added_sugar_coverage as NutrientAvailability)
              : null,
            dayProvenance: DAY_PROVENANCE_VALUES.has(
              row.cached_day_provenance as DailyNdsDayProvenance,
            )
              ? (row.cached_day_provenance as DailyNdsDayProvenance)
              : null,
            computedAsOf: row.cached_computed_as_of,
            debugData: (row.debug_data as Record<string, unknown> | null) ?? null,
          }
        : null;

      return {
        sourceRevision: numeric(row.source_revision) ?? 0,
        activeGeneration: numeric(row.active_generation) ?? 0,
        cache,
      };
    },

    async listCandidateEntryRows(
      personId: string,
      dateLocal: string,
    ): Promise<ConsumedEntryRow[]> {
      // The window is intentionally wider than any single calendar day: it must
      // contain every instant that could belong to this local date in ANY
      // timezone. Membership is then decided by the shared day helper, so the
      // query's arithmetic never silently defines the day.
      const { start, end } = consumedDayScanWindow(dateLocal);

      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, person_id, entry_type, occurred_at, payload, quantity_g')
        .eq('person_id', personId)
        .eq('entry_type', 'intake')
        .gte('occurred_at', start)
        .lte('occurred_at', end)
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw new Error(`Failed to list consumed entries: ${error.message}`);
      }

      return (data ?? []) as ConsumedEntryRow[];
    },

    async loadFoodEvidence(
      foodObjectIds: string[],
    ): Promise<Map<string, ConsumedFoodEvidence>> {
      const evidence = new Map<string, ConsumedFoodEvidence>();
      if (foodObjectIds.length === 0) return evidence;

      // One query for the whole day. The previous path fetched per food, with
      // three fallback shapes each.
      const { data, error } = await supabaseAdmin
        .from('food_objects')
        .select(
          `id, canonical_name, brand_name, category, tags,
           calories, protein_g, fiber_g, sugar_g,
           potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg,
           folate_ug, vitamin_a_ug_rae, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug,
           processing_class, processing_class_override, nutrients_extended,
           source_dataset`,
        )
        .in('id', foodObjectIds);

      if (error) {
        throw new Error(`Failed to load food evidence: ${error.message}`);
      }

      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.id);
        const extended = (row.nutrients_extended ?? null) as Record<string, unknown> | null;

        evidence.set(id, {
          foodObjectId: id,
          canonicalName: typeof row.canonical_name === 'string' ? row.canonical_name : '',
          brandName: typeof row.brand_name === 'string' ? row.brand_name : null,
          category: typeof row.category === 'string' ? row.category : null,
          tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
          provenance: 'legacy_catalog_lookup',
          // The dataset identifies which catalog build these figures came from, so
          // a re-ingest is distinguishable from an unchanged food.
          evidenceToken:
            typeof row.source_dataset === 'string' ? row.source_dataset : null,
          perServing: {
            calories: numeric(row.calories),
            protein_g: numeric(row.protein_g),
            fiber_g: numeric(row.fiber_g),
            // food_objects carries TOTAL sugar, not added sugar, and total sugar
            // is not a substitute: whole fruit would be scored like a soda. This
            // stays null so the day reports the gap instead of guessing.
            added_sugar_g: null,
            omega3_g: numeric(extended?.omega3_g),
            omega6_g: numeric(extended?.omega6_g),
            micronutrients: {
              potassium_mg: numeric(row.potassium_mg),
              magnesium_mg: numeric(row.magnesium_mg),
              iron_mg: numeric(row.iron_mg),
              calcium_mg: numeric(row.calcium_mg),
              zinc_mg: numeric(row.zinc_mg),
              folate_ug: numeric(row.folate_ug),
              vitamin_a_ug_rae: numeric(row.vitamin_a_ug_rae),
              vitamin_c_mg: numeric(row.vitamin_c_mg),
              vitamin_d_ug: numeric(row.vitamin_d_ug),
              vitamin_b12_ug: numeric(row.vitamin_b12_ug),
            },
          },
          processingClass: (row.processing_class ?? null) as ConsumedFoodEvidence['processingClass'],
          processingClassOverride: (row.processing_class_override ??
            null) as ConsumedFoodEvidence['processingClassOverride'],
        });
      }

      return evidence;
    },

    async publishDailyScore(
      input: PublishDailyScoreInput,
    ): Promise<PublishDailyScoreResult> {
      const { data, error } = await supabaseAdmin
        .rpc('nds_publish_daily_score', {
          p_person_id: input.personId,
          p_date_local: input.dateLocal,
          p_computed_from_revision: input.computedFromRevision,
          p_generation: input.generation,
          p_nds_version: input.ndsVersion,
          p_classifier_version: input.classifierVersion,
          p_normalizer_version: input.normalizerVersion,
          p_day_policy_version: input.dayPolicyVersion,
          p_dependency_fingerprint: input.dependencyFingerprint,
          p_response_state: input.responseState,
          p_day_provenance: input.dayProvenance,
          p_added_sugar_coverage: input.addedSugarCoverage,
          p_score_100: input.score100,
          p_wfr_10: input.subscores.wfr,
          p_ps_10: input.subscores.ps,
          p_pnd_10: input.subscores.pnd,
          p_fp_10: input.subscores.fp,
          p_as_10: input.subscores.as,
          p_mnc_10: input.subscores.mnc,
          p_ob_10: input.subscores.ob,
          p_readings: input.readings,
          p_debug_data: input.debugData,
        })
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to publish daily NDS: ${error.message}`);
      }

      const row = (data ?? null) as {
        published?: boolean;
        reason?: string;
        current_revision?: number | string | null;
        current_generation?: number | string | null;
      } | null;

      return {
        published: row?.published === true,
        reason: (row?.reason ?? 'source_changed') as PublishDailyScoreResult['reason'],
        currentRevision: numeric(row?.current_revision) ?? input.computedFromRevision,
        currentGeneration: numeric(row?.current_generation) ?? input.generation,
      };
    },

    async requestWork(personId: string, dateLocal: string, revision: number): Promise<void> {
      const { error } = await supabaseAdmin.rpc('nds_request_work', {
        p_person_id: personId,
        p_date_local: dateLocal,
        p_revision: revision,
      });
      if (error) {
        throw new Error(`Failed to request NDS recompute work: ${error.message}`);
      }
    },
  };
}
