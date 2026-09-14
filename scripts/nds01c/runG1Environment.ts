/**
 * NDS-01C G1: run-owned local PostgreSQL + Auth + PostgREST + Next + browser proof.
 *
 * Synthetic credentials only. No inherited private env files. Loopback HTTP
 * only; Postgres remains unix-socket with no TCP listener.
 */

import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chromium } from 'playwright';

import { applySqlFile, BASELINE_SCHEMA, EXPAND_MIGRATIONS } from '../../test/localdb/harness';
import { startLocalCluster, type LocalCluster } from '../../test/localdb/localPostgres';
import { resolveEmbeddedPostgresBinDir } from '../../test/localdb/embeddedPostgresBinaries';
import { runRemainingG3Verification } from './remainingG3Verification';

const REPO_ROOT = process.cwd();
const RUN_ROOT = process.env.NDS01C_RUN_ROOT || path.resolve(REPO_ROOT, '..');
const APP_ROOT = process.env.NDS01C_APP_ROOT
  ? path.resolve(process.env.NDS01C_APP_ROOT)
  : REPO_ROOT;
const TOOLS_BIN = process.env.NDS01C_TOOLS_BIN || path.join(RUN_ROOT, 'tools', 'bin');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'nds', 'evidence', 'nds01c');
const APP_SCHEMA = path.join(REPO_ROOT, 'scripts', 'nds01c', 'g1AppSchema.sql');
const BASELINE_MODE = process.env.NDS01C_BASELINE === '1';
const PLAYWRIGHT_BROWSERS_DIR =
  process.env.NDS01C_PLAYWRIGHT_BROWSERS || path.join(RUN_ROOT, 'tools', 'playwright-browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_BROWSERS_DIR;

const AUTH_PORT = 9999;
const POSTGREST_PORT = 3001;
const GATEWAY_PORT = 54321;
const NEXT_PORT = Number(process.env.NDS01C_NEXT_PORT || 3000);
const DENY_PROXY_PORT = 18080;

function mintHs256Jwt(secret: string, claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function allowlistEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '',
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    NODE_ENV: 'development',
    ...extra,
  };
}

function unixPgUrl(user: string, password: string, database: string, socketDirectory: string): string {
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@/${encodeURIComponent(
    database,
  )}?host=${encodeURIComponent(socketDirectory)}`;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status < 500) return;
      last = `status ${res.status}`;
    } catch (error) {
      last = (error as Error).message;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}: ${last}`);
}

function startGateway(): http.Server {
  const server = http.createServer((req, res) => {
    const origin = `http://127.0.0.1:${NEXT_PORT}`;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers':
          'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      });
      res.end();
      return;
    }

    const url = req.url || '/';
    let port = POSTGREST_PORT;
    let stripped = url;
    if (url === '/auth' || url.startsWith('/auth/')) {
      port = AUTH_PORT;
      stripped = url.replace(/^\/auth\/v1/, '') || '/';
      if (stripped === '/auth') stripped = '/';
    } else if (url.startsWith('/rest/v1')) {
      port = POSTGREST_PORT;
      stripped = url.replace(/^\/rest\/v1/, '') || '/';
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'local gateway: unknown path' }));
      return;
    }

    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    const upstream = http.request(
      { hostname: '127.0.0.1', port, path: stripped, method: req.method, headers },
      (up) => {
        const outHeaders = {
          ...up.headers,
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
        };
        res.writeHead(up.statusCode || 502, outHeaders);
        up.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'gateway upstream', detail: error.message }));
    });
    req.pipe(upstream);
  });
  server.listen(GATEWAY_PORT, '127.0.0.1');
  return server;
}

type NdsApiBody = {
  nds?: {
    state?: string;
    nds_score_100?: number;
    source_revision?: number;
    computed_as_of?: string;
    versions?: Record<string, string>;
    coverage?: Record<string, unknown>;
    readings?: unknown;
    person_id?: string;
    date_local?: string;
    subscores_10?: unknown;
  };
  _meta?: {
    publish_reason?: string | null;
    invalidation_reason?: string | null;
  };
};

type DailyNdsMaterialization = {
  id: string;
  source_revision: string | number | null;
  computation_generation: string | number | null;
  dependency_fingerprint: string | null;
  computed_as_of: string | Date | null;
  updated_at: string | null;
  nds_score_100: string | number | null;
  response_state: string | null;
  nds_version: string | null;
  classifier_version: string | null;
  normalizer_version: string | null;
  day_policy_version: string | null;
  added_sugar_coverage: string | null;
  scored_entry_count: string | number | null;
  readings_md5: string | null;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

function ndsComparableIdentity(json: NdsApiBody) {
  const id = ndsPublicIdentity(json);
  return canonicalize({
    state: id.state,
    nds_score_100: id.nds_score_100,
    source_revision: id.source_revision,
    versions: id.versions,
    coverage: id.coverage,
    readings: id.readings,
    person_id: id.person_id,
    date_local: id.date_local,
    subscores_10: id.subscores_10,
  });
}

function ndsPublicIdentity(json: NdsApiBody) {
  return {
    state: json.nds?.state ?? null,
    nds_score_100: json.nds?.nds_score_100 ?? null,
    source_revision: json.nds?.source_revision ?? null,
    computed_as_of: json.nds?.computed_as_of ?? null,
    versions: json.nds?.versions ?? null,
    coverage: json.nds?.coverage ?? null,
    readings: json.nds?.readings ?? null,
    person_id: json.nds?.person_id ?? null,
    date_local: json.nds?.date_local ?? null,
    subscores_10: json.nds?.subscores_10 ?? null,
    publish_reason: json._meta?.publish_reason ?? null,
    invalidation_reason: json._meta?.invalidation_reason ?? null,
  };
}

function asIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? date.toISOString() : String(value);
}

function materializationIdentity(row: DailyNdsMaterialization | null) {
  if (!row) return null;
  return {
    id: row.id,
    source_revision: row.source_revision === null ? null : Number(row.source_revision),
    computation_generation:
      row.computation_generation === null ? null : Number(row.computation_generation),
    dependency_fingerprint: row.dependency_fingerprint,
    computed_as_of: asIso(row.computed_as_of),
    nds_score_100: row.nds_score_100 === null ? null : Number(row.nds_score_100),
    response_state: row.response_state,
    nds_version: row.nds_version,
    classifier_version: row.classifier_version,
    normalizer_version: row.normalizer_version,
    day_policy_version: row.day_policy_version,
    added_sugar_coverage: row.added_sugar_coverage,
    scored_entry_count: row.scored_entry_count === null ? null : Number(row.scored_entry_count),
    readings_md5: row.readings_md5,
  };
}

