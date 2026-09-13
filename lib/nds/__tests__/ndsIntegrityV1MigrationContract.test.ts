/**
 * NDS Integrity v1 — static contract for the local migration artifacts.
 *
 * EXECUTION MODEL. These migrations ARE executed, against a disposable local
 * PostgreSQL cluster that this run creates and destroys — see
 * test/localdb/__tests__/ndsIntegritySqlContract.test.ts and `npm run test:localdb`.
 * No connected or remote database is touched by either suite.
 *
 * The earlier version of this header said no local server was available and that
 * execution was BLOCKED / NOT RUN. That is no longer true and the claim has been
 * removed rather than left to age: behavioural verification now runs for real, so
 * this file is only the static half.
 *
 * What this suite provides is a cheap gate that runs without a server: it fails if
 * the properties the design depends on are removed or weakened by a later edit. It
 * checks structure and guarantees, not formatting.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function sql(file: string): string {
  return readFileSync(join(process.cwd(), 'scripts/sql', file), 'utf8');
}

const STEP_01 = 'ndsIntegrityV1_01_dayRevisions.sql';
const STEP_02 = 'ndsIntegrityV1_02_resolverAndWorker.sql';
const STEP_03 = 'ndsIntegrityV1_03_legacyCutover.sql';
const STEP_04 = 'ndsIntegrityV1_04_contract.sql';
const STEP_99 = 'ndsIntegrityV1_99_rollback.sql';

describe('step 01 — consumed day and transactional revisions', () => {
  const text = sql(STEP_01);

  it('is additive: it creates and alters, and drops nothing but its own trigger', () => {
    // A DROP TRIGGER for the trigger this file itself creates is how the file
    // stays idempotent. Any other DROP would make expand destructive.
    const drops = text.match(/^\s*DROP\s+\w+/gim) ?? [];
    for (const drop of drops) {
      expect(drop).toMatch(/DROP\s+(TRIGGER|POLICY)/i);
    }
    expect(text).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(text).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(text).not.toMatch(/\bTRUNCATE\b/i);
    expect(text).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('never rewrites existing journal rows', () => {
    expect(text).not.toMatch(/UPDATE\s+public\.journal_entries/i);
  });

  it('falls back to the UTC compatibility bucket for every rejection path', () => {
    // Absent metadata, wrong type, missing fields, unparseable values, an
    // unsupported zone, and an internally inconsistent claim must ALL land on the
    // same deterministic bucket.
    const fallbacks =
      text.match(/RETURN \(p_occurred_at AT TIME ZONE 'UTC'\)::DATE;/g) ?? [];
    expect(fallbacks.length).toBeGreaterThanOrEqual(6);
    expect(text).toMatch(/v_derived_date IS DISTINCT FROM v_claimed_date/);
  });

  it('rejects bare numeric offsets as timezones', () => {
    expect(text).toMatch(/v_zone_text <> 'UTC' AND v_zone_text NOT LIKE '%\/%'/);
  });

  it('advances revisions through a transactional upsert, not a sequence', () => {
    expect(text).toMatch(/ON CONFLICT \(person_id, date_local\) DO UPDATE/);
    expect(text).toMatch(/SET revision\s+= r\.revision \+ 1/);
    // A sequence advance is not transactional, so it cannot be used here.
    expect(text).not.toMatch(/CREATE SEQUENCE/i);
    expect(text).not.toMatch(/nextval/i);
  });

  it('is an AFTER row trigger over insert, update and delete, and is not deferred', () => {
    expect(text).toMatch(
      /CREATE TRIGGER trigger_nds_track_journal_day_revision\s+AFTER INSERT OR UPDATE OR DELETE ON public\.journal_entries\s+FOR EACH ROW/,
    );
    // A deferred constraint trigger could fire outside the mutation's own
    // visibility window, which is exactly what the revision must not do.
    expect(text).not.toMatch(/CREATE CONSTRAINT TRIGGER/i);
    expect(text).not.toMatch(/DEFERRABLE INITIALLY/i);
  });

  it('invalidates both days of a cross-date move, in a fixed lock order', () => {
    expect(text).toMatch(/move_out/);
    expect(text).toMatch(/move_in/);
    expect(text).toMatch(/\(v_old_person, v_old_day\) <= \(v_new_person, v_new_day\)/);
  });

  it('reacts to intake/non-intake transitions and skips unrelated journal domains', () => {
    expect(text).toMatch(/type_transition/);
    expect(text).toMatch(/IF NOT v_old_relevant AND NOT v_new_relevant THEN/);
  });

  it('treats every NDS-relevant column change as relevant', () => {
    for (const column of [
      'entry_type',
      'person_id',
      'occurred_at',
      'payload',
      'quantity_g',
      'protein_score_10',
      'is_main_meal',
      'meal_derived_data',
    ]) {
      expect(text).toMatch(
        new RegExp(`OLD\\.${column}\\s+IS DISTINCT FROM NEW\\.${column}`),
      );
    }
  });

  it('forces RLS and grants no write on revisions to any browser role', () => {
    expect(text).toMatch(/ALTER TABLE public\.journal_day_revisions ENABLE ROW LEVEL SECURITY/);
    expect(text).toMatch(/ALTER TABLE public\.journal_day_revisions FORCE ROW LEVEL SECURITY/);
    expect(text).toMatch(/REVOKE ALL ON public\.journal_day_revisions FROM anon/);
    expect(text).toMatch(/REVOKE ALL ON public\.journal_day_revisions FROM authenticated/);
    expect(text).toMatch(/GRANT SELECT ON public\.journal_day_revisions TO authenticated/);
    // Only SELECT is granted; no write policy exists for a browser role.
    expect(text).not.toMatch(/CREATE POLICY[\s\S]*?FOR (INSERT|UPDATE|DELETE|ALL)[\s\S]*?TO (authenticated|anon)/i);
  });

  it('keeps the privileged bump function away from browser roles', () => {
    expect(text).toMatch(
      /REVOKE ALL ON FUNCTION public\.nds_bump_day_revision\(UUID, DATE, TEXT\) FROM authenticated/,
    );
  });

  it('pins search_path on every function it defines', () => {
    const definitions = text.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) ?? [];
    expect(definitions.length).toBeGreaterThan(0);
    const pins = text.match(/SET search_path = pg_catalog, public/g) ?? [];
    expect(pins.length).toBeGreaterThanOrEqual(definitions.length);
  });

  it("adds the subject's timezone as a nullable column with no backfill", () => {
    expect(text).toMatch(/ADD COLUMN IF NOT EXISTS consumed_time_zone TEXT/);
    expect(text).not.toMatch(/consumed_time_zone\s+TEXT\s+NOT NULL/i);
    expect(text).not.toMatch(/UPDATE\s+public\.people/i);
  });
});

describe('step 02 — publication guard, fencing and the coalescing worker', () => {
  const text = sql(STEP_02);

  it('adds cache-validity columns without dropping anything', () => {
    for (const column of [
      'source_revision',
      'normalizer_version',
      'day_policy_version',
      'dependency_fingerprint',
      'computation_generation',
      'response_state',
      'added_sugar_coverage',
      'readings',
    ]) {
      expect(text).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
    }
    expect(text).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('reads revision, generation and cache metadata in ONE statement', () => {
    // Sequential statements at READ COMMITTED need not share a snapshot, so the
    // resolver must not assemble validity from separate round trips.
    const body = text.slice(
      text.indexOf('CREATE OR REPLACE FUNCTION public.nds_read_day_snapshot'),
      text.indexOf('COMMENT ON FUNCTION public.nds_read_day_snapshot'),
    );
    // A plain SQL function whose body is a single top-level query: the two
    // sources are JOINED rather than fetched by successive statements.
    expect(body).toMatch(/LANGUAGE sql/);
    expect(body).not.toMatch(/LANGUAGE plpgsql/);
    expect(body).not.toMatch(/\bINTO\b/);
    expect((body.match(/;/g) ?? []).length).toBe(2); // end of query, end of body
    expect(body).toMatch(/LEFT JOIN public\.journal_day_revisions/);
    expect(body).toMatch(/LEFT JOIN public\.daily_nds/);
    expect(body).toMatch(/CROSS JOIN public\.nds_computation_generation/);
  });

  it('guards publication on a row that exists, and locks it for update', () => {
    const publish = text.slice(text.indexOf('CREATE OR REPLACE FUNCTION public.nds_publish_daily_score'));
    // The guard row is inserted first: FOR SHARE on an absent row locks nothing,
    // so two initial publishes for the same day could both pass the guard.
    expect(publish).toMatch(
      /INSERT INTO public\.journal_day_revisions[\s\S]*?ON CONFLICT \(person_id, date_local\) DO NOTHING/,
    );
    // FOR UPDATE, not FOR SHARE: concurrent publishes must serialise against each
    // other, not only against an invalidation.
    expect(publish).toMatch(/FROM public\.journal_day_revisions[\s\S]*?FOR UPDATE/);
    expect(publish).toMatch(/p_computed_from_revision IS DISTINCT FROM v_current_revision/);
    expect(publish).toMatch(/'source_changed'/);
  });

  it('binds the generation integer to the version tuple it denotes', () => {
    // An old build can read the new generation number; only comparing the
    // versions with it detects that the build is not the one that owns it.
    expect(text).toMatch(/p_nds_version\s+IS DISTINCT FROM v_gen_nds/);
    expect(text).toMatch(/p_classifier_version IS DISTINCT FROM v_gen_classifier/);
    expect(text).toMatch(/p_normalizer_version IS DISTINCT FROM v_gen_normalizer/);
    expect(text).toMatch(/p_day_policy_version IS DISTINCT FROM v_gen_day_policy/);
    expect(text).toMatch(/'stale_context'/);
  });

  it('reports the write it actually made, not the write it attempted', () => {
    expect(text).toMatch(/GET DIAGNOSTICS v_written = ROW_COUNT/);
    expect(text).toMatch(/'newer_result_present'/);
  });

  it('refuses a stored result whose state and numbers disagree', () => {
    // Score columns must be nullable for `empty` and `insufficient_data`, and a
    // conditional constraint keeps state and numbers coherent in both directions.
    expect(text).toMatch(/ALTER COLUMN nds_score_100 DROP NOT NULL/);
    expect(text).toMatch(/CONSTRAINT daily_nds_state_numeric_contract CHECK/);
    expect(text).toMatch(/WHEN response_state = 'fresh' THEN[\s\S]*?nds_score_100 IS NOT NULL/);
    expect(text).toMatch(
      /WHEN response_state IN \('empty', 'insufficient_data'\) THEN[\s\S]*?nds_score_100 IS NULL/,
    );
  });

  it('fences a legacy direct writer out of authoritative rows', () => {
    // A deprecation comment in TypeScript cannot stop a deployed old build, so the
    // refusal has to live in the database.
    expect(text).toMatch(/CREATE OR REPLACE FUNCTION public\.nds_guard_daily_nds_writer/);
    expect(text).toMatch(
      /CREATE TRIGGER trigger_nds_guard_daily_nds_writer\s+BEFORE INSERT OR UPDATE ON public\.daily_nds/,
    );
    // The publishing flag is transaction-local, so it cannot leak to a later
    // statement on a pooled connection.
    expect(text).toMatch(/set_config\('nds\.publishing', 'on', TRUE\)/);
    expect(text).toMatch(/ERRCODE = 'insufficient_privilege'/);
  });

  it('refuses to publish from a superseded computation generation', () => {
    expect(text).toMatch(/p_generation IS DISTINCT FROM v_active_generation/);
    expect(text).toMatch(/'stale_generation'/);
    expect(text).toMatch(/'newer_generation_present'/);
  });

  it('never regresses a newer published result', () => {
    expect(text).toMatch(/v_existing_revision > p_computed_from_revision/);
    expect(text).toMatch(
      /WHERE \(d\.source_revision IS NULL OR d\.source_revision <= EXCLUDED\.source_revision\)/,
    );
    // Generation belongs in the predicate too: at one revision, a newer
    // computation context must not be overwritten by an older one.
    expect(text).toMatch(
      /AND \(d\.computation_generation IS NULL\s+OR d\.computation_generation <= EXCLUDED\.computation_generation\)/,
    );
  });

  it('keeps stored readings when only debug data is absent', () => {
    expect(text).toMatch(/debug_data = COALESCE\(EXCLUDED\.debug_data, d\.debug_data\)/);
  });

  it('coalesces work per person/day without a status column to collide on', () => {
    const work = text.slice(
      text.indexOf('CREATE TABLE IF NOT EXISTS public.nds_recompute_work'),
      text.indexOf('CREATE TABLE IF NOT EXISTS public.nds_recompute_attempts'),
    );
    expect(work).toMatch(/PRIMARY KEY \(person_id, date_local\)/);
    // No status column exists, so a second completion for the same day has
    // nothing to conflict with. The legacy table keyed uniqueness on it.
    expect(work).not.toMatch(/^\s*status\s/m);
    // Outstanding work has ONE definition, shared by claiming, diagnostics and
    // tests, so they cannot disagree about what is still owed.
    expect(text).toMatch(/CREATE OR REPLACE FUNCTION public\.nds_work_is_outstanding/);
    expect(text).toMatch(
      /SELECT p_requested_revision > p_processed_revision\s+OR p_requested_generation > p_processed_generation/,
    );
    // A changed computation context at an unchanged revision is real work.
    expect(work).toMatch(/processed_generation BIGINT NOT NULL/);
  });

  it('requests work from the revision trigger itself, not a second trigger', () => {
    // The removed design relied on alphabetical trigger ordering putting
    // trigger_nds_request_work after trigger_nds_track_journal_day_revision.
    // 'request' sorts BEFORE 'track', so it read the pre-mutation revision.
    expect(text).not.toMatch(/CREATE TRIGGER trigger_nds_request_work/);
    expect(text).toMatch(/DROP TRIGGER IF EXISTS trigger_nds_request_work/);
    expect(text).toMatch(/CREATE OR REPLACE FUNCTION public\.nds_after_day_revision_bump/);
    expect(sql(STEP_01)).toMatch(/PERFORM public\.nds_after_day_revision_bump\(/);
  });

  it('makes the coalescing window observable instead of hard-coding it', () => {
    expect(text).toMatch(/current_setting\('nds\.request_debounce_ms', TRUE\)/);
    expect(text).not.toMatch(/NOW\(\) \+ INTERVAL '5 seconds'/);
  });

  it('claims work atomically with a reclaimable lease', () => {
    expect(text).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(text).toMatch(/lease_expires_at IS NULL OR w\.lease_expires_at <= NOW\(\)/);
    expect(text).toMatch(/lease_token\s+= gen_random_uuid\(\)/);
  });

  it('fences completion on the live lease and reports remaining work', () => {
    const complete = text.slice(
      text.indexOf('FUNCTION public.nds_complete_work'),
      text.indexOf('FUNCTION public.nds_fail_work'),
    );
    expect(complete).toMatch(/v_row\.lease_token IS DISTINCT FROM p_lease_token/);
    expect(complete).toMatch(/'lease_not_held'/);
    expect(complete).toMatch(/'lease_expired'/);
    // Only the identity that was verified is marked processed, so a mutation or a
    // generation change that arrived mid-run leaves the day outstanding.
    expect(complete).toMatch(
      /processed_revision\s+= GREATEST\(processed_revision, p_processed_revision\)/,
    );
    expect(complete).toMatch(
      /processed_generation = GREATEST\(processed_generation, p_processed_generation\)/,
    );
    expect(complete).toMatch(/still_outstanding/);
  });

  it('retires the signatures it supersedes instead of leaving both callable', () => {
    // Adding defaulted parameters would leave the old signature resolvable, so a
    // stale caller would keep silently taking the old path.
    expect(text).toMatch(/DROP FUNCTION IF EXISTS public\.nds_complete_work\(UUID, DATE, UUID, BIGINT\);/);
    expect(text).toMatch(/DROP FUNCTION IF EXISTS public\.nds_publish_daily_score\(/);
  });

  it('records each attempt separately instead of overwriting the last error', () => {
    expect(text).toMatch(/CREATE TABLE IF NOT EXISTS public\.nds_recompute_attempts/);
    expect(text).toMatch(
      /outcome\s+TEXT NOT NULL CHECK \(outcome IN \('completed', 'failed', 'fenced_out', 'lease_expired'\)\)/,
    );
  });

  it('parks an exhausted day rather than clearing its request', () => {
    const fail = text.slice(text.indexOf('FUNCTION public.nds_fail_work'));
    expect(fail).toMatch(/CASE WHEN v_retry THEN NOW\(\) \+ v_backoff ELSE NOW\(\) \+ INTERVAL '1 day' END/);
    expect(fail).not.toMatch(/processed_revision\s*=\s*requested_revision/);
  });

  it('denies browser roles all access to work, attempts and the generation fence', () => {
    for (const table of [
      'nds_recompute_work',
      'nds_recompute_attempts',
      'nds_computation_generation',
    ]) {
      expect(text).toMatch(new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
      expect(text).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`));
    }
    expect(text).not.toMatch(/GRANT EXECUTE[\s\S]*nds_publish_daily_score/);
    expect(text).not.toMatch(/GRANT EXECUTE[\s\S]*nds_claim_work/);
  });

  it('pins search_path on every function it defines', () => {
    const definitions = text.match(/CREATE OR REPLACE FUNCTION public\.\w+/g) ?? [];
    expect(definitions.length).toBeGreaterThan(0);
    const pins = text.match(/SET search_path = pg_catalog, public/g) ?? [];
    expect(pins.length).toBeGreaterThanOrEqual(definitions.length);
  });

  it('leaves the legacy queue trigger alone during expand', () => {
    expect(text).not.toMatch(/DROP TRIGGER IF EXISTS trigger_enqueue_nds_recompute/);
  });
});

describe('step 03 — executable legacy cutover', () => {
  const text = sql(STEP_03);

  it('actually moves legacy work rather than instructing an operator to', () => {
    // The superseded step told the operator to drain the legacy queue "via the new
    // worker", which reads a different table entirely. Nothing moved the rows, so
    // the gate could never be satisfied.
    expect(text).toMatch(/CREATE OR REPLACE FUNCTION public\.nds_transfer_legacy_queue/);
    expect(text).toMatch(/PERFORM public\.nds_request_work\(/);
  });

  it('is idempotent and never rewrites the legacy row status', () => {
    expect(text).toMatch(/UNIQUE \(legacy_queue_id, requested_date_local\)/);
    expect(text).toMatch(/ON CONFLICT \(legacy_queue_id, requested_date_local\) DO NOTHING/);
    // Forcing a status to 'completed' to satisfy a gate would be a false record of
    // work that never ran. Only the additive transfer stamp is written.
    expect(text).toMatch(/SET transferred_at = NOW\(\)/);
    expect(text).not.toMatch(/status\s*=\s*'completed'/);
  });

  it('transfers to the corrected consumed day, not the legacy UTC date', () => {
    expect(text).toMatch(/public\.nds_consumed_day\(j\.payload, j\.occurred_at\)/);
    expect(text).toMatch(/SELECT v_row\.date_local\s+UNION/);
  });

  it('records the legacy and corrected day so disagreements are auditable', () => {
    expect(text).toMatch(/legacy_date_local\s+DATE NOT NULL/);
    expect(text).toMatch(/requested_date_local DATE NOT NULL/);
    expect(text).toMatch(/legacy_date_local IS DISTINCT FROM requested_date_local/);
  });

  it('refuses to declare readiness while the legacy trigger can still add rows', () => {
    const gate = text.slice(text.indexOf('FUNCTION public.nds_assert_ready_to_contract'));
    expect(gate).toMatch(/tgname = 'trigger_enqueue_nds_recompute'/);
    expect(gate).toMatch(/legacy enqueue trigger is still attached/);
    expect(gate).toMatch(/transferred_at IS NULL/);
  });

  it('adds no destructive statement of its own', () => {
    expect(text).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TRIGGER)\b/i);
    expect(text).not.toMatch(/\bTRUNCATE\b/i);
    expect(text).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});

describe('step 04 — contract phase', () => {
  const text = sql(STEP_04);

  it('detaches the legacy trigger BEFORE transferring, so the set cannot grow', () => {
    const detachAt = text.indexOf('DROP TRIGGER IF EXISTS trigger_enqueue_nds_recompute');
    const transferAt = text.indexOf('public.nds_transfer_legacy_queue()');
    const gateAt = text.indexOf('public.nds_assert_ready_to_contract()');
    expect(detachAt).toBeGreaterThan(-1);
    expect(transferAt).toBeGreaterThan(detachAt);
    expect(gateAt).toBeGreaterThan(transferAt);
  });

  it('removes the legacy enqueue path but retains its history', () => {
    expect(text).toMatch(/DROP FUNCTION IF EXISTS public\.enqueue_nds_recompute/);
    expect(text).not.toMatch(/DROP TABLE[\s\S]*nds_recompute_queue/i);
  });

  it('leaves no unreachable gate of its own', () => {
    // The precondition block that could never be satisfied is gone; readiness is
    // asserted by the one function that also knows how to reach it.
    expect(text).not.toMatch(/drain via the new worker/);
  });

  it('does not grandfather unverified cached scores', () => {
    expect(sql(STEP_03)).toMatch(/source_revision IS NULL/);
    expect(sql(STEP_03)).toMatch(/recomputed on read/);
  });
});

describe('step 99 — rollback', () => {
  const text = sql(STEP_99);

  it('releases the daily_nds writer fence first, before anything else', () => {
    // The fence refuses writes that do not come through nds_publish_daily_score.
    // Restoring the old application without releasing it would leave every NDS
    // write rejected and every day silently frozen.
    const fenceAt = text.indexOf('DROP TRIGGER IF EXISTS trigger_nds_guard_daily_nds_writer');
    const contractAt = text.indexOf('DROP CONSTRAINT IF EXISTS daily_nds_state_numeric_contract');
    const detachAt = text.indexOf('DROP TRIGGER IF EXISTS trigger_nds_track_journal_day_revision');
    expect(fenceAt).toBeGreaterThan(-1);
    expect(contractAt).toBeGreaterThan(fenceAt);
    expect(detachAt).toBeGreaterThan(contractAt);
  });

  it('does not try to restore NOT NULL on score columns', () => {
    // It would fail against any row legitimately stored as empty or
    // insufficient_data, and a nullable column does not trouble the old writer.
    expect(text).not.toMatch(/ALTER COLUMN nds_score_100 SET NOT NULL/);
  });

  it('detaches the new triggers before anything else is considered', () => {
    const detachAt = text.indexOf('DROP TRIGGER IF EXISTS trigger_nds_track_journal_day_revision');
    const destructiveAt = text.indexOf('3. Remove the new objects');
    expect(detachAt).toBeGreaterThan(-1);
    expect(destructiveAt).toBeGreaterThan(detachAt);
  });

  it('verifies the rollback actually restored the old writer path', () => {
    expect(text).toMatch(/writer_fence_released/);
    expect(text).toMatch(/state_contract_released/);
  });

  it('keeps every destructive statement commented out by default', () => {
    const active = text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(active).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(active).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(active).toMatch(/DROP TRIGGER IF EXISTS trigger_nds_request_work/);
  });

  it('documents that the application is rolled back first', () => {
    expect(text).toMatch(/roll back the APPLICATION FIRST/);
  });
});

describe('cross-file consistency', () => {
  it('names the same day-membership function everywhere it is used', () => {
    expect(sql(STEP_01)).toMatch(/FUNCTION public\.nds_consumed_day\(/);
    // Step 02 no longer calls it: the second work trigger that did has been
    // removed. The cutover does, because a legacy row's UTC date must be mapped
    // through the same day policy as everything else.
    expect(sql(STEP_03)).toMatch(/public\.nds_consumed_day\(/);
  });

  it('step 02 depends on step 01 and says so', () => {
    expect(sql(STEP_02)).toMatch(/Requires step 01/);
  });

  it('every file states that it is for local application only', () => {
    for (const file of [STEP_01, STEP_02, STEP_03, STEP_04, STEP_99]) {
      expect(sql(file)).toMatch(/LOCAL APPLICATION ONLY/);
    }
  });

  it('numbers the cutover before the contract it is a precondition of', () => {
    expect(sql(STEP_04)).toMatch(/after steps 01, 02 and 03/);
    expect(sql(STEP_03)).toMatch(/BEFORE step 04/);
  });
});
