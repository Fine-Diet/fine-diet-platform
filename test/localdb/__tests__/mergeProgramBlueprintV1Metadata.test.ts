/**
 * Disposable PostgreSQL proof for merge_program_blueprint_v1_metadata.
 *
 * Applies the repository migration to a run-owned cluster with no TCP listener.
 * Concurrency uses separate sessions. Nothing here contacts a shared database.
 */

import fs from 'fs';
import path from 'path';
import type { Client } from 'pg';

import { PROTECTED_BASELINE_V1, UNTOUCHED_BASELINE_DRAFT } from '@/lib/programs/baselineMemberBinding';
import { applySqlFile } from '../harness';
import { startLocalCluster, type LocalCluster } from '../localPostgres';

jest.setTimeout(180_000);

const REPO_ROOT = process.cwd();
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/20261017221500_merge_program_blueprint_v1_metadata.sql',
);
const SECURITY_MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/20261010012536_programs_runtime_security_hardening.sql',
);

const PROGRAM_A = '10000000-0000-4000-8000-000000000010';
const PROGRAM_B = '20000000-0000-4000-8000-000000000020';
const DRAFT_ID = '30000000-0000-4000-8000-000000000033';
const FOREIGN_ID = '40000000-0000-4000-8000-000000000044';
const PUBLISHED_ID = '50000000-0000-4000-8000-000000000055';
const ARCHIVED_ID = '60000000-0000-4000-8000-000000000066';
const MISSING_ID = '99999999-0000-4000-8000-000000000099';

const SEED_METADATA = {
  authoringNote: 'keep',
  notes: { keep: true },
};

const FIXTURE_SQL = `
CREATE OR REPLACE FUNCTION public.update_journal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT anon, authenticated, service_role TO CURRENT_USER;

CREATE TABLE public.programs (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.program_versions (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  version_key text NOT NULL CHECK (version_key ~ '^[a-z0-9][a-z0-9._-]*$'),
  version_label text,
  version_number integer NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  duration_days integer CHECK (duration_days IS NULL OR duration_days >= 1),
  default_unlock_day integer NOT NULL DEFAULT 1 CHECK (default_unlock_day >= 1),
  published_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_versions_program_key_unique UNIQUE (program_id, version_key),
  CONSTRAINT program_versions_program_number_unique UNIQUE (program_id, version_number)
);

CREATE TRIGGER program_versions_updated_at
  BEFORE UPDATE ON public.program_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_journal_updated_at();

ALTER TABLE public.program_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can administer program_versions"
  ON public.program_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE ON public.program_versions TO service_role;
GRANT SELECT, UPDATE ON public.programs TO service_role;
`;

function immutabilitySql(): string {
  const source = fs.readFileSync(SECURITY_MIGRATION, 'utf8');
  const start = source.indexOf(
    'CREATE OR REPLACE FUNCTION public.guard_program_version_immutability()',
  );
  const end = source.indexOf(
    'CREATE OR REPLACE FUNCTION public.guard_program_version_relationship()',
  );
  if (start < 0 || end < start) {
    throw new Error('Could not extract the published-version immutability trigger.');
  }
  return source.slice(start, end);
}

type VersionMetadata = {
  authoringNote?: string;
  notes?: { keep?: boolean };
  auditNote?: string;
  programBlueprintV1?: { schemaVersion?: number; marker?: string };
};

let cluster: LocalCluster;
let svc: Client;
let owner: Client;
let updatedAtDefinition = '';
let guardDefinition = '';

function blueprint(marker: string) {
  return { schemaVersion: 1, marker };
}

async function callMerge(
  client: Client,
  programId: string,
  versionId: string,
  value: Record<string, unknown>,
) {
  const result = await client.query(
    `SELECT row_to_json(saved) AS row
     FROM public.merge_program_blueprint_v1_metadata($1::uuid, $2::uuid, $3::jsonb) AS saved`,
    [programId, versionId, JSON.stringify(value)],
  );
  return result.rows[0].row as {
    id: string;
    program_id: string;
    status: string;
    metadata: VersionMetadata;
  };
}

async function readVersion(versionId: string) {
  const result = await svc.query(
    `SELECT id, program_id, status, version_key, duration_days, metadata, updated_at
     FROM public.program_versions
     WHERE id = $1`,
    [versionId],
  );
  return result.rows[0] as {
    id: string;
    program_id: string;
    status: string;
    version_key: string;
    duration_days: number | null;
    metadata: VersionMetadata;
    updated_at: Date;
  };
}