async function readDailyNdsMaterialization(
  cluster: LocalCluster,
  personId: string,
  dateLocal: string,
): Promise<DailyNdsMaterialization | null> {
  const client = await cluster.connect();
  try {
    const result = await client.query<DailyNdsMaterialization>(
      `SELECT
         id::text AS id,
         source_revision,
         computation_generation,
         dependency_fingerprint,
         computed_as_of,
         updated_at,
         nds_score_100,
         response_state,
         nds_version,
         classifier_version,
         normalizer_version,
         day_policy_version,
         added_sugar_coverage,
         scored_entry_count,
         md5(COALESCE(readings::text, '')) AS readings_md5
       FROM public.daily_nds
       WHERE person_id = $1 AND date_local = $2`,
      [personId, dateLocal],
    );
    return result.rows[0] ?? null;
  } finally {
    await client.end();
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function gitShaAt(dir: string): string {
  try {
    return require('child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' })
      .trim();
  } catch {
    const marker = path.join(dir, 'SOURCE_COMMIT.txt');
    if (fs.existsSync(marker)) return fs.readFileSync(marker, 'utf8').trim();
    return 'unknown';
  }
}

function startDenyProxy(): http.Server {
  const server = http.createServer((req, res) => {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('NDS01C deny-proxy: non-loopback HTTP blocked\n');
  });
  server.on('connect', (req, socket) => {
    const host = (req.url || '').split(':')[0];
    if (host === '127.0.0.1') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\nloopback CONNECT is not provided\n');
      socket.destroy();
      return;
    }
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\nNDS01C deny-proxy: nonlocal CONNECT blocked\n');
    socket.destroy();
  });
  server.listen(DENY_PROXY_PORT, '127.0.0.1');
  return server;
}

