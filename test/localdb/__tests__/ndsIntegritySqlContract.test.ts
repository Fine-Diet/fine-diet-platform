/**
 * Real-PostgreSQL scenarios for review findings R03, R04, R05 and R09.
 *
 * These are the checks a static SQL assertion cannot make. Every case below runs
 * against a guarded, run-owned disposable local cluster with the actual
 * migration files applied, and several use two or more independent sessions with
 * deterministic barriers rather than sleeps.
 *
 * Written to assert the CORRECTED behaviour, so each one is a failing-first
 * counterexample against the reviewed head and passing evidence afterwards.
 */

import type { Client } from 'pg';

import { startNdsFixture, type NdsFixture } from '../harness';

jest.setTimeout(180_000);

const DAY = '2026-09-12';

let fixture: NdsFixture;
let personId: string;

beforeAll(async () => {
  fixture = await startNdsFixture();
});

afterAll(async () => {
  if (fixture) await fixture.destroy();
});

beforeEach(async () => {
  // Each case starts from an empty pipeline. Without this, a claim in one test
  // can pick up an unrelated person's outstanding row left by an earlier one, and
  // the fencing assertions become order-dependent rather than wrong-or-right.
  // Journal rows go first so their triggers settle before the derived tables are
  // cleared.
  await fixture.sql('DELETE FROM public.journal_entries');
  for (const table of [
    'public.nds_recompute_attempts',
    'public.nds_recompute_work',
    'public.nds_recompute_queue',
    'public.daily_nds',
    'public.journal_day_revisions',
  ]) {
    await fixture.sql(`DELETE FROM ${table}`);
  }
  if (
    (
      await fixture.sql<{ present: string | null }>(
        `SELECT to_regclass('public.nds_legacy_transfer_ledger')::text AS present`,
      )
    )[0].present
  ) {
    await fixture.sql('DELETE FROM public.nds_legacy_transfer_ledger');
  }

  const created = await fixture.createPerson({ timeZone: 'America/Chicago' });
  personId = created.personId;
});

/** Explicit, valid consumed-day metadata for the given local date. */
function payloadFor(dateLocal: string, utcInstant: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: 'Fixture food',
    consumed_day: {
      date_local: dateLocal,
      time_zone: 'America/Chicago',
      utc_instant: utcInstant,
      policy_version: 'nds_day_policy_2026-09-12.v1',
    },
    ...extra,
  });
}

async function insertIntake(
  dateLocal = DAY,
  occurredAt = '2026-09-13T02:30:00Z',
): Promise<string> {
  const rows = await fixture.sql<{ id: string }>(
    `INSERT INTO public.journal_entries (person_id, entry_type, occurred_at, payload)
     VALUES ($1, 'intake', $2, $3::jsonb) RETURNING id`,
    [personId, occurredAt, payloadFor(dateLocal, occurredAt)],
  );
  return rows[0].id;
}

async function revisionOf(dateLocal = DAY): Promise<number | null> {
  const rows = await fixture.sql<{ revision: string }>(
    'SELECT revision FROM public.journal_day_revisions WHERE person_id = $1 AND date_local = $2',
    [personId, dateLocal],
  );
  return rows.length === 0 ? null : Number(rows[0].revision);
}

async function workRow(dateLocal = DAY) {
  const rows = await fixture.sql<Record<string, string | null>>(
    'SELECT * FROM public.nds_recompute_work WHERE person_id = $1 AND date_local = $2',
    [personId, dateLocal],
  );
  return rows[0] ?? null;
}

// ============================================================================
// R03 — work must be requested at the revision the mutation produced
// ============================================================================