async function expectFailure(
  promise: Promise<unknown>,
  code: string,
  pattern: RegExp,
) {
  try {
    await promise;
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    expect(pgError.code).toBe(code);
    expect(pgError.message ?? '').toMatch(pattern);
    return;
  }
  throw new Error(`Expected SQLSTATE ${code} matching ${pattern}`);
}

beforeAll(async () => {
  cluster = await startLocalCluster({
    onReady: async (client) => {
      await client.query(FIXTURE_SQL);
      await client.query(immutabilitySql());
      await client.query(
        `GRANT EXECUTE ON FUNCTION public.guard_program_version_immutability() TO service_role`,
      );
      const beforeUpdatedAt = await client.query(
        `SELECT pg_get_functiondef('public.update_journal_updated_at()'::regprocedure) AS def`,
      );
      const beforeGuard = await client.query(
        `SELECT pg_get_functiondef('public.guard_program_version_immutability()'::regprocedure) AS def`,
      );
      updatedAtDefinition = beforeUpdatedAt.rows[0].def as string;
      guardDefinition = beforeGuard.rows[0].def as string;
      await applySqlFile(client, MIGRATION);
      await client.query(
        `INSERT INTO public.programs (id, slug, title)
         VALUES ($1, 'baseline-local', 'Baseline local'),
                ($2, 'other-local', 'Other local')`,
        [PROGRAM_A, PROGRAM_B],
      );
      await client.query(
        `INSERT INTO public.program_versions
           (id, program_id, version_key, version_number, status, duration_days, metadata)
         VALUES
           ($1, $3, 'v3-draft', 3, 'draft', 21, $4::jsonb),
           ($2, $3, 'v4-published', 4, 'draft', 21, $4::jsonb),
           ($5, $3, 'v5-archived', 5, 'archived', 21, $4::jsonb),
           ($6, $3, 'baseline-v1', 1, 'draft', 21, '{"source":"v1"}'::jsonb),
           ($7, $3, 'v2-c173d5fb', 2, 'draft', 21, '{"source":"v2"}'::jsonb),
           ($8, $9, 'v1-foreign', 1, 'draft', 21, '{"authoringNote":"foreign"}'::jsonb)`,
        [
          DRAFT_ID,
          PUBLISHED_ID,
          PROGRAM_A,
          JSON.stringify(SEED_METADATA),
          ARCHIVED_ID,
          PROTECTED_BASELINE_V1.versionId,
          UNTOUCHED_BASELINE_DRAFT.versionId,
          FOREIGN_ID,
          PROGRAM_B,
        ],
      );
      await client.query('BEGIN');
      await client.query(`SELECT set_config('fine_diet.publishing_program_version_id', $1, true)`, [
        PROTECTED_BASELINE_V1.versionId,
      ]);
      await client.query(
        `UPDATE public.program_versions
         SET status = 'published', published_at = now()
         WHERE id = $1`,
        [PROTECTED_BASELINE_V1.versionId],
      );
      await client.query('COMMIT');
    },
  });
  owner = await cluster.connect();
  svc = await cluster.connect();
  await svc.query('SET ROLE service_role');
});

afterAll(async () => {
  if (svc) await svc.end().catch(() => undefined);
  if (owner) await owner.end().catch(() => undefined);
  if (cluster) await cluster.destroy();
});

beforeEach(async () => {
  await svc.query(
    `UPDATE public.program_versions
     SET metadata = $2::jsonb
     WHERE id = $1 AND status = 'draft'`,
    [DRAFT_ID, JSON.stringify(SEED_METADATA)],
  );
});