async function main(): Promise<void> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const anonKey = mintHs256Jwt(jwtSecret, {
    iss: 'supabase-nds01c',
    role: 'anon',
    aud: 'authenticated',
    iat: now,
    exp: now + 60 * 60 * 24 * 365,
  });
  const serviceRoleKey = mintHs256Jwt(jwtSecret, {
    iss: 'supabase-nds01c',
    role: 'service_role',
    aud: 'authenticated',
    iat: now,
    exp: now + 60 * 60 * 24 * 365,
  });
  const syntheticEmail = 'nds01c-g1@local.invalid';
  const syntheticPassword = `Nd1c-${crypto.randomBytes(12).toString('hex')}!aA`;
  const foodId = crypto.randomUUID();

  const cluster: LocalCluster = await startLocalCluster();
  const authenticatorPassword = crypto.randomBytes(24).toString('hex');
  const owner = await cluster.connect();
  try {
    await owner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
          CREATE ROLE authenticator LOGIN NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
          CREATE ROLE postgres SUPERUSER NOLOGIN;
        END IF;
      END $$;
    `);
    await owner.query(`ALTER ROLE authenticator WITH PASSWORD '${authenticatorPassword}'`);
    await owner.query('GRANT anon TO authenticator');
    await owner.query('GRANT authenticated TO authenticator');
    await owner.query('GRANT service_role TO authenticator');
    await owner.query('CREATE SCHEMA IF NOT EXISTS auth');
    await owner.query('GRANT USAGE ON SCHEMA auth TO PUBLIC');
  } finally {
    await owner.end();
  }

  const dbUrlOwner = unixPgUrl(
    cluster.descriptor.user,
    cluster.ownerPassword,
    cluster.descriptor.database,
    cluster.socketDirectory,
  );
  const dbUrlAuthenticator = unixPgUrl(
    'authenticator',
    authenticatorPassword,
    cluster.descriptor.database,
    cluster.socketDirectory,
  );

  const gotrueEnv = allowlistEnv({
    GOTRUE_API_HOST: '127.0.0.1',
    PORT: String(AUTH_PORT),
    API_EXTERNAL_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
    GOTRUE_SITE_URL: `http://127.0.0.1:${NEXT_PORT}`,
    GOTRUE_URI_ALLOW_LIST: `http://127.0.0.1:${NEXT_PORT}`,
    GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_JWT_SECRET: jwtSecret,
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: dbUrlOwner,
    DATABASE_URL: dbUrlOwner,
    GOTRUE_DB_NAMESPACE: 'auth',
    GOTRUE_API_PORT: String(AUTH_PORT),
    GOTRUE_SMTP_HOST: '127.0.0.1',
    GOTRUE_SMTP_PORT: '1',
    GOTRUE_SMTP_ADMIN_EMAIL: 'nds01c@local.invalid',
    GOTRUE_SMTP_SENDER_NAME: 'NDS01C',
    GOTRUE_EXTERNAL_GOOGLE_ENABLED: 'false',
    GOTRUE_EXTERNAL_APPLE_ENABLED: 'false',
  });

  const authBin = path.join(TOOLS_BIN, 'auth');
  const migrate = spawn(authBin, ['migrate'], {
    cwd: TOOLS_BIN,
    env: gotrueEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const migrateOut: Buffer[] = [];
  migrate.stdout?.on('data', (d) => migrateOut.push(d));
  migrate.stderr?.on('data', (d) => migrateOut.push(d));
  const migrateCode: number = await new Promise((resolve) => migrate.on('close', resolve));
  if (migrateCode !== 0) {
    throw new Error(`GoTrue migrate failed: ${Buffer.concat(migrateOut).toString()}`);
  }

  const readyOwner = await cluster.connect();
  try {
    await readyOwner.query(
      `ALTER ROLE "${cluster.descriptor.user}" SET search_path TO auth, public`,
    );
    await applySqlFile(readyOwner, BASELINE_MODE ? path.join(APP_ROOT, 'test', 'localdb', 'baselineSchema.sql') : BASELINE_SCHEMA);
    await applySqlFile(readyOwner, APP_SCHEMA);
    const expandMigrations = BASELINE_MODE
      ? [
          path.join(APP_ROOT, 'scripts', 'sql', 'ndsIntegrityV1_01_dayRevisions.sql'),
          path.join(APP_ROOT, 'scripts', 'sql', 'ndsIntegrityV1_02_resolverAndWorker.sql'),
          path.join(APP_ROOT, 'scripts', 'sql', 'ndsIntegrityV1_05_identityAndGrants.sql'),
        ]
      : EXPAND_MIGRATIONS;
    for (const file of expandMigrations) await applySqlFile(readyOwner, file);
    await readyOwner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role');
    await readyOwner.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role');
    await readyOwner.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role');
  } finally {
    await readyOwner.end();
  }

  const gotrueLog = fs.openSync(path.join(cluster.descriptor.dataDirectory, '..', 'gotrue.log'), 'a');
  const gotrue: ChildProcess = spawn(authBin, ['serve'], {
    cwd: TOOLS_BIN,
    env: gotrueEnv,
    stdio: ['ignore', gotrueLog, gotrueLog],
  });

  const pgLib = path.join(path.dirname(resolveEmbeddedPostgresBinDir()), 'lib');
  const postgrestConf = path.join(path.dirname(cluster.descriptor.dataDirectory), 'postgrest.conf');
  fs.writeFileSync(
    postgrestConf,
    [
      `db-uri = "${dbUrlAuthenticator}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      'db-config = false',
      `jwt-secret = "${jwtSecret}"`,
      'jwt-secret-is-base64 = false',
      'server-host = "127.0.0.1"',
      `server-port = ${POSTGREST_PORT}`,
    ].join('\n'),
    { mode: 0o600 },
  );

  const postgrestLog = fs.openSync(path.join(cluster.descriptor.dataDirectory, '..', 'postgrest.log'), 'a');
  const postgrest: ChildProcess = spawn(path.join(TOOLS_BIN, 'postgrest'), [postgrestConf], {
    env: allowlistEnv({ DYLD_LIBRARY_PATH: pgLib }),
    stdio: ['ignore', postgrestLog, postgrestLog],
  });

  const gateway = startGateway();
  const denyProxy = startDenyProxy();

  await waitForHttp(`http://127.0.0.1:${AUTH_PORT}/health`, 20_000).catch(() =>
    waitForHttp(`http://127.0.0.1:${AUTH_PORT}/`, 10_000),
  );
  await waitForHttp(`http://127.0.0.1:${POSTGREST_PORT}/`, 20_000);

  const signup = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: syntheticEmail, password: syntheticPassword }),
  });
  const signupJson = (await signup.json()) as { id?: string; user?: { id?: string }; msg?: string };
  if (!signup.ok) {
    throw new Error(`Auth signup failed ${signup.status}: ${JSON.stringify(signupJson)}`);
  }
  const authUserId = signupJson.user?.id || signupJson.id;
  if (!authUserId) throw new Error(`Auth signup returned no user id: ${JSON.stringify(signupJson)}`);

  const seed = await cluster.connect();
  let personId = '';
  try {
    const inserted = await seed.query<{ id: string }>(
      `INSERT INTO public.people (email, first_name, status, auth_user_id, metadata)
       VALUES ($1, 'G1', 'active_user', $2, $3::jsonb)
       ON CONFLICT (email) DO UPDATE
         SET auth_user_id = EXCLUDED.auth_user_id,
             metadata = EXCLUDED.metadata,
             status = 'active_user'
       RETURNING id`,
      [
        syntheticEmail,
        authUserId,
        JSON.stringify({ onboarding_completed_at: new Date().toISOString() }),
      ],
    );
    personId = inserted.rows[0].id;
    await seed.query(
      `INSERT INTO public.profiles (id, role) VALUES ($1, 'user')
       ON CONFLICT (id) DO NOTHING`,
      [authUserId],
    );
    await seed.query(
      `INSERT INTO public.person_entitlements (person_id, entitlement_key, is_active, source)
       VALUES ($1, 'journal', true, 'manual')`,
      [personId],
    );
    await seed.query(
      `INSERT INTO public.food_objects (
         id, canonical_name, category, tags, calories, protein_g, fiber_g, sugar_g,
         potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg, folate_ug,
         vitamin_a_ug_rae, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, sodium_mg,
         processing_class, nutrients_extended, source_dataset, serving_size_g
       ) VALUES (
         $1, 'NDS01C salmon quinoa bowl', 'seafood', ARRAY['salmon','quinoa'],
         620, 42, 9, 99,
         900, 120, 3, 120, 3, 150, 90, 20, 12, 4, 200,
         'whole', '{"omega3_g":2.1,"omega6_g":1.4}'::jsonb, 'nds01c-g2-catalog', 400
       )`,
      [foodId],
    );
  } finally {
    await seed.end();
  }

  const envLocal = [
    `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    `STRIPE_SECRET_KEY=sk_test_nds01c_synthetic_local_only_not_stripe`,
    `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:${NEXT_PORT}`,
    `SITE_URL=http://127.0.0.1:${NEXT_PORT}`,
    `ENABLE_N8N_WEBHOOK=false`,
    `PLANS_AI_PROVIDER=stub`,
    `GROCERY_PRICE_PROVIDER_ENABLED=false`,
  ].join('\n');
  fs.writeFileSync(path.join(APP_ROOT, '.env.local'), envLocal, { mode: 0o600 });

  const nextLog = fs.openSync(path.join(cluster.descriptor.dataDirectory, '..', 'next.log'), 'a');
  const nextProc = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'next'), ['dev', '-H', '127.0.0.1', '-p', String(NEXT_PORT)], {
    cwd: APP_ROOT,
    env: allowlistEnv({
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      STRIPE_SECRET_KEY: 'sk_test_nds01c_synthetic_local_only_not_stripe',
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${NEXT_PORT}`,
      SITE_URL: `http://127.0.0.1:${NEXT_PORT}`,
      ENABLE_N8N_WEBHOOK: 'false',
      PLANS_AI_PROVIDER: 'stub',
      GROCERY_PRICE_PROVIDER_ENABLED: 'false',
    }),
    stdio: ['ignore', nextLog, nextLog],
  });

  await waitForHttp(`http://127.0.0.1:${NEXT_PORT}/login`, 120_000);

  const shutdown = async () => {
    nextProc.kill('SIGTERM');
    postgrest.kill('SIGTERM');
    gotrue.kill('SIGTERM');
    gateway.close();
    denyProxy.close();
    await cluster.destroy();
  };

  const tokenRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: syntheticEmail, password: syntheticPassword }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`Password grant failed ${tokenRes.status}`);
  }

  const unauthNdsRes = await fetch(`http://127.0.0.1:${NEXT_PORT}/api/journal/nds`);
  const unauthNdsBody = await unauthNdsRes.text();

  const persistRes = await fetch(
    `http://127.0.0.1:${GATEWAY_PORT}/rest/v1/journal_day_revisions?select=person_id,date_local,revision&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const persistBody = await persistRes.text();

  const snapshotRes = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/rest/v1/rpc/nds_read_day_snapshot`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_person_id: personId,
      p_date_local: '2026-09-14',
    }),
  });
  const snapshotBody = await snapshotRes.text();

  let denyStatus = 0;
  try {
    const deny = await fetch('http://example.invalid/', {
      signal: AbortSignal.timeout(3000),
      // @ts-expect-error Node fetch dispatcher is not typed here
      dispatcher: undefined,
    });
    denyStatus = deny.status;
  } catch {
    denyStatus = -1;
  }
  const proxyDenied = await fetch(`http://127.0.0.1:${DENY_PROXY_PORT}/`, {
    headers: { host: 'example.com' },
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: `http://127.0.0.1:${NEXT_PORT}` });
  const page = await context.newPage();
  const browserConsole: string[] = [];
  const browserFailed: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') browserConsole.push(msg.text());
  });
  page.on('pageerror', (error) => browserConsole.push(String(error)));
  page.on('requestfailed', (req) => {
    browserFailed.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`.trim());
  });
  await page.goto(`/login?redirect=/app`);
  await page.locator('#login-email').fill(syntheticEmail);
  await page.locator('#login-password').fill(syntheticPassword);
  const authTokenResponse = page.waitForResponse(
    (res) => res.url().includes('/auth/v1/token') || /\/token(\?|$)/.test(new URL(res.url()).pathname),
    { timeout: 30_000 },
  );
  await page.locator('form button[type="submit"]').first().click();
  const tokenHttp = await authTokenResponse
    .then((res) => `${res.status()} ${res.url()}`)
    .catch((error) => `missing: ${(error as Error).message}`);
  await page
    .waitForFunction(() => location.pathname === '/app' || location.pathname.startsWith('/app/'), {
      timeout: 60_000,
    })
    .catch(() => undefined);
  const browserUrl = page.url();
  const browserTitle = await page.title();
  const apiFromBrowser = await page.request.get(`/api/journal/nds`);
  const ndsResStatus = apiFromBrowser.status();
  const ndsBodyFromBrowser = await apiFromBrowser.text();
  const cookieNames = (await context.cookies()).map((c) => c.name).sort();

  const todayUtc = new Date().toISOString().slice(0, 10);
  const unknownDay = '2026-09-01';
  const knownWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${todayUtc}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Salmon and quinoa bowl',
        quantity: 1,
        unit: 'serving',
        calories: 620,
        macros: {
          protein: 42,
          carbs: 55,
          fat: 22,
          fiber: 9,
          added_sugar_g: 3,
          added_sugar_provenance: 'authored',
        },
        foodObjectId: foodId,
        servingSizeG: 400,
      },
    },
  });
  const knownWriteBody = await knownWrite.text();
  const knownNds = await page.request.get(`/api/journal/nds?date_local=${todayUtc}`);
  const knownNdsBody = await knownNds.text();
  const knownNdsJson = JSON.parse(knownNdsBody) as NdsApiBody;
  const knownNdsIdentity = ndsPublicIdentity(knownNdsJson);
  const materializationAfterFirstRead = await readDailyNdsMaterialization(cluster, personId, todayUtc);

  const knownNdsSecond = await page.request.get(`/api/journal/nds?date_local=${todayUtc}`);
  const knownNdsSecondBody = await knownNdsSecond.text();
  const knownNdsSecondJson = JSON.parse(knownNdsSecondBody) as NdsApiBody;
  const knownNdsSecondIdentity = ndsPublicIdentity(knownNdsSecondJson);
  const materializationAfterSecondRead = await readDailyNdsMaterialization(cluster, personId, todayUtc);

  const persistKnown = await fetch(
    `http://127.0.0.1:${GATEWAY_PORT}/rest/v1/journal_entries?select=id,payload&person_id=eq.${personId}&limit=5`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const persistKnownBody = await persistKnown.text();

  const firstMat = materializationIdentity(materializationAfterFirstRead);
  const secondMat = materializationIdentity(materializationAfterSecondRead);
  const apiEqualIgnoringPublish =
    stableJson(ndsComparableIdentity(knownNdsJson)) ===
    stableJson(ndsComparableIdentity(knownNdsSecondJson));
  const materializationUnchanged =
    firstMat !== null &&
    secondMat !== null &&
    firstMat.id === secondMat.id &&
    firstMat.computed_as_of === secondMat.computed_as_of &&
    firstMat.source_revision === secondMat.source_revision &&
    firstMat.computation_generation === secondMat.computation_generation &&
    firstMat.dependency_fingerprint === secondMat.dependency_fingerprint &&
    firstMat.nds_score_100 === secondMat.nds_score_100 &&
    firstMat.response_state === secondMat.response_state &&
    firstMat.readings_md5 === secondMat.readings_md5 &&
    firstMat.nds_version === secondMat.nds_version &&
    firstMat.classifier_version === secondMat.classifier_version &&
    firstMat.normalizer_version === secondMat.normalizer_version &&
    firstMat.day_policy_version === secondMat.day_policy_version;
  const secondWasOrdinaryCacheRead =
    knownNdsSecondIdentity.publish_reason === null &&
    knownNdsSecondIdentity.invalidation_reason === null &&
    knownNdsSecondIdentity.state === 'fresh';
  const g2E01Pass =
    knownNds.status() === 200 &&
    knownNdsSecond.status() === 200 &&
    knownNdsIdentity.state === 'fresh' &&
    knownNdsIdentity.nds_score_100 !== null &&
    apiEqualIgnoringPublish &&
    secondWasOrdinaryCacheRead &&
    materializationUnchanged;

  if (!BASELINE_MODE && !g2E01Pass) {
    const failPath = path.join(EVIDENCE_DIR, 'g2-e01-failure.json');
    fs.writeFileSync(
      failPath,
      JSON.stringify(
        {
          first: knownNdsIdentity,
          second: knownNdsSecondIdentity,
          comparable_first: ndsComparableIdentity(knownNdsJson),
          comparable_second: ndsComparableIdentity(knownNdsSecondJson),
          mat1: firstMat,
          mat2: secondMat,
          flags: {
            first_status: knownNds.status(),
            second_status: knownNdsSecond.status(),
            apiEqualIgnoringPublish,
            secondWasOrdinaryCacheRead,
            materializationUnchanged,
          },
        },
        null,
        2,
      ),
    );
    await shutdown();
    throw new Error(
      `G2-E01 failed: second ordinary cache read did not preserve identity. first=${stableJson(
        knownNdsIdentity,
      )} second=${stableJson(knownNdsSecondIdentity)} mat1=${stableJson(firstMat)} mat2=${stableJson(secondMat)}`,
    );
  }

  const mutator = await cluster.connect();
  try {
    await mutator.query(`UPDATE public.food_objects SET fiber_g = 999, calories = 1, protein_g = 1 WHERE id = $1`, [
      foodId,
    ]);
    await mutator.query(`DELETE FROM public.daily_nds WHERE person_id = $1 AND date_local = $2`, [
      personId,
      todayUtc,
    ]);
  } finally {
    await mutator.end();
  }

  const afterMutationNds = await page.request.get(`/api/journal/nds?date_local=${todayUtc}`);
  const afterMutationBody = await afterMutationNds.text();
  const afterMutationJson = JSON.parse(afterMutationBody) as NdsApiBody;

  const unknownWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${unknownDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Unspecified fruit',
        quantity: 1,
        unit: 'serving',
        calories: 90,
        macros: { protein: 1, added_sugar_provenance: 'unknown' },
        added_sugar_provenance: 'unknown',
        foodObjectId: foodId,
        servingSizeG: 100,
      },
    },
  });
  const unknownWriteBody = await unknownWrite.text();
  const unknownNds = await page.request.get(`/api/journal/nds?date_local=${unknownDay}`);
  const unknownNdsBody = await unknownNds.text();

  await page.goto('/app');
  await page.waitForTimeout(1500);
  const g2BrowserUrl = page.url();
  const g2HomeText = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');
  const browserShot = path.join(
    EVIDENCE_DIR,
    BASELINE_MODE ? 'g2-e02-baseline-app.png' : 'g1-app-signed-in.png',
  );
  await page.screenshot({ path: browserShot, fullPage: true });
  const g2Shot = path.join(
    EVIDENCE_DIR,
    BASELINE_MODE ? 'g2-e02-baseline-home.png' : 'g2-app-numeric.png',
  );
  await page.screenshot({ path: g2Shot, fullPage: true });

  const CANONICAL_FINGERPRINT =
    'main_meal_kcal_threshold=250|score_without_added_sugar=0|snack_isolation_minutes=90|snack_kcal_threshold=200';
  const knownEntryId = (() => {
    try {
      const parsed = JSON.parse(knownWriteBody) as { entry?: { id?: string } };
      return parsed.entry?.id ?? null;
    } catch {
      return null;
    }
  })();

  async function postgrestRpc(
    fn: string,
    body: unknown,
    token: string,
  ): Promise<{ status: number; body: string }> {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: token === serviceRoleKey ? serviceRoleKey : anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text() };
  }

  const a01WrongFingerprint = await postgrestRpc(
    'nds_publish_daily_score',
    {
      p_person_id: personId,
      p_date_local: todayUtc,
      p_computed_from_revision: knownNdsIdentity.source_revision,
      p_generation: firstMat?.computation_generation ?? 1,
      p_nds_version: knownNdsIdentity.versions?.nds_version,
      p_classifier_version: knownNdsIdentity.versions?.classifier_version,
      p_normalizer_version: knownNdsIdentity.versions?.normalizer_version,
      p_day_policy_version: knownNdsIdentity.versions?.day_policy_version,
      p_dependency_fingerprint: 'snack_kcal_threshold=999',
      p_response_state: 'fresh',
      p_day_provenance: 'explicit',
      p_added_sugar_coverage: 'known',
      p_score_100: 1,
      p_wfr_10: 1,
      p_ps_10: 1,
      p_pnd_10: 1,
      p_fp_10: 1,
      p_as_10: 1,
      p_mnc_10: 1,
      p_ob_10: 1,
      p_readings: {},
      p_debug_data: null,
    },
    serviceRoleKey,
  );
  const a07Snapshot = await postgrestRpc(
    'nds_read_day_snapshot',
    { p_person_id: personId, p_date_local: todayUtc },
    serviceRoleKey,
  );
  const a07Claim = await postgrestRpc(
    'nds_claim_work',
    { p_limit: 10, p_lease_seconds: 120 },
    serviceRoleKey,
  );
  const a02UserAdvance = await postgrestRpc(
    'nds_advance_generation',
    {
      p_nds_version: 'nds_daily_2026-01-26.v10',
      p_classifier_version: 'processing_classifier_2026-02-08.v2',
      p_normalizer_version: 'nds_consumed_normalizer_2026-09-14.v3',
      p_day_policy_version: 'nds_day_policy_2026-09-13.v2',
      p_dependency_fingerprint: CANONICAL_FINGERPRINT,
    },
    tokenJson.access_token as string,
  );
  const a02UserPublish = await postgrestRpc(
    'nds_publish_daily_score',
    {
      p_person_id: personId,
      p_date_local: todayUtc,
      p_computed_from_revision: 1,
      p_generation: firstMat?.computation_generation ?? 1,
      p_nds_version: 'nds_daily_2026-01-26.v10',
      p_classifier_version: 'processing_classifier_2026-02-08.v2',
      p_normalizer_version: 'nds_consumed_normalizer_2026-09-14.v3',
      p_day_policy_version: 'nds_day_policy_2026-09-13.v2',
      p_dependency_fingerprint: CANONICAL_FINGERPRINT,
      p_response_state: 'fresh',
      p_day_provenance: 'explicit',
      p_added_sugar_coverage: 'known',
      p_score_100: 1,
      p_wfr_10: 1,
      p_ps_10: 1,
      p_pnd_10: 1,
      p_fp_10: 1,
      p_as_10: 1,
      p_mnc_10: 1,
      p_ob_10: 1,
      p_readings: {},
      p_debug_data: null,
    },
    tokenJson.access_token as string,
  );

  const servingHalfDay = '2026-08-10';
  const servingTwoDay = '2026-08-11';
  const cupUnknownDay = '2026-08-12';
  const gramsDay = '2026-08-13';
  const groupedSugarDay = '2026-08-14';
  const replacementDay = '2026-08-15';

  const halfWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${servingHalfDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Half bowl',
        quantity: 0.5,
        unit: 'serving',
        calories: 310,
        macros: {
          protein: 21,
          carbs: 27.5,
          fat: 11,
          fiber: 4.5,
          added_sugar_g: 1.5,
          added_sugar_provenance: 'authored',
        },
        foodObjectId: foodId,
        servingSizeG: 400,
      },
    },
  });
  const twoWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${servingTwoDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Double bowl',
        quantity: 2,
        unit: 'serving',
        calories: 1240,
        macros: {
          protein: 84,
          carbs: 110,
          fat: 44,
          fiber: 18,
          added_sugar_g: 6,
          added_sugar_provenance: 'authored',
        },
        foodObjectId: foodId,
        servingSizeG: 400,
      },
    },
  });
  const cupWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${cupUnknownDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Unknown cup',
        quantity: 1,
        unit: 'cup',
        calories: 620,
        macros: { protein: 42, added_sugar_g: 3, added_sugar_provenance: 'authored' },
        foodObjectId: foodId,
        servingSizeG: 400,
      },
    },
  });
  const gramsWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${gramsDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Raw grams only',
        quantity: 200,
        unit: 'g',
        calories: 310,
        macros: { protein: 21, added_sugar_g: 1.5, added_sugar_provenance: 'authored' },
      },
    },
  });
  const groupedWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${groupedSugarDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Syrup bowl',
        quantity: 1,
        meal_group: {
          schema_version: 1,
          name: 'Syrup bowl',
          source_meal_document_id: null,
          source_imported_meal_id: null,
          source_planned_meal_id: null,
          source_template_id: null,
          components: [
            {
              component_id: 'c1',
              name: 'Syrup',
              quantity: 1,
              unit: 'serving',
              food_object_id: foodId,
              calories: 50,
              macros: {
                protein_g: 0,
                carbs_g: 12,
                fat_g: 0,
                added_sugar_g: 12,
                added_sugar_provenance: 'untrusted_catalog_total_sugar',
              },
              nutrition_basis: 'per_component',
              match_status: 'matched',
              source_kind: 'food_object',
              needs_review: false,
            },
          ],
          totals: {
            calories: 50,
            macros: { protein_g: 0, carbs_g: 12, fat_g: 0, added_sugar_g: 12 },
          },
          planned_servings: null,
          consumed_servings: 1,
          detached_from_source: false,
          needs_review: false,
        },
      },
    },
  });
  const replacementWrite = await page.request.post(`/api/journal/entries`, {
    data: {
      occurredAt: `${replacementDay}T18:00:00.000Z`,
      entryType: 'intake',
      payload: {
        name: 'Original food',
        quantity: 1,
        unit: 'serving',
        calories: 620,
        macros: {
          protein: 42,
          carbs: 55,
          fat: 22,
          fiber: 9,
          added_sugar_g: 3,
          added_sugar_provenance: 'authored',
        },
        foodObjectId: foodId,
        servingSizeG: 400,
      },
    },
  });
  const replacementBody = await replacementWrite.text();
  const replacementId = (() => {
    try {
      return (JSON.parse(replacementBody) as { entry?: { id?: string } }).entry?.id ?? null;
    } catch {
      return null;
    }
  })();
  const replacementPatch = replacementId
    ? await page.request.patch(`/api/journal/entries/${replacementId}`, {
        data: {
          replacePayload: true,
          payload: {
            name: 'Replacement food',
            quantity: 1,
            unit: 'serving',
            calories: 400,
            macros: {
              protein: 20,
              carbs: 40,
              fat: 10,
              fiber: 5,
              added_sugar_g: 2,
              added_sugar_provenance: 'authored',
            },
            servingSizeG: 250,
          },
        },
      })
    : null;

  const quantityPatch = knownEntryId
    ? await page.request.patch(`/api/journal/entries/${knownEntryId}`, {
        data: { payload: { quantity: 2, unit: 'serving' } },
      })
    : null;

  const halfNds = await page.request.get(`/api/journal/nds?date_local=${servingHalfDay}`);
  const twoNds = await page.request.get(`/api/journal/nds?date_local=${servingTwoDay}`);
  const cupNds = await page.request.get(`/api/journal/nds?date_local=${cupUnknownDay}`);
  const gramsNds = await page.request.get(`/api/journal/nds?date_local=${gramsDay}`);
  const groupedNds = await page.request.get(`/api/journal/nds?date_local=${groupedSugarDay}`);
  const replacementNds = await page.request.get(`/api/journal/nds?date_local=${replacementDay}`);
  const afterQuantityNds = await page.request.get(`/api/journal/nds?date_local=${todayUtc}`);

  const halfNdsBody = await halfNds.text();
  const twoNdsBody = await twoNds.text();
  const cupNdsBody = await cupNds.text();
  const gramsNdsBody = await gramsNds.text();
  const groupedNdsBody = await groupedNds.text();
  const replacementNdsBody = await replacementNds.text();
  const afterQuantityNdsBody = await afterQuantityNds.text();

  await page.goto('/app');
  await page.waitForTimeout(800);
  const homeBeforeLog = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');
  await page.goto('/app/log');
  await page.waitForTimeout(800);
  const logUrl = page.url();
  await page.goto('/app');
  await page.waitForTimeout(800);
  const homeAfterLog = await page.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');
  const g3HomeLogShot = path.join(EVIDENCE_DIR, 'g3-home-log-home.png');
  await page.screenshot({ path: g3HomeLogShot, fullPage: true });

  const syntheticEmailB = 'nds01c-g3b@local.invalid';
  const syntheticPasswordB = `Nd1c-${crypto.randomBytes(12).toString('hex')}!aA`;
  const signupB = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: syntheticEmailB, password: syntheticPasswordB }),
  });
  const signupBJson = (await signupB.json()) as { id?: string; user?: { id?: string } };
  const authUserB = signupBJson.user?.id || signupBJson.id || '';
  const seedB = await cluster.connect();
  let personB = '';
  try {
    if (authUserB) {
      const insertedB = await seedB.query<{ id: string }>(
        `INSERT INTO public.people (email, first_name, status, auth_user_id, metadata)
         VALUES ($1, 'G3B', 'active_user', $2, $3::jsonb)
         RETURNING id`,
        [syntheticEmailB, authUserB, JSON.stringify({ onboarding_completed_at: new Date().toISOString() })],
      );
      personB = insertedB.rows[0].id;
      await seedB.query(`INSERT INTO public.profiles (id, role) VALUES ($1, 'user') ON CONFLICT (id) DO NOTHING`, [
        authUserB,
      ]);
      await seedB.query(
        `INSERT INTO public.person_entitlements (person_id, entitlement_key, is_active, source)
         VALUES ($1, 'journal', true, 'manual')`,
        [personB],
      );
    }
  } finally {
    await seedB.end();
  }
  const contextB = await browser.newContext({ baseURL: `http://127.0.0.1:${NEXT_PORT}` });
  const pageB = await contextB.newPage();
  await pageB.goto(`/login?redirect=/app`);
  await pageB.locator('#login-email').fill(syntheticEmailB);
  await pageB.locator('#login-password').fill(syntheticPasswordB);
  await pageB.locator('form button[type="submit"]').first().click();
  await pageB
    .waitForFunction(() => location.pathname === '/app' || location.pathname.startsWith('/app/'), { timeout: 60_000 })
    .catch(() => undefined);
  const ndsB = await pageB.request.get(`/api/journal/nds?date_local=${todayUtc}`);
  const ndsBBody = await ndsB.text();
  const ndsBJson = (() => {
    try {
      return JSON.parse(ndsBBody) as NdsApiBody;
    } catch {
      return {} as NdsApiBody;
    }
  })();
  const ndsBCross = await pageB.request.get(`/api/journal/nds?date_local=${todayUtc}&person_id=${personId}`);
  const ndsBCrossBody = await ndsBCross.text();
  await pageB.goto('/app');
  await pageB.waitForTimeout(800);
  const homeB = await pageB.locator('[aria-label="Nutrition Density So Far Today"]').innerText().catch(() => '');
  const g3SwitchShot = path.join(EVIDENCE_DIR, 'g3-account-b-home.png');
  await pageB.screenshot({ path: g3SwitchShot, fullPage: true });
  await contextB.close();

  const cupPersist = await fetch(
    `http://127.0.0.1:${GATEWAY_PORT}/rest/v1/journal_entries?select=id,payload&person_id=eq.${personId}&occurred_at=gte.${cupUnknownDay}T00:00:00Z&limit=3`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  const cupPersistBody = await cupPersist.text();
  const groupedPersist = await fetch(
    `http://127.0.0.1:${GATEWAY_PORT}/rest/v1/journal_entries?select=id,payload&person_id=eq.${personId}&occurred_at=gte.${groupedSugarDay}T00:00:00Z&occurred_at=lt.2026-08-15T00:00:00Z&limit=3`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  const groupedPersistBody = await groupedPersist.text();

  const remaining = BASELINE_MODE
    ? { skipped: 'baseline_mode' }
    : await runRemainingG3Verification({
        page,
        browser,
        cluster,
        personId,
        foodId,
        serviceRoleKey,
        anonKey,
        syntheticEmail,
        syntheticPassword,
        jwtSecret,
        gatewayPort: GATEWAY_PORT,
        nextPort: NEXT_PORT,
        evidenceDir: EVIDENCE_DIR,
        repoRoot: REPO_ROOT,
        postgrestRpc,
      });

  const g3 = {
    a01_wrong_fingerprint_status: a01WrongFingerprint.status,
    a01_wrong_fingerprint_body_prefix: a01WrongFingerprint.body.slice(0, 400),
    a01_wrong_fingerprint_rejected: a01WrongFingerprint.body.includes('stale_context'),
    a02_user_advance_status: a02UserAdvance.status,
    a02_user_advance_body_prefix: a02UserAdvance.body.slice(0, 200),
    a02_user_publish_status: a02UserPublish.status,
    a02_user_publish_body_prefix: a02UserPublish.body.slice(0, 200),
    a02_browser_roles_denied: a02UserAdvance.status >= 400 && a02UserPublish.status >= 400,
    a03_home_before_log: homeBeforeLog.slice(0, 200),
    a03_log_url: logUrl,
    a03_home_after_log: homeAfterLog.slice(0, 200),
    a03_quantity_patch_status: quantityPatch?.status() ?? null,
    a03_after_quantity_nds_prefix: afterQuantityNdsBody.slice(0, 300),
    a04_signup_b_status: signupB.status,
    a04_person_b: personB,
    a04_nds_b_status: ndsB.status(),
    a04_nds_b_person: ndsBJson.nds?.person_id ?? null,
    a04_nds_b_score: ndsBJson.nds?.nds_score_100 ?? null,
    a04_nds_b_state: ndsBJson.nds?.state ?? null,
    a04_cross_person_status: ndsBCross.status(),
    a04_cross_person_body_prefix: ndsBCrossBody.slice(0, 200),
    a04_home_b: homeB.slice(0, 200),
    a04_no_leak_of_a_score: ndsBJson.nds?.person_id !== personId && ndsBJson.nds?.nds_score_100 !== 85.5,
    a05_half_write_status: halfWrite.status(),
    a05_two_write_status: twoWrite.status(),
    a05_cup_write_status: cupWrite.status(),
    a05_grams_write_status: gramsWrite.status(),
    a05_replacement_write_status: replacementWrite.status(),
    a05_replacement_patch_status: replacementPatch?.status() ?? null,
    a05_half_nds_prefix: halfNdsBody.slice(0, 250),
    a05_two_nds_prefix: twoNdsBody.slice(0, 250),
    a05_cup_nds_prefix: cupNdsBody.slice(0, 250),
    a05_grams_nds_prefix: gramsNdsBody.slice(0, 250),
    a05_replacement_nds_prefix: replacementNdsBody.slice(0, 250),
    a05_cup_persist_prefix: cupPersistBody.slice(0, 400),
    a05_cup_conversion_unavailable: cupPersistBody.includes('household_measure_unavailable'),
    a06_grouped_write_status: groupedWrite.status(),
    a06_grouped_nds_prefix: groupedNdsBody.slice(0, 300),
    a06_grouped_persist_prefix: groupedPersistBody.slice(0, 400),
    a07_snapshot_status: a07Snapshot.status,
    a07_snapshot_prefix: a07Snapshot.body.slice(0, 300),
    a07_claim_status: a07Claim.status,
    a07_claim_prefix: a07Claim.body.slice(0, 300),
    g3_home_log_screenshot: path.relative(REPO_ROOT, g3HomeLogShot),
    g3_account_b_screenshot: path.relative(REPO_ROOT, g3SwitchShot),
      remaining,
    };

  if (!BASELINE_MODE) {
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'g3-remaining.json'),
      JSON.stringify(remaining, null, 2),
    );
  }

  await browser.close();

  const persistedHasAuthoredFiber = persistKnownBody.includes('"fiber": 9');
  const persistedHasAuthoredSugar =
    persistKnownBody.includes('"added_sugar_g": 3') || persistKnownBody.includes('"added_sugar_g":3');
  const persistedHasWriteTimeEvidence = persistKnownBody.includes('write_time_capture');
  const coverageAddedSugar =
    typeof knownNdsJson.nds?.coverage?.added_sugar === 'string'
      ? knownNdsJson.nds.coverage.added_sugar
      : null;

  const correctedWriterPathPass =
    knownWrite.status() === 201 &&
    knownNdsIdentity.state === 'fresh' &&
    knownNdsIdentity.nds_score_100 === 85.5 &&
    coverageAddedSugar === 'known' &&
    persistedHasAuthoredFiber &&
    persistedHasAuthoredSugar &&
    persistedHasWriteTimeEvidence &&
    afterMutationNds.status() === 200 &&
    afterMutationJson.nds?.state === 'fresh' &&
    afterMutationJson.nds?.nds_score_100 === 85.5;

  const baselineFailingBehavior =
    !persistedHasAuthoredFiber ||
    !persistedHasAuthoredSugar ||
    !persistedHasWriteTimeEvidence ||
    knownNdsIdentity.nds_score_100 !== 85.5 ||
    coverageAddedSugar !== 'known' ||
    knownNdsIdentity.state !== 'fresh';

  if (!BASELINE_MODE && !correctedWriterPathPass) {
    throw new Error(
      `Corrected writer-to-score path failed: score=${String(
        knownNdsIdentity.nds_score_100,
      )} state=${String(knownNdsIdentity.state)} sugar=${String(
        coverageAddedSugar,
      )} after=${String(afterMutationJson.nds?.nds_score_100)} persist_fiber=${String(
        persistedHasAuthoredFiber,
      )} persist_sugar=${String(persistedHasAuthoredSugar)}`,
    );
  }
  if (BASELINE_MODE && !baselineFailingBehavior) {
    throw new Error(
      'G2-E02 expected 3daa318 to lose authored fiber/added-sugar or fail the numeric 85.5 path, but the baseline matched the repaired behavior',
    );
  }

  const identityFile = BASELINE_MODE ? 'g2-e02-baseline-identity.json' : 'g1-stack-identity.json';
  const identityLog = BASELINE_MODE ? 'g2-e02-baseline-identity.log' : 'g1-stack-identity.log';
  const identity = {
    reporting_uuid: '6f8b5861-1793-49cb-9ff7-4244e0f87017',
    reporting_uuid_kind: 'manual reporting identity only — not a durable Bridge lease',
    harness_sha: gitShaAt(REPO_ROOT),
    app_root: APP_ROOT,
    app_source_sha: gitShaAt(APP_ROOT),
    baseline_mode: BASELINE_MODE,
    postgres_version: cluster.postgresVersion,
    postgres_run_id: cluster.descriptor.runId,
    postgres_socket: cluster.socketDirectory,
    postgres_listen_addresses: '',
    auth: 'supabase-auth/gotrue v2.197.0 loopback',
    postgrest: 'PostgREST 16.3 loopback',
    gateway: `http://127.0.0.1:${GATEWAY_PORT}`,
    next: `http://127.0.0.1:${NEXT_PORT}`,
    synthetic_email: syntheticEmail,
    auth_user_id: authUserId,
    person_id: personId,
    signup_status: signup.status,
    password_grant_status: tokenRes.status,
    unauth_nds_status: unauthNdsRes.status,
    unauth_nds_body_prefix: unauthNdsBody.slice(0, 200),
    nds_route_status: ndsResStatus,
    nds_route_body_prefix: ndsBodyFromBrowser.slice(0, 500),
    persistence_status: persistRes.status,
    persistence_body_prefix: persistBody.slice(0, 300),
    snapshot_rpc_status: snapshotRes.status,
    snapshot_rpc_body_prefix: snapshotBody.slice(0, 300),
    deny_proxy_status: proxyDenied.status,
    example_invalid_fetch: denyStatus,
    browser_url: browserUrl,
    browser_title: browserTitle,
    browser_auth_token_http: tokenHttp,
    browser_cookie_names: cookieNames,
    browser_console_errors: browserConsole.slice(0, 20),
    browser_failed_requests: browserFailed.slice(0, 20),
    screenshot: path.relative(REPO_ROOT, browserShot),
    g2_food_id: foodId,
    g2_known_write_status: knownWrite.status(),
    g2_known_write_body_prefix: knownWriteBody.slice(0, 400),
    g2_known_nds_status: knownNds.status(),
    g2_known_nds_state: knownNdsIdentity.state,
    g2_known_nds_score: knownNdsIdentity.nds_score_100,
    g2_known_added_sugar: coverageAddedSugar,
    g2_known_source_revision: knownNdsIdentity.source_revision,
    g2_known_computed_as_of: knownNdsIdentity.computed_as_of,
    g2_known_versions: knownNdsIdentity.versions,
    g2_known_publish_reason: knownNdsIdentity.publish_reason,
    g2_known_invalidation_reason: knownNdsIdentity.invalidation_reason,
    g2_persisted_entries_status: persistKnown.status,
    g2_persisted_entries_prefix: persistKnownBody.slice(0, 500),
    g2_persisted_authored_fiber: persistedHasAuthoredFiber,
    g2_persisted_authored_added_sugar: persistedHasAuthoredSugar,
    g2_persisted_write_time_evidence: persistedHasWriteTimeEvidence,
    g2_e01_second_nds_status: knownNdsSecond.status(),
    g2_e01_second_publish_reason: knownNdsSecondIdentity.publish_reason,
    g2_e01_second_invalidation_reason: knownNdsSecondIdentity.invalidation_reason,
    g2_e01_second_state: knownNdsSecondIdentity.state,
    g2_e01_second_score: knownNdsSecondIdentity.nds_score_100,
    g2_e01_second_source_revision: knownNdsSecondIdentity.source_revision,
    g2_e01_second_computed_as_of: knownNdsSecondIdentity.computed_as_of,
    g2_e01_second_was_ordinary_cache_read: secondWasOrdinaryCacheRead,
    g2_e01_api_identity_equal: apiEqualIgnoringPublish,
    g2_e01_materialization_unchanged: materializationUnchanged,
    g2_e01_materialization_after_first: firstMat,
    g2_e01_materialization_after_second: secondMat,
    g2_e01_pass: g2E01Pass,
    g2_after_catalog_mutation_status: afterMutationNds.status(),
    g2_after_catalog_mutation_state: afterMutationJson.nds?.state ?? null,
    g2_after_catalog_mutation_score: afterMutationJson.nds?.nds_score_100 ?? null,
    g2_unknown_write_status: unknownWrite.status(),
    g2_unknown_write_body_prefix: unknownWriteBody.slice(0, 300),
    g2_unknown_nds_status: unknownNds.status(),
    g2_unknown_nds_body_prefix: unknownNdsBody.slice(0, 400),
    g2_browser_url: g2BrowserUrl,
    g2_home_text: g2HomeText.slice(0, 400),
    g2_screenshot: path.relative(REPO_ROOT, g2Shot),
    g2_corrected_writer_path_pass: correctedWriterPathPass,
    g2_e02_baseline_failing_behavior: baselineFailingBehavior,
    g3: BASELINE_MODE ? { skipped: 'baseline_mode' } : g3,
  };
  console.log(JSON.stringify(identity, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, identityFile), JSON.stringify(identity, null, 2));
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, identityLog),
    Object.entries(identity)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n') + '\n',
  );

  const keep = process.argv.includes('--keep');
  if (!keep) {
    await shutdown();
  } else {
    console.log('G1 stack kept running; Ctrl-C to stop');
    process.on('SIGINT', () => {
      void shutdown().then(() => process.exit(0));
    });
  }

  if (
    !BASELINE_MODE &&
    remaining &&
    typeof remaining === 'object' &&
    'remaining_pass' in remaining &&
    !(remaining as { remaining_pass?: boolean }).remaining_pass
  ) {
    throw new Error(
      'Remaining A03–A08 verification failed. See docs/nds/evidence/nds01c/g3-remaining.json',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

