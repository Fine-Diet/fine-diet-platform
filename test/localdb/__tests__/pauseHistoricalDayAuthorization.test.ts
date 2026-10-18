/**
 * Disposable PostgreSQL 17 proof for the paused-day SELECT policies.
 *
 * Authenticated-role sessions read through the real RLS expressions. The
 * cluster has no TCP listener and inherits no database credentials.
 */

import fs from 'fs';
import path from 'path';
import type { Client } from 'pg';

import { applySqlFile } from '../harness';
import { startLocalCluster, type LocalCluster } from '../localPostgres';

jest.setTimeout(180_000);

const REPO_ROOT = process.cwd();
const SECURITY_MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/20261010012536_programs_runtime_security_hardening.sql',
);
const MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/20261018171709_pause_historical_day_authorization.sql',
);
const BOUNDARY_MIGRATION = path.join(
  REPO_ROOT,
  'supabase/migrations/20261018185853_historical_member_read_boundary.sql',
);

const PROGRAM = '10000000-0000-4000-8000-000000000101';
const DRAFT_PROGRAM = '10000000-0000-4000-8000-000000000102';
const OTHER_PROGRAM = '10000000-0000-4000-8000-000000000103';
const VERSION = '20000000-0000-4000-8000-000000000201';
const DRAFT_VERSION = '20000000-0000-4000-8000-000000000202';
const OTHER_VERSION = '20000000-0000-4000-8000-000000000203';
const STRANGER_VERSION = '20000000-0000-4000-8000-000000000204';
const DRAFT_PROGRAM_VERSION = '20000000-0000-4000-8000-000000000205';
const MEMBER = '30000000-0000-4000-8000-000000000301';
const STRANGER = '30000000-0000-4000-8000-000000000302';
const MEMBER_AUTH = '40000000-0000-4000-8000-000000000401';
const STRANGER_AUTH = '40000000-0000-4000-8000-000000000402';
const ENROLLMENT = '50000000-0000-4000-8000-000000000501';

const PRODUCTION_MODULES_MD5 = '4e25cc673cb3338492f0acdfd59dad00';
const PRODUCTION_TEMPLATES_MD5 = '1cb96566428950ef81841a77f27b75de';
const CEILING_MODULES_MD5 = '534d15dd7eb8ecf57d6e4be9660ea868';
const CEILING_TEMPLATES_MD5 = '140f4be7bf64266cc653ee6d51706101';

const FIXTURE_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT anon, authenticated, service_role TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.people (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  auth_user_id uuid
);

CREATE TABLE public.programs (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.program_versions (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL,
  status text NOT NULL,
  duration_days integer
);

CREATE TABLE public.program_enrollments (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_version_id uuid NOT NULL,
  status text NOT NULL,
  completed_at timestamptz,
  timezone text NOT NULL,
  selected_start_date date NOT NULL,
  paused_days_total integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT program_enrollments_completed_status_check
    CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE TABLE public.program_delivery_modules (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL,
  program_version_id uuid,
  module_key text NOT NULL,
  module_type text NOT NULL,
  status text NOT NULL,
  status_visibility text[] NOT NULL,
  day_start integer,
  day_end integer,
  body text NOT NULL,
  cta_json jsonb NOT NULL
);

CREATE TABLE public.program_checkin_templates (
  id uuid PRIMARY KEY,
  program_version_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  checkin_day integer NOT NULL,
  prompt_md text,
  questions_json jsonb NOT NULL
);

CREATE TABLE public.program_checkin_responses (
  id uuid PRIMARY KEY,
  enrollment_id uuid NOT NULL,
  response_status text NOT NULL,
  response_payload_json jsonb NOT NULL
);

CREATE SCHEMA programs_private;
CREATE FUNCTION programs_private.current_person_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.people AS p
  WHERE p.auth_user_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION programs_private.current_person_ids()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA programs_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA programs_private TO authenticated;
GRANT EXECUTE ON FUNCTION programs_private.current_person_ids() TO authenticated;

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_delivery_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_checkin_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_checkin_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own program_checkin_responses"
  ON public.program_checkin_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      WHERE e.id = program_checkin_responses.enrollment_id
        AND e.person_id IN (SELECT programs_private.current_person_ids())
    )
  );

CREATE POLICY "Authenticated can read published programs"
  ON public.programs FOR SELECT TO authenticated
  USING (status = 'published');

CREATE POLICY "Users can read own enrolled published program_versions"
  ON public.program_versions FOR SELECT TO authenticated
  USING (
    program_versions.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      JOIN public.programs AS p ON p.id = e.program_id
      WHERE e.program_version_id = program_versions.id
        AND e.program_id = program_versions.program_id
        AND e.person_id IN (SELECT programs_private.current_person_ids())
        AND e.status <> 'cancelled'
        AND p.status = 'published'
    )
  );