describe('merge_program_blueprint_v1_metadata', () => {
  it('runs on disposable PostgreSQL 17 and leaves shared trigger functions untouched', async () => {
    expect(cluster.postgresVersion).toMatch(/PostgreSQL\) 17\./);
    expect(cluster.descriptor.host.startsWith('/')).toBe(true);
    const migration = fs.readFileSync(MIGRATION, 'utf8');
    expect(migration).toContain(PROTECTED_BASELINE_V1.versionId);
    expect(migration).toContain(UNTOUCHED_BASELINE_DRAFT.versionId);
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.update_journal_updated_at/);
    expect(migration).not.toMatch(/guard_program_version_immutability/);

    const after = await owner.query(
      `SELECT
         (SELECT pg_get_functiondef('public.update_journal_updated_at()'::regprocedure)) AS updated_at_def,
         (SELECT pg_get_functiondef('public.guard_program_version_immutability()'::regprocedure)) AS guard_def,
         (SELECT prosecdef FROM pg_proc WHERE proname = 'merge_program_blueprint_v1_metadata') AS security_definer,
         (SELECT proconfig FROM pg_proc WHERE proname = 'merge_program_blueprint_v1_metadata') AS proconfig,
         EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE tgname = 'program_versions_immutability_guard' AND NOT tgisinternal
         ) AS immutability_trigger`,
    );
    expect(after.rows[0].updated_at_def).toBe(updatedAtDefinition);
    expect(after.rows[0].guard_def).toBe(guardDefinition);
    expect(after.rows[0].security_definer).toBe(false);
    expect(after.rows[0].proconfig).toEqual(['search_path=""']);
    expect(after.rows[0].immutability_trigger).toBe(true);
  });

  it('saves a draft blueprint, repeats the same save, and keeps unrelated metadata', async () => {
    const first = blueprint('draft-save');
    const saved = await callMerge(svc, PROGRAM_A, DRAFT_ID, first);
    expect(saved.status).toBe('draft');
    expect(saved.program_id).toBe(PROGRAM_A);
    expect(saved.metadata.programBlueprintV1).toEqual(first);
    expect(saved.metadata.authoringNote).toBe('keep');
    expect(saved.metadata.notes).toEqual({ keep: true });

    const row = await readVersion(DRAFT_ID);
    expect(row.version_key).toBe('v3-draft');
    expect(row.duration_days).toBe(21);
    expect(row.metadata).toMatchObject({
      authoringNote: 'keep',
      notes: { keep: true },
      programBlueprintV1: first,
    });

    const repeated = await callMerge(svc, PROGRAM_A, DRAFT_ID, first);
    expect(repeated.metadata.programBlueprintV1).toEqual(first);
    expect(repeated.metadata.authoringNote).toBe('keep');
    expect(repeated.metadata.notes).toEqual({ keep: true });
  });

  it('keeps an unrelated key when updated_at does not change inside one transaction', async () => {
    const value = blueprint('same-transaction');
    await svc.query('BEGIN');
    try {
      const touched = await svc.query(
        `UPDATE public.program_versions
         SET metadata = metadata
         WHERE id = $1
         RETURNING updated_at`,
        [DRAFT_ID],
      );
      const token = (touched.rows[0].updated_at as Date).toISOString();
      const noted = await svc.query(
        `UPDATE public.program_versions
         SET metadata = metadata || '{"auditNote":"same-transaction"}'::jsonb
         WHERE id = $1
         RETURNING updated_at, metadata`,
        [DRAFT_ID],
      );
      expect((noted.rows[0].updated_at as Date).toISOString()).toBe(token);
      expect(noted.rows[0].metadata.auditNote).toBe('same-transaction');

      const saved = await callMerge(svc, PROGRAM_A, DRAFT_ID, value);
      const after = await svc.query(
        `SELECT updated_at, metadata, transaction_timestamp() AS tx_now
         FROM public.program_versions
         WHERE id = $1`,
        [DRAFT_ID],
      );
      expect((after.rows[0].updated_at as Date).toISOString()).toBe(token);
      expect((after.rows[0].updated_at as Date).toISOString()).toBe(
        (after.rows[0].tx_now as Date).toISOString(),
      );
      expect(saved.metadata).toMatchObject({
        authoringNote: 'keep',
        notes: { keep: true },
        auditNote: 'same-transaction',
        programBlueprintV1: value,
      });
      expect(after.rows[0].metadata).toMatchObject(saved.metadata);
    } finally {
      await svc.query('COMMIT');
    }
  });

  it('serializes two concurrent blueprint writes without erasing an unrelated key', async () => {
    const a = await cluster.connect();
    const b = await cluster.connect();
    const c = await cluster.connect();
    const writerB = blueprint('writer-b');
    const writerC = blueprint('writer-c');
    let pendingB: Promise<unknown> = Promise.resolve();
    let pendingC: Promise<unknown> = Promise.resolve();
    try {
      await a.query('SET ROLE service_role');
      await b.query('SET ROLE service_role');
      await c.query('SET ROLE service_role');
      await a.query('BEGIN');
      await a.query(
        `SELECT id FROM public.program_versions WHERE id = $1 FOR UPDATE`,
        [DRAFT_ID],
      );

      pendingB = callMerge(b, PROGRAM_A, DRAFT_ID, writerB);
      pendingC = callMerge(c, PROGRAM_A, DRAFT_ID, writerC);
      const started = Date.now();
      let waiting = 0;
      let activity: Array<Record<string, unknown>> = [];
      while (Date.now() - started < 5000) {
        const probe = await owner.query(
          `SELECT pid, wait_event_type, wait_event, state, left(query, 180) AS query
           FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND query ILIKE '%merge_program_blueprint_v1_metadata%'`,
        );
        activity = probe.rows;
        waiting = probe.rows.filter((row) => row.wait_event_type === 'Lock').length;
        if (waiting >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      expect({ waiting, activity }).toMatchObject({ waiting: 2 });

      await a.query(
        `UPDATE public.program_versions
         SET metadata = metadata || '{"auditNote":"from-lock-holder"}'::jsonb
         WHERE id = $1`,
        [DRAFT_ID],
      );
      await a.query('COMMIT');

      const [savedB, savedC] = await Promise.all([pendingB, pendingC]) as [
        Awaited<ReturnType<typeof callMerge>>,
        Awaited<ReturnType<typeof callMerge>>,
      ];
      const finalRow = await readVersion(DRAFT_ID);
      const markers = [savedB, savedC, finalRow].map(
        (row) => row.metadata.programBlueprintV1?.marker,
      );
      expect(savedB.metadata.auditNote).toBe('from-lock-holder');
      expect(savedC.metadata.auditNote).toBe('from-lock-holder');
      expect(savedB.metadata.authoringNote).toBe('keep');
      expect(savedC.metadata.authoringNote).toBe('keep');
      expect(savedB.metadata.notes).toEqual({ keep: true });
      expect(savedC.metadata.notes).toEqual({ keep: true });
      expect(['writer-b', 'writer-c']).toContain(finalRow.metadata.programBlueprintV1?.marker);
      expect(finalRow.metadata).toMatchObject({
        authoringNote: 'keep',
        notes: { keep: true },
        auditNote: 'from-lock-holder',
      });
      expect(new Set(markers).size).toBeGreaterThan(0);
      expect(Object.keys(finalRow.metadata).sort()).toEqual(
        ['auditNote', 'authoringNote', 'notes', 'programBlueprintV1'],
      );
    } finally {
      await a.query('ROLLBACK').catch(() => undefined);
      await Promise.allSettled([pendingB, pendingC]);
      await a.end().catch(() => undefined);
      await b.end().catch(() => undefined);
      await c.end().catch(() => undefined);
    }
  });

  it('rejects a foreign program, a published version, an archived version, and both protected Baseline UUIDs', async () => {
    const beforeForeign = await readVersion(FOREIGN_ID);
    await expectFailure(
      callMerge(svc, PROGRAM_A, FOREIGN_ID, blueprint('foreign')),
      '22023',
      /does not belong/,
    );
    expect(await readVersion(FOREIGN_ID)).toMatchObject({
      metadata: beforeForeign.metadata,
      status: 'draft',
    });

    await svc.query('BEGIN');
    await svc.query(`SELECT set_config('fine_diet.publishing_program_version_id', $1, true)`, [
      PUBLISHED_ID,
    ]);
    await svc.query(
      `UPDATE public.program_versions
       SET status = 'published', published_at = now()
       WHERE id = $1`,
      [PUBLISHED_ID],
    );
    await svc.query('COMMIT');
    const published = await readVersion(PUBLISHED_ID);
    await expectFailure(
      callMerge(svc, PROGRAM_A, PUBLISHED_ID, blueprint('published')),
      '23514',
      /immutable/,
    );
    expect((await readVersion(PUBLISHED_ID)).metadata).toEqual(published.metadata);
    await expectFailure(
      svc.query(
        `UPDATE public.program_versions
         SET metadata = metadata || '{"auditNote":"blocked"}'::jsonb
         WHERE id = $1`,
        [PUBLISHED_ID],
      ),
      '23514',
      /immutable/,
    );

    const archived = await readVersion(ARCHIVED_ID);
    await expectFailure(
      callMerge(svc, PROGRAM_A, ARCHIVED_ID, blueprint('archived')),
      '23514',
      /immutable/,
    );
    expect((await readVersion(ARCHIVED_ID)).metadata).toEqual(archived.metadata);

    const protectedV1 = await readVersion(PROTECTED_BASELINE_V1.versionId);
    await expectFailure(
      callMerge(svc, PROGRAM_A, PROTECTED_BASELINE_V1.versionId, blueprint('v1')),
      '22023',
      /protected Baseline version/,
    );
    expect(await readVersion(PROTECTED_BASELINE_V1.versionId)).toMatchObject({
      status: 'published',
      metadata: protectedV1.metadata,
    });

    const protectedV2 = await readVersion(UNTOUCHED_BASELINE_DRAFT.versionId);
    const direct = await svc.query(
      `UPDATE public.program_versions
       SET metadata = metadata || '{"direct":"allowed-on-draft"}'::jsonb
       WHERE id = $1
       RETURNING metadata`,
      [UNTOUCHED_BASELINE_DRAFT.versionId],
    );
    expect(direct.rows[0].metadata.direct).toBe('allowed-on-draft');
    const draftedV2 = await readVersion(UNTOUCHED_BASELINE_DRAFT.versionId);
    await expectFailure(
      callMerge(svc, PROGRAM_A, UNTOUCHED_BASELINE_DRAFT.versionId, blueprint('v2')),
      '22023',
      /protected Baseline version/,
    );
    expect(await readVersion(UNTOUCHED_BASELINE_DRAFT.versionId)).toMatchObject({
      status: 'draft',
      metadata: draftedV2.metadata,
    });
    const restored = await svc.query(
      `UPDATE public.program_versions
       SET metadata = $2::jsonb
       WHERE id = $1
       RETURNING metadata`,
      [UNTOUCHED_BASELINE_DRAFT.versionId, JSON.stringify(protectedV2.metadata)],
    );
    expect(restored.rows[0].metadata).toEqual(protectedV2.metadata);
    expect((await readVersion(UNTOUCHED_BASELINE_DRAFT.versionId)).metadata.programBlueprintV1)
      .toBeUndefined();
  });

  it('raises on a missing version instead of reporting a successful empty write', async () => {
    const before = await svc.query(`SELECT count(*)::int AS n FROM public.program_versions`);
    await expectFailure(
      callMerge(svc, PROGRAM_A, MISSING_ID, blueprint('missing')),
      'P0002',
      /not found/,
    );
    await svc.query(
      `DO $proof$
       DECLARE
         v public.program_versions;
       BEGIN
         v := public.merge_program_blueprint_v1_metadata(
           '${PROGRAM_A}'::uuid,
           '${MISSING_ID}'::uuid,
           '{"schemaVersion":1,"marker":"missing"}'::jsonb
         );
         RAISE EXCEPTION 'silent success %', v.id;
       EXCEPTION
         WHEN SQLSTATE 'P0002' THEN
           NULL;
       END;
       $proof$`,
    );
    const after = await svc.query(`SELECT count(*)::int AS n FROM public.program_versions`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('allows service_role and refuses anon, authenticated, and PUBLIC', async () => {
    const privileges = await owner.query(
      `SELECT
         has_function_privilege('anon', 'public.merge_program_blueprint_v1_metadata(uuid,uuid,jsonb)', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'public.merge_program_blueprint_v1_metadata(uuid,uuid,jsonb)', 'EXECUTE') AS authenticated,
         has_function_privilege('service_role', 'public.merge_program_blueprint_v1_metadata(uuid,uuid,jsonb)', 'EXECUTE') AS service_role,
         EXISTS (
           SELECT 1
           FROM aclexplode(p.proacl) AS acl
           WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee = 0
         ) AS public_execute
       FROM pg_proc AS p
       JOIN pg_namespace AS n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'merge_program_blueprint_v1_metadata'`,
    );
    expect(privileges.rows[0]).toEqual({
      anon: false,
      authenticated: false,
      service_role: true,
      public_execute: false,
    });

    const anon = await cluster.connect();
    const authenticated = await cluster.connect();
    try {
      await anon.query('SET ROLE anon');
      await authenticated.query('SET ROLE authenticated');
      await expectFailure(
        callMerge(anon, PROGRAM_A, DRAFT_ID, blueprint('anon')),
        '42501',
        /permission denied/,
      );
      await expectFailure(
        callMerge(authenticated, PROGRAM_A, DRAFT_ID, blueprint('authenticated')),
        '42501',
        /permission denied/,
      );
    } finally {
      await anon.end().catch(() => undefined);
      await authenticated.end().catch(() => undefined);
    }

    const saved = await callMerge(svc, PROGRAM_A, DRAFT_ID, blueprint('service-role'));
    expect(saved.metadata.programBlueprintV1).toEqual(blueprint('service-role'));
    expect(saved.metadata.authoringNote).toBe('keep');
  });
});