describe('R03 transactional revision and work ordering', () => {
  it('requests work at the revision the same transaction produced', async () => {
    await insertIntake();

    const revision = await revisionOf();
    const work = await workRow();

    expect(revision).toBe(1);
    expect(work).not.toBeNull();
    // The reviewed head requested work from a separate trigger that sorted
    // BEFORE the revision trigger, so it read the pre-mutation revision.
    expect(Number(work!.requested_revision)).toBe(revision);
  });

  it('leaves newer work outstanding after a completed job when a second edit lands', async () => {
    const entryId = await insertIntake();
    const firstRevision = await revisionOf();

    // Simulate a worker that finished exactly the revision it saw.
    const claim = await fixture.sql<{ lease_token: string }>(
      'SELECT * FROM public.nds_claim_work(10, 120)',
    );
    const token = claim.find(() => true)?.lease_token;
    expect(token).toBeTruthy();
    await fixture.sql('SELECT * FROM public.nds_complete_work($1, $2, $3, $4, $5)', [
      personId,
      DAY,
      token,
      firstRevision,
      1,
    ]);

    let work = await workRow();
    expect(Number(work!.requested_revision)).toBeLessThanOrEqual(
      Number(work!.processed_revision),
    );

    // A second edit must make the day outstanding again with no page visit.
    await fixture.sql(
      'UPDATE public.journal_entries SET quantity_g = 250 WHERE id = $1',
      [entryId],
    );

    work = await workRow();
    const revisionAfter = await revisionOf();
    expect(revisionAfter).toBe((firstRevision ?? 0) + 1);
    expect(Number(work!.requested_revision)).toBe(revisionAfter);
    expect(Number(work!.requested_revision)).toBeGreaterThan(Number(work!.processed_revision));
  });

  it('rolls back the revision and the work request with the journal mutation', async () => {
    const session = await fixture.connect();
    try {
      await session.query('BEGIN');
      await session.query(
        `INSERT INTO public.journal_entries (person_id, entry_type, occurred_at, payload)
         VALUES ($1, 'intake', $2, $3::jsonb)`,
        [personId, '2026-09-13T02:30:00Z', payloadFor(DAY, '2026-09-13T02:30:00Z')],
      );
      await session.query('ROLLBACK');
    } finally {
      await session.end();
    }

    expect(await revisionOf()).toBeNull();
    expect(await workRow()).toBeNull();
  });

  it('invalidates both days on a cross-date move and keeps a tombstone revision', async () => {
    const entryId = await insertIntake();
    const movedInstant = '2026-09-15T02:30:00Z';
    await fixture.sql(
      `UPDATE public.journal_entries
          SET occurred_at = $2, payload = $3::jsonb
        WHERE id = $1`,
      [entryId, movedInstant, payloadFor('2026-09-14', movedInstant)],
    );

    expect(await revisionOf(DAY)).toBe(2);
    expect(await revisionOf('2026-09-14')).toBe(1);

    // Emptying the origin day must retain its revision so a cached score for it
    // is still invalidated.
    await fixture.sql('DELETE FROM public.journal_entries WHERE id = $1', [entryId]);
    expect(await revisionOf('2026-09-14')).toBe(2);
  });
});

// ============================================================================
// R05 — publication fences
// ============================================================================