CREATE POLICY "Users can read own program_enrollments"
  ON public.program_enrollments FOR SELECT TO authenticated
  USING (person_id IN (SELECT programs_private.current_person_ids()));

GRANT SELECT ON public.programs, public.program_versions, public.program_enrollments,
  public.program_delivery_modules, public.program_checkin_templates,
  public.program_checkin_responses
  TO authenticated;
`;

function extractPolicy(name: string): string {
  const source = fs.readFileSync(SECURITY_MIGRATION, 'utf8');
  const marker = `CREATE POLICY "${name}"`;
  const start = source.indexOf(marker);
  const end = source.indexOf(';\n', start);
  if (start < 0 || end < start) throw new Error(`Missing policy ${name}`);
  return source.slice(start, end + 1);
}

type PolicySnapshot = {
  tablename: string;
  policyname: string | null;
  roles: string[] | null;
  cmd: string | null;
  qual_md5: string | null;
  qual: string | null;
  rls: boolean;
  force_rls: boolean;
};

type GrantSnapshot = {
  table_name: string;
  grantee: string;
  privilege_type: string;
};

type FunctionSnapshot = {
  proname: string;
  prosecdef: boolean;
  proconfig: string[] | null;
  args: string;
  authenticated: boolean;
  anon: boolean;
  service_role: boolean;
  public_execute: boolean;
};

let cluster: LocalCluster;
let owner: Client;
let utcToday = '';
let laToday = '';
let beforePolicies: PolicySnapshot[] = [];
let afterCeilingPolicies: PolicySnapshot[] = [];
let afterPolicies: PolicySnapshot[] = [];
let beforeGrants: GrantSnapshot[] = [];
let afterCeilingGrants: GrantSnapshot[] = [];
let afterGrants: GrantSnapshot[] = [];
let beforeFunctions: FunctionSnapshot[] = [];
let afterCeilingFunctions: FunctionSnapshot[] = [];
let afterFunctions: FunctionSnapshot[] = [];
let beforeSchemaUse = { authenticated: false, anon: false };
let afterCeilingSchemaUse = { authenticated: false, anon: false };
let afterSchemaUse = { authenticated: false, anon: false };
let beforeFutureModules: string[] = [];
let afterCeilingFutureModules: string[] = [];
let beforeMalformedCode: string | null = null;
let postgresVersion = '';

function splitPausedBranch(qual: string): { head: string; tail: string; arm: string } {
  const marker = "WHEN (e.status = 'paused'::text) THEN ";
  let start = -1;
  let from = 0;
  while (from < qual.length) {
    const found = qual.indexOf(marker, from);
    if (found < 0) break;
    start = found;
    from = found + marker.length;
  }
  if (start < 0) throw new Error(`Paused branch missing from ${qual}`);
  let depth = 0;
  for (let i = start + marker.length; i < qual.length; i += 1) {
    const ch = qual[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && (qual.startsWith('WHEN ', i) || qual.startsWith('ELSE ', i))) {
      return {
        head: qual.slice(0, start),
        arm: qual.slice(start, i),
        tail: qual.slice(i),
      };
    }
  }
  throw new Error('Could not isolate the paused branch');
}

async function asRole(
  role: 'authenticated' | 'anon',
  authUserId: string | null,
  text: string,
  values: unknown[] = [],
): Promise<string[]> {
  const client = await cluster.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
      authUserId ?? '',
    ]);
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query(text, values);
    await client.query('ROLLBACK');
    return result.rows.map((row) => String(row.key));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function readModules(authUserId: string): Promise<string[]> {
  const current = await asRole(
    'authenticated',
    authUserId,
    `SELECT module_key AS key FROM public.program_delivery_modules ORDER BY module_key`,
  );
  const identity = await asRole('authenticated', authUserId, `SELECT current_user AS key`);
  expect(identity).toEqual(['authenticated']);
  return current;
}

async function readTemplates(authUserId: string): Promise<string[]> {
  return asRole(
    'authenticated',
    authUserId,
    `SELECT title AS key FROM public.program_checkin_templates ORDER BY title`,
  );
}

async function readModuleDetails(authUserId: string): Promise<string[]> {
  return asRole(
    'authenticated',
    authUserId,
    `SELECT module_key || '|' || module_type || '|' || body || '|' || cta_json::text AS key
     FROM public.program_delivery_modules
     ORDER BY module_key`,
  );
}

async function readResponses(authUserId: string): Promise<string[]> {
  return asRole(
    'authenticated',
    authUserId,
    `SELECT response_payload_json->>'energy' AS key
     FROM public.program_checkin_responses
     ORDER BY id`,
  );
}

async function deniedCode(sql: string): Promise<string> {
  const client = await cluster.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [MEMBER_AUTH]);
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(sql);
    await client.query('ROLLBACK');
    return 'allowed';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    return (error as { code?: string }).code ?? 'unknown';
  } finally {
    await client.end();
  }
}

async function setEnrollment(input: {
  status: string;
  start: string;
  timezone: string;
  pause?: string | null;
  pauseJson?: string | null;
  completedAt?: string | null;
  versionId?: string;
}) {
  const metadata = input.pauseJson
    ?? (input.pause == null
      ? '{}'
      : JSON.stringify({ pause_started_at: input.pause }));
  await owner.query(
    `UPDATE public.program_enrollments
     SET status = $2,
         selected_start_date = $3::date,
         timezone = $4,
         metadata = $5::jsonb,
         completed_at = $6::timestamptz,
         program_version_id = $7
     WHERE id = $1`,
    [
      ENROLLMENT,
      input.status,
      input.start,
      input.timezone,
      metadata,
      input.completedAt ?? null,
      input.versionId ?? VERSION,
    ],
  );
}

async function snapshotPolicies(): Promise<PolicySnapshot[]> {
  const result = await owner.query(
    `SELECT c.relname AS tablename,
            c.relrowsecurity AS rls,
            c.relforcerowsecurity AS force_rls,
            p.policyname,
            p.roles,
            p.cmd,
            md5(p.qual) AS qual_md5,
            p.qual
     FROM pg_class AS c
     JOIN pg_namespace AS n ON n.oid = c.relnamespace
     LEFT JOIN pg_policies AS p
       ON p.schemaname = n.nspname AND p.tablename = c.relname
     WHERE n.nspname = 'public'
       AND c.relname IN (
         'programs',
         'program_versions',
         'program_enrollments',
         'program_delivery_modules',
         'program_checkin_templates',
         'program_checkin_responses'
       )
     ORDER BY c.relname, p.policyname`,
  );
  return result.rows as PolicySnapshot[];
}

async function snapshotGrants(): Promise<GrantSnapshot[]> {
  const result = await owner.query(
    `SELECT table_name, grantee, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN (
         'programs',
         'program_versions',
         'program_enrollments',
         'program_delivery_modules',
         'program_checkin_templates',
         'program_checkin_responses'
       )
       AND grantee IN ('authenticated', 'anon', 'service_role', 'PUBLIC')
     ORDER BY table_name, grantee, privilege_type`,
  );
  return result.rows as GrantSnapshot[];
}

async function snapshotFunctions(): Promise<FunctionSnapshot[]> {
  const result = await owner.query(
    `SELECT p.proname,
            p.prosecdef,
            p.proconfig,
            pg_get_function_identity_arguments(p.oid) AS args,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
            has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
            has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
            EXISTS (
              SELECT 1
              FROM aclexplode(p.proacl) AS acl
              WHERE acl.privilege_type = 'EXECUTE' AND acl.grantee = 0
            ) AS public_execute
     FROM pg_proc AS p
     JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'programs_private'
     ORDER BY p.proname, args`,
  );
  return result.rows as FunctionSnapshot[];
}

async function snapshotSchemaUse() {
  const result = await owner.query(
    `SELECT
       has_schema_privilege('authenticated', 'programs_private', 'USAGE') AS authenticated,
       has_schema_privilege('anon', 'programs_private', 'USAGE') AS anon`,
  );
  return result.rows[0] as { authenticated: boolean; anon: boolean };
}

beforeAll(async () => {
  cluster = await startLocalCluster();
  postgresVersion = cluster.postgresVersion;
  owner = await cluster.connect();
  await owner.query(FIXTURE_SQL);
  await owner.query(extractPolicy('Members can read enrolled available program_delivery_modules'));
  await owner.query(extractPolicy('Users can read own available program_checkin_templates'));

  const dates = await owner.query(
    `SELECT (timezone('UTC', now()))::date::text AS utc_today,
            (timezone('America/Los_Angeles', now()))::date::text AS la_today`,
  );
  utcToday = dates.rows[0].utc_today as string;
  laToday = dates.rows[0].la_today as string;

  await owner.query(
    `INSERT INTO public.people (id, email, auth_user_id) VALUES
       ($1, 'member@local.invalid', $2),
       ($3, 'stranger@local.invalid', $4)`,
    [MEMBER, MEMBER_AUTH, STRANGER, STRANGER_AUTH],
  );
  await owner.query(
    `INSERT INTO public.programs (id, slug, title, status) VALUES
       ($1, 'guided', 'Guided', 'published'),
       ($2, 'draft-program', 'Draft', 'draft'),
       ($3, 'other-program', 'Other', 'published')`,
    [PROGRAM, DRAFT_PROGRAM, OTHER_PROGRAM],
  );
  await owner.query(
    `INSERT INTO public.program_versions (id, program_id, status, duration_days) VALUES
       ($1, $2, 'published', 21),
       ($3, $2, 'draft', 21),
       ($4, $2, 'published', 21),
       ($5, $6, 'published', 21),
       ($7, $8, 'published', 21)`,
    [
      VERSION, PROGRAM,
      DRAFT_VERSION,
      OTHER_VERSION,
      STRANGER_VERSION, OTHER_PROGRAM,
      DRAFT_PROGRAM_VERSION, DRAFT_PROGRAM,
    ],
  );
  await owner.query(
    `INSERT INTO public.program_enrollments (
       id, person_id, program_id, program_version_id, status, timezone,
       selected_start_date, metadata
     ) VALUES
       ($1, $2, $3, $4, 'paused', 'UTC', ($5::date - 7), jsonb_build_object('pause_started_at', ($5::date + 14)::text)),
       ($6, $7, $8, $9, 'active', 'UTC', $5::date, '{}'::jsonb),
       ($10, $2, $11, $12, 'active', 'UTC', $5::date, '{}'::jsonb)`,
    [
      ENROLLMENT, MEMBER, PROGRAM, VERSION, utcToday,
      '50000000-0000-4000-8000-000000000502', STRANGER, OTHER_PROGRAM, STRANGER_VERSION,
      '50000000-0000-4000-8000-000000000503', DRAFT_PROGRAM, DRAFT_PROGRAM_VERSION,
    ],
  );

  const modules: Array<[string, string, string, string, string, string, number | null, number | null, string, string]> = [
    ['paused-day-0', PROGRAM, VERSION, 'guide', 'published', '{paused,pre_start,completed}', 0, 0, 'Day 0 guide', '{}'],
    ['paused-day-3', PROGRAM, VERSION, 'guide', 'published', '{paused,completed}', 3, 3, 'Reached guide', '{"label":"Read","href":"/guide/3"}'],
    ['paused-day-8', PROGRAM, VERSION, 'week', 'published', '{paused}', 8, 8, 'Day 8 week', '{}'],
    ['paused-day-21', PROGRAM, VERSION, 'practice_card', 'published', '{paused}', 21, 21, 'Day 21 practice', '{}'],
    ['paused-day-22', PROGRAM, VERSION, 'roadmap', 'published', '{paused}', 22, 22, 'Day 22 roadmap', '{}'],
    ['paused-day-32', PROGRAM, VERSION, 'capacity_support', 'published', '{paused}', 32, 32, 'Day 32 support', '{}'],
    ['paused-unbounded', PROGRAM, VERSION, 'guide', 'published', '{paused}', null, null, 'Unbounded guide', '{"label":"Open","href":"/guide"}'],
    ['interactive-checkin-unbounded', PROGRAM, VERSION, 'checkin_prompt', 'published', '{paused,completed}', null, null, 'LIVE CHECKIN BODY', '{"label":"Submit","href":"/check-in"}'],
    ['interactive-checkin-day3', PROGRAM, VERSION, 'checkin_prompt', 'published', '{paused,completed}', 3, 3, 'DAY 3 CHECKIN', '{"label":"Answer","href":"/check-in/3"}'],
    ['interactive-recommendation-day3', PROGRAM, VERSION, 'recommendation_prompt', 'published', '{paused,completed}', 3, 3, 'DAY 3 RECOMMENDATION', '{}'],
    ['guide-missing-end', PROGRAM, VERSION, 'guide', 'published', '{paused,completed}', 3, null, 'Missing end', '{}'],
    ['guide-inverted', PROGRAM, VERSION, 'prep', 'published', '{paused,completed}', 5, 2, 'Inverted range', '{}'],
    ['active-unbounded', PROGRAM, VERSION, 'guide', 'published', '{active}', null, null, 'Active unbounded', '{}'],
    ['prestart-unbounded', PROGRAM, VERSION, 'guide', 'published', '{pre_start}', null, null, 'Pre-start unbounded', '{}'],
    ['active-day-1', PROGRAM, VERSION, 'guide', 'published', '{active}', 1, 1, 'Active day 1', '{}'],
    ['active-day-8', PROGRAM, VERSION, 'guide', 'published', '{active}', 8, 8, 'Active day 8', '{}'],
    ['active-day-22', PROGRAM, VERSION, 'guide', 'published', '{active}', 22, 22, 'Active day 22', '{}'],
    ['draft-day-1', PROGRAM, VERSION, 'guide', 'draft', '{paused,active}', 1, 1, 'Draft', '{}'],
    ['other-version-day-1', PROGRAM, OTHER_VERSION, 'guide', 'published', '{paused,active}', 1, 1, 'Other version', '{}'],
    ['draft-program-day-1', DRAFT_PROGRAM, DRAFT_PROGRAM_VERSION, 'guide', 'published', '{active,paused}', 1, 1, 'Draft program', '{}'],
    ['stranger-day-1', OTHER_PROGRAM, STRANGER_VERSION, 'guide', 'published', '{active}', 1, 1, 'Stranger', '{}'],
  ];
  for (const [key, programId, versionId, moduleType, status, visibility, dayStart, dayEnd, body, cta] of modules) {
    await owner.query(
      `INSERT INTO public.program_delivery_modules (
         id, program_id, program_version_id, module_key, module_type, status,
         status_visibility, day_start, day_end, body, cta_json
       ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10::jsonb)`,
      [programId, versionId, key, moduleType, status, visibility, dayStart, dayEnd, body, cta],
    );
  }

  const templates: Array<[string, string, string, number, string, string]> = [
    ['checkin-3', VERSION, 'published', 3, 'How do you feel on day 3?', '[{"id":"q3","kind":"text"}]'],
    ['checkin-8', VERSION, 'published', 8, 'How do you feel on day 8?', '[{"id":"q8","kind":"text"}]'],
    ['checkin-21', VERSION, 'published', 21, 'Day 21 question', '[{"id":"q21"}]'],
    ['checkin-22', VERSION, 'published', 22, 'Future question', '[{"id":"q22"}]'],
    ['checkin-draft', VERSION, 'draft', 1, 'Draft question', '[]'],
    ['checkin-other-version', OTHER_VERSION, 'published', 1, 'Other version question', '[]'],
    ['checkin-stranger', STRANGER_VERSION, 'published', 1, 'Stranger question', '[]'],
  ];
  for (const [title, versionId, status, day, prompt, questions] of templates) {
    await owner.query(
      `INSERT INTO public.program_checkin_templates (
         id, program_version_id, title, status, checkin_day, prompt_md, questions_json
       ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb)`,
      [versionId, title, status, day, prompt, questions],
    );
  }
  await owner.query(
    `INSERT INTO public.program_checkin_responses (
       id, enrollment_id, response_status, response_payload_json
     ) VALUES ($1, $2, 'completed', '{"energy":4}'::jsonb)`,
    ['60000000-0000-4000-8000-000000000601', ENROLLMENT],
  );

  beforePolicies = await snapshotPolicies();
  beforeGrants = await snapshotGrants();
  beforeFunctions = await snapshotFunctions();
  beforeSchemaUse = await snapshotSchemaUse();
  beforeFutureModules = await readModules(MEMBER_AUTH);
  try {
    await setEnrollment({
      status: 'paused',
      start: utcToday,
      timezone: 'UTC',
      pause: 'not-a-date',
    });
    await readModules(MEMBER_AUTH);
    beforeMalformedCode = null;
  } catch (error) {
    beforeMalformedCode = (error as { code?: string }).code ?? 'unknown';
  }
  await setEnrollment({
    status: 'paused',
    start: utcToday,
    timezone: 'UTC',
    pause: utcToday,
  });

  await applySqlFile(owner, MIGRATION);
  afterCeilingPolicies = await snapshotPolicies();
  afterCeilingGrants = await snapshotGrants();
  afterCeilingFunctions = await snapshotFunctions();
  afterCeilingSchemaUse = await snapshotSchemaUse();
  const futurePause = await owner.query(
    `SELECT ($1::date - 7)::text AS start, ($1::date + 14)::text AS pause`,
    [utcToday],
  );
  await setEnrollment({
    status: 'paused',
    start: futurePause.rows[0].start as string,
    timezone: 'UTC',
    pause: futurePause.rows[0].pause as string,
  });
  afterCeilingFutureModules = await readModules(MEMBER_AUTH);

  await applySqlFile(owner, BOUNDARY_MIGRATION);
  afterPolicies = await snapshotPolicies();
  afterGrants = await snapshotGrants();
  afterFunctions = await snapshotFunctions();
  afterSchemaUse = await snapshotSchemaUse();
});

afterAll(async () => {
  await owner?.end().catch(() => undefined);
  await cluster?.destroy();
});

describe('paused historical day authorization', () => {
  test('runs on PostgreSQL 17 and reproduces the reviewed production fingerprints', () => {
    expect(postgresVersion).toContain('17.');
    const modules = beforePolicies.find((row) => row.policyname === 'Members can read enrolled available program_delivery_modules');
    const templates = beforePolicies.find((row) => row.policyname === 'Users can read own available program_checkin_templates');
    expect(modules?.qual_md5).toBe(PRODUCTION_MODULES_MD5);
    expect(templates?.qual_md5).toBe(PRODUCTION_TEMPLATES_MD5);
    expect(beforeFutureModules).toEqual(expect.arrayContaining(['paused-day-22', 'paused-unbounded']));
    expect(beforeMalformedCode).toBe('22007');
  });

  test('changes only the paused arms and preserves grants, RLS, and neighboring policies', () => {
    expect(afterCeilingGrants).toEqual(beforeGrants);
    expect(afterCeilingSchemaUse).toEqual(beforeSchemaUse);
    expect(afterCeilingSchemaUse).toEqual({ authenticated: true, anon: false });
    const ceilingModules = afterCeilingPolicies.find((row) => row.policyname === 'Members can read enrolled available program_delivery_modules');
    const ceilingTemplates = afterCeilingPolicies.find((row) => row.policyname === 'Users can read own available program_checkin_templates');
    expect(ceilingModules?.qual_md5).toBe(CEILING_MODULES_MD5);
    expect(ceilingTemplates?.qual_md5).toBe(CEILING_TEMPLATES_MD5);
    expect(afterCeilingFutureModules).toEqual([
      'interactive-checkin-unbounded',
      'paused-day-0',
      'paused-unbounded',
    ]);

    const relevant = (rows: PolicySnapshot[]) => rows.filter((row) => row.policyname);
    for (const before of relevant(beforePolicies)) {
      const after = relevant(afterCeilingPolicies).find((row) => row.policyname === before.policyname);
      expect(after?.roles).toEqual(before.roles);
      expect(after?.cmd).toBe(before.cmd);
      expect(after?.rls).toBe(true);
      expect(after?.force_rls).toBe(before.force_rls);
      if (
        before.policyname === 'Members can read enrolled available program_delivery_modules'
        || before.policyname === 'Users can read own available program_checkin_templates'
      ) {
        const previous = splitPausedBranch(before.qual ?? '');
        const next = splitPausedBranch(after?.qual ?? '');
        expect(next.head).toBe(previous.head);
        expect(next.tail).toBe(previous.tail);
        expect(previous.arm).toContain('timestamp with time zone');
        expect(next.arm).toContain('programs_private.paused_historical_day');
        expect(next.arm).not.toContain('timestamp with time zone');
        expect(after?.qual_md5).not.toBe(before.qual_md5);
      } else {
        expect(after?.qual_md5).toBe(before.qual_md5);
      }
    }

    const helper = afterCeilingFunctions.find((row) => row.proname === 'paused_historical_day');
    expect(helper).toMatchObject({
      prosecdef: false,
      args: 'selected_start_date date, time_zone text, pause_started_at text, paused_days_total integer, duration_days integer',
      authenticated: true,
      anon: false,
      service_role: false,
      public_execute: false,
    });
    expect(helper?.proconfig?.join(' ')).toContain('search_path=');
    const personIdsBefore = beforeFunctions.find((row) => row.proname === 'current_person_ids');
    const personIdsAfter = afterCeilingFunctions.find((row) => row.proname === 'current_person_ids');
    expect(personIdsAfter).toEqual(personIdsBefore);
    expect(personIdsAfter).toMatchObject({
      prosecdef: true,
      authenticated: true,
      anon: false,
      public_execute: false,
    });
  });

  test('hides future modules and check-in templates, including a Los Angeles date boundary', async () => {
    await setEnrollment({
      status: 'paused',
      start: utcToday,
      timezone: 'UTC',
      pause: utcToday,
    });
    const startForDay22 = await owner.query(
      `SELECT ($1::date - 7)::text AS start, ($1::date + 14)::text AS pause`,
      [utcToday],
    );
    await setEnrollment({
      status: 'paused',
      start: startForDay22.rows[0].start as string,
      timezone: 'UTC',
      pause: startForDay22.rows[0].pause as string,
    });
    expect(await readModules(MEMBER_AUTH)).toEqual(['paused-day-0']);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);

    const laTomorrow = await owner.query(`SELECT ($1::date + 1)::text AS pause`, [laToday]);
    await setEnrollment({
      status: 'paused',
      start: laToday,
      timezone: 'America/Los_Angeles',
      pause: laTomorrow.rows[0].pause as string,
    });
    await owner.query(
      `UPDATE public.program_enrollments
       SET selected_start_date = ($1::date - 7)
       WHERE id = $2`,
      [laToday, ENROLLMENT],
    );
    expect(await readModules(MEMBER_AUTH)).toEqual(['paused-day-0']);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);

    await setEnrollment({
      status: 'paused',
      start: laToday,
      timezone: 'America/Los_Angeles',
      pause: laToday,
    });
    await owner.query(
      `UPDATE public.program_enrollments
       SET selected_start_date = ($1::date - 7)
       WHERE id = $2`,
      [laToday, ENROLLMENT],
    );
    expect(await readModules(MEMBER_AUTH)).toEqual([
      'paused-day-0',
      'paused-day-3',
      'paused-day-8',
    ]);
    expect(await readModuleDetails(MEMBER_AUTH)).toEqual(expect.arrayContaining([
      'paused-day-3|guide|Reached guide|{"href": "/guide/3", "label": "Read"}',
    ]));
    expect(await readModuleDetails(MEMBER_AUTH)).not.toEqual(expect.arrayContaining([
      expect.stringContaining('LIVE CHECKIN BODY'),
      expect.stringContaining('DAY 3 CHECKIN'),
    ]));
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);
    expect(await readResponses(MEMBER_AUTH)).toEqual(['4']);
  });

  test('fails closed on malformed pause values without a query exception', async () => {
    const malformed = [
      '{}',
      JSON.stringify({ pause_started_at: null }),
      JSON.stringify({ pause_started_at: '' }),
      JSON.stringify({ pause_started_at: 'not-a-date' }),
      JSON.stringify({ pause_started_at: '2026-02-31' }),
      JSON.stringify({ pause_started_at: '2026-05-22T12:00:00.000Z' }),
      JSON.stringify({ pause_started_at: 20260522 }),
    ];
    for (const metadata of malformed) {
      await setEnrollment({
        status: 'paused',
        start: utcToday,
        timezone: 'UTC',
        pauseJson: metadata,
      });
      await owner.query(
        `UPDATE public.program_enrollments
         SET selected_start_date = ($1::date - 7)
         WHERE id = $2`,
        [utcToday, ENROLLMENT],
      );
      await expect(readModules(MEMBER_AUTH)).resolves.toEqual(['paused-day-0']);
      await expect(readTemplates(MEMBER_AUTH)).resolves.toEqual([]);
    }
  });

  test('keeps a trustworthy historical pause inside today and the published duration', async () => {
    const dates = await owner.query(
      `SELECT ($1::date - 10)::text AS start, (($1::date - 10) + 2)::text AS pause`,
      [utcToday],
    );
    await setEnrollment({
      status: 'paused',
      start: dates.rows[0].start as string,
      timezone: 'UTC',
      pause: dates.rows[0].pause as string,
    });
    expect(await readModules(MEMBER_AUTH)).toEqual([
      'paused-day-0',
      'paused-day-3',
    ]);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);

    const capped = await owner.query(
      `SELECT ($1::date - 40)::text AS start, ($1::date - 10)::text AS pause`,
      [utcToday],
    );
    await setEnrollment({
      status: 'paused',
      start: capped.rows[0].start as string,
      timezone: 'UTC',
      pause: capped.rows[0].pause as string,
    });
    expect(await readModules(MEMBER_AUTH)).toEqual([
      'paused-day-0',
      'paused-day-21',
      'paused-day-3',
      'paused-day-8',
    ]);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);
    expect(await readModules(MEMBER_AUTH)).not.toEqual(expect.arrayContaining(['paused-day-22', 'paused-day-32']));
  });

  test('preserves active, pre-start, completed, cancelled, foreign, draft, and wrong-version boundaries', async () => {
    await setEnrollment({
      status: 'active',
      start: utcToday,
      timezone: 'UTC',
    });
    await owner.query(
      `UPDATE public.program_enrollments SET selected_start_date = ($1::date - 7) WHERE id = $2`,
      [utcToday, ENROLLMENT],
    );
    expect(await readModules(MEMBER_AUTH)).toEqual(['active-day-1', 'active-day-8', 'active-unbounded']);
    expect(await readTemplates(MEMBER_AUTH)).toEqual(['checkin-3', 'checkin-8']);

    await setEnrollment({
      status: 'pre_start',
      start: utcToday,
      timezone: 'UTC',
    });
    await owner.query(
      `UPDATE public.program_enrollments SET selected_start_date = ($1::date + 3) WHERE id = $2`,
      [utcToday, ENROLLMENT],
    );
    expect(await readModules(MEMBER_AUTH)).toEqual(['paused-day-0', 'prestart-unbounded']);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);

    const completed = await owner.query(
      `SELECT (($1::date - 10) + 2)::text || 'T18:00:00Z' AS completed_at,
              ($1::date - 10)::text AS start`,
      [utcToday],
    );
    await setEnrollment({
      status: 'completed',
      start: completed.rows[0].start as string,
      timezone: 'UTC',
      completedAt: completed.rows[0].completed_at as string,
    });
    expect(await readModules(MEMBER_AUTH)).toEqual(['paused-day-0', 'paused-day-3']);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);

    await setEnrollment({
      status: 'active',
      start: completed.rows[0].start as string,
      timezone: 'UTC',
      completedAt: completed.rows[0].completed_at as string,
    });
    expect(await readModules(MEMBER_AUTH)).toEqual(['paused-day-0', 'paused-day-3']);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);
    expect(await readResponses(MEMBER_AUTH)).toEqual(['4']);

    await setEnrollment({
      status: 'cancelled',
      start: utcToday,
      timezone: 'UTC',
    });
    expect(await readModules(MEMBER_AUTH)).toEqual([]);
    expect(await readTemplates(MEMBER_AUTH)).toEqual([]);

    await setEnrollment({
      status: 'active',
      start: utcToday,
      timezone: 'UTC',
      versionId: DRAFT_VERSION,
    });
    expect(await readModules(MEMBER_AUTH)).toEqual([]);

    await setEnrollment({
      status: 'active',
      start: utcToday,
      timezone: 'UTC',
      versionId: VERSION,
    });
    expect(await readModules(STRANGER_AUTH)).toEqual(['stranger-day-1']);
    expect(await readTemplates(STRANGER_AUTH)).toEqual(['checkin-stranger']);
    expect(await readResponses(STRANGER_AUTH)).toEqual([]);
    expect(await readModules(MEMBER_AUTH)).not.toContain('draft-day-1');
    expect(await readModules(MEMBER_AUTH)).not.toContain('other-version-day-1');
    expect(await readModules(MEMBER_AUTH)).not.toContain('draft-program-day-1');
    expect(await readModules(MEMBER_AUTH)).not.toContain('stranger-day-1');
    expect(await deniedCode(
      `INSERT INTO public.program_checkin_templates (
         id, program_version_id, title, status, checkin_day, questions_json
       ) VALUES (gen_random_uuid(), '${VERSION}', 'injected', 'published', 1, '[]'::jsonb)`,
    )).toBe('42501');
    expect(await deniedCode(
      `UPDATE public.program_delivery_modules SET body = 'rewritten' WHERE module_key = 'paused-day-3'`,
    )).toBe('42501');
    expect(await deniedCode(
      `INSERT INTO public.program_checkin_responses (
         id, enrollment_id, response_status, response_payload_json
       ) VALUES (gen_random_uuid(), '${ENROLLMENT}', 'completed', '{}'::jsonb)`,
    )).toBe('42501');
  });

  test('keeps grants and non-historical policies while replacing the historical predicate', () => {
    expect(afterGrants).toEqual(beforeGrants);
    expect(afterFunctions).toEqual(afterCeilingFunctions);
    expect(afterSchemaUse).toEqual(afterCeilingSchemaUse);

    const relevant = (rows: PolicySnapshot[]) => rows.filter((row) => row.policyname);
    for (const before of relevant(afterCeilingPolicies)) {
      const after = relevant(afterPolicies).find((row) => row.policyname === before.policyname);
      expect(after?.roles).toEqual(before.roles);
      expect(after?.cmd).toBe(before.cmd);
      expect(after?.rls).toBe(true);
      expect(after?.force_rls).toBe(before.force_rls);
      if (
        before.policyname === 'Members can read enrolled available program_delivery_modules'
        || before.policyname === 'Users can read own available program_checkin_templates'
      ) {
        expect(after?.qual_md5).not.toBe(before.qual_md5);
      } else {
        expect(after?.qual_md5).toBe(before.qual_md5);
      }
    }

    const modules = afterPolicies.find((row) => row.policyname === 'Members can read enrolled available program_delivery_modules');
    const templates = afterPolicies.find((row) => row.policyname === 'Users can read own available program_checkin_templates');
    expect(modules?.qual).toContain('practice_card');
    expect(modules?.qual).toContain('capacity_support');
    expect(modules?.qual).toContain('day_end IS NOT NULL');
    expect(modules?.qual).not.toContain('checkin_prompt');
    expect(modules?.qual).not.toContain('recommendation_prompt');
    expect(templates?.qual?.toLowerCase()).toContain('false');
  });

  test('uses the enrollment zone for the same pause date and denies anon execution', async () => {
    const ahead = await owner.query(
      `SELECT name, (timezone(name, now()))::date::text AS today
       FROM pg_timezone_names
       WHERE (timezone(name, now()))::date > (timezone('America/Los_Angeles', now()))::date
       ORDER BY (timezone(name, now()))::date, name
       LIMIT 1`,
    );
    expect(ahead.rowCount).toBe(1);
    const zone = ahead.rows[0].name as string;
    const today = ahead.rows[0].today as string;
    const laCeiling = await asRole(
      'authenticated',
      MEMBER_AUTH,
      `SELECT programs_private.paused_historical_day($1::date, 'America/Los_Angeles'::text, $2::text, 0, 21) AS key`,
      [today, today],
    );
    const zoneCeiling = await asRole(
      'authenticated',
      MEMBER_AUTH,
      `SELECT programs_private.paused_historical_day($1::date, $2::text, $1::text, 0, 21) AS key`,
      [today, zone],
    );
    expect(laCeiling).toEqual(['0']);
    expect(zoneCeiling).toEqual(['1']);

    const invalidZone = await asRole(
      'authenticated',
      MEMBER_AUTH,
      `SELECT programs_private.paused_historical_day($1::date, 'Not/AZone'::text, $1::text, 0, 21) AS key`,
      [utcToday],
    );
    expect(invalidZone).toEqual(['1']);

    const client = await cluster.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE anon');
      await expect(client.query(
        `SELECT programs_private.paused_historical_day($1::date, 'UTC'::text, $1::text, 0, 21)`,
        [utcToday],
      )).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      await client.end();
    }
  });
});
