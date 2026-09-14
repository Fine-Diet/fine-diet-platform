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

const REPO_ROOT = process.cwd();
const RUN_ROOT = process.env.NDS01C_RUN_ROOT || path.resolve(REPO_ROOT, '..');
const TOOLS_BIN = process.env.NDS01C_TOOLS_BIN || path.join(RUN_ROOT, 'tools', 'bin');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'nds', 'evidence', 'nds01c');
const APP_SCHEMA = path.join(REPO_ROOT, 'scripts', 'nds01c', 'g1AppSchema.sql');

const AUTH_PORT = 9999;
const POSTGREST_PORT = 3001;
const GATEWAY_PORT = 54321;
const NEXT_PORT = 3000;
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
    const origin = 'http://127.0.0.1:3000';
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
    await applySqlFile(readyOwner, BASELINE_SCHEMA);
    await applySqlFile(readyOwner, APP_SCHEMA);
    for (const file of EXPAND_MIGRATIONS) await applySqlFile(readyOwner, file);
    await readyOwner.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role');
    await readyOwner.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role');
    await readyOwner.query(
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, authenticated, anon',
    );
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
  fs.writeFileSync(path.join(REPO_ROOT, '.env.local'), envLocal, { mode: 0o600 });

  const nextLog = fs.openSync(path.join(cluster.descriptor.dataDirectory, '..', 'next.log'), 'a');
  const nextProc = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'next'), ['dev', '-H', '127.0.0.1', '-p', String(NEXT_PORT)], {
    cwd: REPO_ROOT,
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
  const knownNdsJson = JSON.parse(knownNdsBody) as {
    nds?: { state?: string; nds_score_100?: number; source_revision?: number; coverage?: { added_sugar?: string } };
  };

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
  const afterMutationJson = JSON.parse(afterMutationBody) as {
    nds?: { state?: string; nds_score_100?: number; source_revision?: number };
  };

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
  const browserShot = path.join(EVIDENCE_DIR, 'g1-app-signed-in.png');
  await page.screenshot({ path: browserShot, fullPage: true });
  const g2Shot = path.join(EVIDENCE_DIR, 'g2-app-numeric.png');
  await page.screenshot({ path: g2Shot, fullPage: true });
  await browser.close();

  const identity = {
    reporting_uuid: '6f8b5861-1793-49cb-9ff7-4244e0f87017',
    reporting_uuid_kind: 'manual reporting identity only — not a durable Bridge lease',
    source_sha: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
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
    screenshot: 'docs/nds/evidence/nds01c/g1-app-signed-in.png',
    g2_food_id: foodId,
    g2_known_write_status: knownWrite.status(),
    g2_known_write_body_prefix: knownWriteBody.slice(0, 400),
    g2_known_nds_status: knownNds.status(),
    g2_known_nds_state: knownNdsJson.nds?.state ?? null,
    g2_known_nds_score: knownNdsJson.nds?.nds_score_100 ?? null,
    g2_known_added_sugar: knownNdsJson.nds?.coverage?.added_sugar ?? null,
    g2_known_source_revision: knownNdsJson.nds?.source_revision ?? null,
    g2_persisted_entries_status: persistKnown.status,
    g2_persisted_entries_prefix: persistKnownBody.slice(0, 500),
    g2_after_catalog_mutation_status: afterMutationNds.status(),
    g2_after_catalog_mutation_state: afterMutationJson.nds?.state ?? null,
    g2_after_catalog_mutation_score: afterMutationJson.nds?.nds_score_100 ?? null,
    g2_unknown_write_status: unknownWrite.status(),
    g2_unknown_write_body_prefix: unknownWriteBody.slice(0, 300),
    g2_unknown_nds_status: unknownNds.status(),
    g2_unknown_nds_body_prefix: unknownNdsBody.slice(0, 400),
    g2_browser_url: g2BrowserUrl,
    g2_home_text: g2HomeText.slice(0, 400),
    g2_screenshot: 'docs/nds/evidence/nds01c/g2-app-numeric.png',
  };
  console.log(JSON.stringify(identity, null, 2));
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'g1-stack-identity.json'), JSON.stringify(identity, null, 2));
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, 'g1-stack-identity.log'),
    Object.entries(identity)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n') + '\n',
  );

  const keep = process.argv.includes('--keep');
  const shutdown = async () => {
    nextProc.kill('SIGTERM');
    postgrest.kill('SIGTERM');
    gotrue.kill('SIGTERM');
    gateway.close();
    denyProxy.close();
    await cluster.destroy();
  };
  if (!keep) {
    await shutdown();
  } else {
    console.log('G1 stack kept running; Ctrl-C to stop');
    process.on('SIGINT', () => {
      void shutdown().then(() => process.exit(0));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