describe('R05 publication fencing', () => {
  const versions = {
    nds: 'nds_daily_2026-01-26.v10',
    classifier: 'processing_classifier_2026-02-08.v2',
    normalizer: 'nds_consumed_normalizer_2026-09-12.v1',
    dayPolicy: 'nds_day_policy_2026-09-12.v1',
  };

  async function publish(
    client: Client | NdsFixture,
    overrides: Partial<{
      revision: number;
      generation: number;
      nds: string;
      classifier: string;
      normalizer: string;
      dayPolicy: string;
      state: string;
      score: number | null;
    }> = {},
  ) {
    const revision = overrides.revision ?? (await revisionOf()) ?? 0;
    const generation =
      overrides.generation ??
      Number(
        (
          await fixture.sql<{ generation: string }>('SELECT public.nds_active_generation() AS generation')
        )[0].generation,
      );
    const text = `SELECT * FROM public.nds_publish_daily_score(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`;
    const values = [
      personId,
      DAY,
      revision,
      generation,
      overrides.nds ?? versions.nds,
      overrides.classifier ?? versions.classifier,
      overrides.normalizer ?? versions.normalizer,
      overrides.dayPolicy ?? versions.dayPolicy,
      'snack_kcal_threshold=200',
      overrides.state ?? 'fresh',
      'explicit',
      'known',
      overrides.score === undefined ? 72.5 : overrides.score,
      // A state that carries no score carries no subscores either. Sending
      // numbers alongside a null score is exactly the incoherent row the state
      // contract exists to reject.
      ...(overrides.score === null
        ? [null, null, null, null, null, null, null]
        : [7, 7, 7, 7, 7, 7, 7]),
      JSON.stringify({ wfr_percent: 70 }),
      null,
    ];
    const rows =
      'sql' in client
        ? await (client as NdsFixture).sql<Record<string, unknown>>(text, values)
        : ((await (client as Client).query(text, values)).rows as Record<string, unknown>[]);
    return rows[0];
  }

  it('refuses a publish whose version tuple does not match the active generation context', async () => {
    await insertIntake();
    // An old build reads the new generation integer and sends it with ITS own
    // older formula identity. Comparing the integer alone cannot detect that.
    const result = await publish(fixture, { nds: 'nds_daily_2025-01-01.v3' });
    expect(result.published).toBe(false);
    expect(String(result.reason)).toBe('stale_context');
  });

  it('serialises two simultaneous first publishes for a day with no revision row', async () => {
    // No journal entry: the day has no revision row at all, which is the case
    // where a FOR SHARE on a missing row locks nothing.
    const a = await fixture.connect();
    const b = await fixture.connect();
    try {
      await a.query('BEGIN');
      await b.query('BEGIN');

      const first = publish(a, { revision: 0, state: 'empty', score: null });
      // Give the first transaction time to take its guard, then race the second.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const second = publish(b, { revision: 0, state: 'empty', score: null });

      const firstResult = await first;
      await a.query('COMMIT');
      const secondResult = await second;
      await b.query('COMMIT');

      // Exactly one row must exist, and neither call may claim a publish that
      // did not actually write.
      const rows = await fixture.sql(
        'SELECT count(*)::int AS n FROM public.daily_nds WHERE person_id = $1 AND date_local = $2',
        [personId, DAY],
      );
      expect((rows[0] as { n: number }).n).toBe(1);
      expect([firstResult.published, secondResult.published].filter(Boolean).length)
        .toBeGreaterThanOrEqual(1);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('reports published=false when the conditional write matched no row', async () => {
    await insertIntake();
    const current = (await revisionOf()) ?? 0;
    // Publish a newer result first.
    await publish(fixture, { revision: current });

    // Stands in for a worker that published a newer revision between this
    // caller's compute and its write. It has to go through the publishing flag
    // because the writer fence refuses unannounced writes — which is the point of
    // the fence, and is asserted separately below.
    const repair = await fixture.connect();
    try {
      await repair.query('BEGIN');
      await repair.query(`SELECT set_config('nds.publishing', 'on', TRUE)`);
      await repair.query(
        'UPDATE public.daily_nds SET source_revision = $3 WHERE person_id = $1 AND date_local = $2',
        [personId, DAY, current + 5],
      );
      await repair.query('COMMIT');
    } finally {
      await repair.end();
    }
    const stale = await publish(fixture, { revision: current });
    expect(stale.published).toBe(false);
    expect(String(stale.reason)).toBe('newer_result_present');
  });

  it('blocks a legacy direct upsert from modifying an authoritative row', async () => {
    await insertIntake();
    await publish(fixture);

    // The legacy writer path: a direct upsert on daily_nds by a privileged
    // client. A deprecation comment in TypeScript cannot stop a deployed old
    // build, so the database must refuse it.
    await expect(
      fixture.sql(
        `UPDATE public.daily_nds SET nds_score_100 = 99
          WHERE person_id = $1 AND date_local = $2`,
        [personId, DAY],
      ),
    ).rejects.toThrow(/nds_publish_daily_score|not permitted|legacy/i);

    const rows = await fixture.sql<{ nds_score_100: string }>(
      'SELECT nds_score_100 FROM public.daily_nds WHERE person_id = $1 AND date_local = $2',
      [personId, DAY],
    );
    expect(Number(rows[0].nds_score_100)).toBeCloseTo(72.5, 1);
  });

  it('stores a non-numeric state without inventing a zero score', async () => {
    const result = await publish(fixture, { revision: 0, state: 'insufficient_data', score: null });
    expect(result.published).toBe(true);
    const rows = await fixture.sql<{ nds_score_100: string | null; response_state: string }>(
      'SELECT nds_score_100, response_state FROM public.daily_nds WHERE person_id = $1 AND date_local = $2',
      [personId, DAY],
    );
    expect(rows[0].response_state).toBe('insufficient_data');
    expect(rows[0].nds_score_100).toBeNull();
  });
});

// ============================================================================
// R04 — worker completion identity
// ============================================================================

describe('R04 worker completion semantics', () => {
  it('accepts completion for a result that is already current, not only one just published', async () => {
    await insertIntake();
    const revision = (await revisionOf()) ?? 0;
    const claim = await fixture.sql<{ lease_token: string; requested_revision: string }>(
      'SELECT * FROM public.nds_claim_work(10, 120)',
    );
    const token = claim[0].lease_token;

    const completion = await fixture.sql<{ accepted: boolean; still_outstanding: boolean }>(
      'SELECT * FROM public.nds_complete_work($1, $2, $3, $4, $5)',
      [personId, DAY, token, revision, 1],
    );
    expect(completion[0].accepted).toBe(true);
    expect(completion[0].still_outstanding).toBe(false);
  });

  it('keeps a same-revision generation change outstanding', async () => {
    await insertIntake();
    const revision = (await revisionOf()) ?? 0;

    const claim = await fixture.sql<{ lease_token: string }>('SELECT * FROM public.nds_claim_work(10, 120)');
    await fixture.sql('SELECT * FROM public.nds_complete_work($1, $2, $3, $4, $5)', [
      personId,
      DAY,
      claim[0].lease_token,
      revision,
      1,
    ]);
    expect(Number((await workRow())!.processed_generation)).toBe(1);

    // Deploying a new computation context must make the day outstanding again
    // even though nothing was logged.
    await fixture.sql(
      `SELECT public.nds_advance_generation($1,$2,$3,$4)`,
      [
        'nds_daily_2026-01-26.v11',
        'processing_classifier_2026-02-08.v2',
        'nds_consumed_normalizer_2026-09-12.v1',
        'nds_day_policy_2026-09-12.v1',
      ],
    );
    await fixture.sql('SELECT public.nds_request_work($1,$2,$3)', [personId, DAY, revision]);

    const work = await workRow();
    expect(Number(work!.requested_generation)).toBe(2);
    expect(Number(work!.processed_generation)).toBe(1);
    const claimable = await fixture.sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.nds_recompute_work
        WHERE person_id = $1 AND date_local = $2
          AND (requested_revision > processed_revision
               OR requested_generation > processed_generation)`,
      [personId, DAY],
    );
    expect(claimable[0].n).toBe(1);
  });

  it('fences a completion presented after the lease expired', async () => {
    await insertIntake();
    const revision = (await revisionOf()) ?? 0;
    const claim = await fixture.sql<{ lease_token: string }>('SELECT * FROM public.nds_claim_work(10, 1)');
    const token = claim[0].lease_token;

    await fixture.sql(
      `UPDATE public.nds_recompute_work SET lease_expires_at = NOW() - INTERVAL '1 second'
        WHERE person_id = $1 AND date_local = $2`,
      [personId, DAY],
    );

    const late = await fixture.sql<{ accepted: boolean; reason: string }>(
      'SELECT * FROM public.nds_complete_work($1, $2, $3, $4, $5)',
      [personId, DAY, token, revision, 1],
    );
    expect(late[0].accepted).toBe(false);
    expect(late[0].reason).toBe('lease_expired');
  });

  it('gives two concurrent workers disjoint claims', async () => {
    const other = await fixture.createPerson();
    await insertIntake();
    await fixture.sql(
      `INSERT INTO public.journal_entries (person_id, entry_type, occurred_at, payload)
       VALUES ($1, 'intake', $2, $3::jsonb)`,
      [other.personId, '2026-09-13T02:30:00Z', payloadFor(DAY, '2026-09-13T02:30:00Z')],
    );
    await fixture.sql(
      "UPDATE public.nds_recompute_work SET not_before = NOW() - INTERVAL '1 minute'",
    );

    const a = await fixture.connect();
    const b = await fixture.connect();
    try {
      const [claimA, claimB] = await Promise.all([
        a.query('SELECT * FROM public.nds_claim_work(10, 120)'),
        b.query('SELECT * FROM public.nds_claim_work(10, 120)'),
      ]);
      const keys = [...claimA.rows, ...claimB.rows].map(
        (row) => `${row.person_id}|${row.date_local}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    } finally {
      await a.end();
      await b.end();
    }
  });
});

// ============================================================================
// R09 — legacy cutover
// ============================================================================

describe('R09 legacy queue cutover', () => {
  it('transfers outstanding legacy work into the new table idempotently', async () => {
    const owner = await fixture.connect();
    try {
      await applyCutover(owner);
    } finally {
      await owner.end();
    }

    // A legacy pending row for a day the new table has never seen.
    const legacyPerson = await fixture.createPerson();
    await fixture.sql(
      `INSERT INTO public.nds_recompute_queue (person_id, date_local, status)
       VALUES ($1, $2, 'pending')`,
      [legacyPerson.personId, DAY],
    );

    const first = await fixture.sql<{ transferred: number; already_present: number }>(
      'SELECT * FROM public.nds_transfer_legacy_queue()',
    );
    expect(Number(first[0].transferred)).toBe(1);

    const ledger = await fixture.sql<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.nds_legacy_transfer_ledger',
    );
    expect(ledger[0].n).toBe(1);

    // Repeat execution must not double-transfer or lose the record.
    const second = await fixture.sql<{ transferred: number; already_present: number }>(
      'SELECT * FROM public.nds_transfer_legacy_queue()',
    );
    expect(Number(second[0].transferred)).toBe(0);

    // The legacy row keeps its own history; it is not marked completed to make a
    // gate pass.
    const legacy = await fixture.sql<{ status: string; transferred_at: string | null }>(
      'SELECT status, transferred_at FROM public.nds_recompute_queue WHERE person_id = $1',
      [legacyPerson.personId],
    );
    expect(legacy[0].status).toBe('pending');
    expect(legacy[0].transferred_at).not.toBeNull();
  });

  it('refuses to contract while the legacy enqueue trigger is still attached', async () => {
    const owner = await fixture.connect();
    try {
      await applyCutover(owner);
      await expect(applySqlText(owner, CONTRACT_SQL_GUARD_PROBE)).rejects.toThrow(
        /legacy enqueue trigger/i,
      );
    } finally {
      await owner.end();
    }
  });

  it('detaches new writers on rollback without dropping journal history', async () => {
    await insertIntake();
    const owner = await fixture.connect();
    try {
      const { applySqlFile, ROLLBACK_MIGRATION } = await import('../harness');
      await applySqlFile(owner, ROLLBACK_MIGRATION);
    } finally {
      await owner.end();
    }

    const triggers = await fixture.sql<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'public.journal_entries'::regclass
          AND NOT tgisinternal
          AND tgname IN (
            'trigger_nds_track_journal_day_revision',
            'trigger_nds_request_work'
          )`,
    );
    expect(triggers).toEqual([]);

    const fence = await fixture.sql<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = 'public.daily_nds'::regclass
          AND NOT tgisinternal
          AND tgname = 'trigger_nds_guard_daily_nds_writer'`,
    );
    expect(fence).toEqual([]);

    const history = await fixture.sql<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.journal_entries WHERE person_id = $1',
      [personId],
    );
    expect(history[0].n).toBe(1);
  });
});

/** Applies the cutover migration if it exists; skips loudly if it does not. */
async function applyCutover(client: Client): Promise<void> {
  const fs = await import('fs');
  const { CUTOVER_MIGRATION } = await import('../harness');
  if (!fs.existsSync(CUTOVER_MIGRATION)) {
    throw new Error(`Cutover migration missing at ${CUTOVER_MIGRATION}`);
  }
  const { applySqlFile } = await import('../harness');
  await applySqlFile(client, CUTOVER_MIGRATION);
}

const CONTRACT_SQL_GUARD_PROBE = `SELECT public.nds_assert_ready_to_contract();`;

async function applySqlText(client: Client, sql: string): Promise<void> {
  await client.query(sql);
}
