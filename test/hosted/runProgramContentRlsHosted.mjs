#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_REF = 'tssvlflebugqhtogqdfs';
const BLOCKED_REFS = new Set([
  PRODUCTION_REF,
  'ikvkqpbwlpevqlshdkdz', // protected Payments QA
  'ymdhsvuaixiwhlioiree', // protected Food Log QA
  'slsmfdxxqktkgplliwhx', // deleted temporary RLS branch; reject stale refs
]);
const API_ROOT = 'https://api.supabase.com/v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hostedSetup = path.join(ROOT, 'test/hosted/programContentEntitlementRlsHostedSetup.sql');
const candidateMigration = path.join(ROOT, 'supabase/migrations/20261103090000_program_content_entitlement_rls.sql');
const startedAt = new Date().toISOString();
const evidence = {
  task: 'Fine Diet PR #225 hosted program-content RLS verification',
  startedAt,
  targetProjectRef: null,
  targetBranchName: null,
  parentProjectRef: PRODUCTION_REF,
  setupFile: 'test/hosted/programContentEntitlementRlsHostedSetup.sql',
  candidateMigration: 'supabase/migrations/20261103090000_program_content_entitlement_rls.sql',
  candidateMigrationChanged: false,
  productionRowsQueried: false,
  hostedDatabaseWrites: false,
  checks: [],
  queryPlans: [],
  cleanup: { armed: false, attempted: false, verifiedAbsent: false },
  limitations: [
    'This targets the program authorization boundary only; it is not a full Production schema replica.',
    'No branch is created by this runner. A fresh cost approval and separately provisioned zero-data branch are required.',
  ],
};

let cleanupArmed = false;
let branchRecord = null;
let adminClient = null;
let syntheticUsers = [];
let syntheticRows = null;
let dbEnv = null;
let failureLabel = null;
let projectUrl = null;
let publishableKey = null;

function fail(label, code = 'preflight_failed') {
  failureLabel = label;
  const error = new Error(`${label} (${code})`);
  error.safeCode = code;
  throw error;
}

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) fail(`Missing required environment variable ${name}`, 'missing_input');
  return value.trim();
}

function validateRef(ref, name) {
  if (!/^[a-z0-9]{20}$/.test(ref)) fail(`${name} is not a valid Supabase project reference`, 'invalid_project_ref');
  if (BLOCKED_REFS.has(ref)) fail(`${name} is a protected or retired project reference`, 'blocked_project_ref');
}

function record(name, passed, details = {}) {
  const item = { name, outcome: passed ? 'PASS' : 'FAIL', ...details };
  evidence.checks.push(item);
  process.stdout.write(`${item.outcome} ${name}${details.httpStatus ? ` (HTTP ${details.httpStatus})` : ''}\n`);
  if (!passed) fail(name, 'assertion_failed');
}

function safeErrorCode(error) {
  return error?.code || error?.status || 'api_error';
}

async function managementRequest(method, route, body) {
  const token = required('SUPABASE_ACCESS_TOKEN');
  let response;
  try {
    response = await fetch(`${API_ROOT}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    fail(`Supabase Management API ${method} ${route}`, 'management_api_unreachable');
  }
  const raw = await response.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* never emit response bodies */ }
  if (!response.ok) fail(`Supabase Management API ${method} ${route}`, `http_${response.status}`);
  return json;
}

async function verifyBranchIdentity(targetRef, branchName) {
  const branches = await managementRequest('GET', `/projects/${PRODUCTION_REF}/branches`);
  const list = Array.isArray(branches) ? branches : branches?.branches;
  if (!Array.isArray(list)) fail('Management API branch inventory shape', 'unexpected_response');
  const matches = list.filter((branch) => branch.project_ref === targetRef);
  if (matches.length !== 1) fail('Target project is not exactly one branch of Production', 'branch_identity_mismatch');
  const branch = matches[0];
  if (branch.name !== branchName || branch.parent_project_ref !== PRODUCTION_REF) {
    fail('Target branch name or parent does not match the explicit run identity', 'branch_identity_mismatch');
  }
  if (branch.is_default || branch.persistent || branch.with_data !== false) {
    fail('Target must be non-default, nonpersistent, and created with_data=false', 'unsafe_branch_properties');
  }
  if (branch.preview_project_status !== 'ACTIVE_HEALTHY') {
    branchRecord = branch;
    cleanupArmed = true;
    evidence.cleanup.armed = true;
    fail('Target preview database is not ACTIVE_HEALTHY', 'branch_unhealthy');
  }
  branchRecord = branch;
  cleanupArmed = true;
  evidence.cleanup.armed = true;
  evidence.targetProjectRef = targetRef;
  evidence.targetBranchName = branch.name;
  evidence.branchStatus = branch.status;
  evidence.previewProjectStatus = branch.preview_project_status;
  record('isolated branch identity, parent, zero-data and health', true, {
    branchStatus: branch.status,
    previewProjectStatus: branch.preview_project_status,
    persistent: branch.persistent,
    withData: branch.with_data,
  });
}

function psql(args, input, env = dbEnv) {
  const bin = process.env.PSQL_BIN || 'psql';
  const result = spawnSync(bin, ['-X', '-v', 'ON_ERROR_STOP=1', ...args], {
    cwd: ROOT,
    env,
    input,
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error || result.status !== 0) fail('PostgreSQL command failed; database output suppressed', 'psql_failed');
  return result.stdout || '';
}

function psqlFile(file) {
  psql(['--file', file]);
}

function assertSupabaseResult(label, result) {
  if (result?.error) fail(label, safeErrorCode(result.error));
  return result.data;
}

async function authUser(label, runId, publishableKey, projectUrl) {
  const email = `pr225-rls-${runId}-${label}@example.invalid`;
  const password = randomBytes(36).toString('base64url');
  const created = assertSupabaseResult(`Auth Admin create synthetic ${label}`, await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'temporary PR225 isolated RLS test' },
  }));
  const user = created.user;
  if (!user?.id) fail(`Auth Admin create synthetic ${label}`, 'missing_user_id');
  const entry = { label, id: user.id, email, password };
  syntheticUsers.push(entry);

  const client = createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = assertSupabaseResult(`Auth password sign-in synthetic ${label}`, await client.auth.signInWithPassword({ email, password }));
  if (!signedIn.session?.access_token) fail(`Auth password sign-in synthetic ${label}`, 'missing_access_token');
  entry.accessToken = signedIn.session.access_token;
  record(`real Supabase Auth create and sign-in: ${label}`, true);
  return entry;
}

async function restRequest(resource, { method = 'GET', token = null, query = {}, body = undefined, prefer = undefined } = {}) {
  const url = new URL(`${projectUrl}/rest/v1/${resource}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const headers = { apikey: publishableKey, Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    fail(`PostgREST ${method} ${resource}`, 'postgrest_unreachable');
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* response body not stored */ }
  return { status: response.status, data };
}

function expectRows(name, response, count) {
  record(name, response.status === 200 && Array.isArray(response.data) && response.data.length === count, {
    httpStatus: response.status,
    rowCount: Array.isArray(response.data) ? response.data.length : null,
    expectedRows: count,
  });
}

function expectDenied(name, response) {
  record(name, response.status >= 400, { httpStatus: response.status });
}

async function serviceInsert(table, row) {
  const { data, error } = await adminClient.from(table).insert(row).select('*').single();
  if (error) fail(`Service-role fixture insert into ${table}`, safeErrorCode(error));
  return data;
}

async function serviceDelete(table, column, values) {
  if (!values?.length) return;
  const { error } = await adminClient.from(table).delete().in(column, values);
  if (error) throw new Error(`cleanup ${table} (${safeErrorCode(error)})`);
}

function newId() { return randomUUID(); }

async function seedFixture(users) {
  const people = {};
  for (const actor of ['entitled', 'none', 'assigned', 'expired', 'future']) {
    const user = users[actor];
    const person = await serviceInsert('people', {
      id: newId(), email: user.email, auth_user_id: user.id, status: 'active_user',
    });
    people[actor] = person;
  }
  const adminProfile = await serviceInsert('profiles', { id: users.admin.id, role: 'admin' });
  const slug = `rls-${users.runSlug}`;
  const otherSlug = `${slug}-other`;
  const program = await serviceInsert('programs', { id: newId(), slug, status: 'published' });
  const otherProgram = await serviceInsert('programs', { id: newId(), slug: otherSlug, status: 'published' });
  const version = await serviceInsert('program_versions', {
    id: newId(), program_id: program.id, version_key: 'v1', status: 'published', duration_days: 30,
  });
  const otherVersion = await serviceInsert('program_versions', {
    id: newId(), program_id: otherProgram.id, version_key: 'v1', status: 'published', duration_days: 30,
  });
  const module = await serviceInsert('program_modules', {
    id: newId(), program_id: program.id, status: 'published', ordinal: 1,
  });
  const otherModule = await serviceInsert('program_modules', {
    id: newId(), program_id: otherProgram.id, status: 'published', ordinal: 1,
  });
  const item = await serviceInsert('program_content_items', {
    id: newId(), module_id: module.id, item_type: 'article', title: 'Synthetic protected content',
    body: 'PR225 temporary fixture body', status: 'published', ordinal: 1,
  });
  const now = new Date();
  const past = new Date(now.getTime() - 3600_000).toISOString();
  const future = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const expired = new Date(now.getTime() - 60_000).toISOString();
  const entitlements = {};
  for (const actor of ['entitled', 'expired', 'future']) {
    entitlements[actor] = await serviceInsert('person_entitlements', {
      id: newId(), person_id: people[actor].id, entitlement_key: `program:${slug}`,
      is_active: true,
      starts_at: actor === 'future' ? future : new Date(now.getTime() - 7200_000).toISOString(),
      ends_at: actor === 'expired' ? expired : null,
    });
  }
  const assignment = await serviceInsert('program_assignments', {
    id: newId(), person_id: people.assigned.id, program_slug: slug, status: 'active',
    active_from: past, active_to: null,
  });
  const enrollments = {};
  const selectedStart = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
  for (const actor of ['entitled', 'none', 'assigned', 'expired', 'future']) {
    enrollments[actor] = await serviceInsert('program_enrollments', {
      id: newId(), person_id: people[actor].id, program_id: program.id,
      program_version_id: version.id, status: 'active', selected_start_date: selectedStart,
      timezone: 'UTC', paused_days_total: 0, metadata: {},
    });
  }
  const delivery = await serviceInsert('program_delivery_modules', {
    id: newId(), program_id: program.id, program_version_id: version.id,
    module_key: 'synthetic-delivery', module_type: 'week', status: 'published',
    status_visibility: ['active'], display_order: 1, day_start: 0, day_end: 30,
  });
  return {
    users, people, adminProfile, program, otherProgram, version, otherVersion,
    module, otherModule, item, entitlements, assignment, enrollments, delivery,
    bulkModuleIds: [], runSlug: users.runSlug,
  };
}

function assertUuid(value, label) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    fail(`${label} is not a UUID`, 'invalid_fixture_id');
  }
}

function seedAndAnalyzePerformance(rows) {
  const p = rows;
  for (const [name, value] of Object.entries({ program: p.program.id, version: p.version.id, person: p.people.assigned.id })) {
    assertUuid(value, name);
  }
  const sql = `
INSERT INTO public.person_entitlements(id,person_id,entitlement_key,is_active,starts_at,ends_at)
SELECT gen_random_uuid(),'${p.people.assigned.id}'::uuid,'program:synthetic-perf-'||g,true,now()-interval '1 day',NULL
FROM generate_series(1,10000) g;
INSERT INTO public.program_assignments(id,person_id,program_slug,status,active_from,active_to)
SELECT gen_random_uuid(),'${p.people.assigned.id}'::uuid,'synthetic-perf-'||g,'active',now()-interval '1 day',NULL
FROM generate_series(1,10000) g;
CREATE TEMP TABLE _pr225_perf_modules(id uuid, ordinal integer) ON COMMIT PRESERVE ROWS;
WITH generated AS (SELECT gen_random_uuid() id,g FROM generate_series(1,500) g)
INSERT INTO _pr225_perf_modules SELECT id,g FROM generated;
INSERT INTO public.program_modules(id,program_id,status,ordinal)
SELECT id,'${p.program.id}'::uuid,'published',ordinal+10 FROM _pr225_perf_modules;
INSERT INTO public.program_content_items(id,module_id,item_type,title,body,status,ordinal)
SELECT gen_random_uuid(),id,'article','Synthetic performance item','fixture body','published',1 FROM _pr225_perf_modules;
INSERT INTO public.program_delivery_modules(id,program_id,program_version_id,module_key,module_type,status,status_visibility,display_order,day_start,day_end)
SELECT gen_random_uuid(),'${p.program.id}'::uuid,'${p.version.id}'::uuid,'synthetic-perf-'||g,'week','published',ARRAY['active']::text[],g+10,0,30
FROM generate_series(1,500) g;
ANALYZE public.person_entitlements;
ANALYZE public.program_assignments;
ANALYZE public.program_modules;
ANALYZE public.program_content_items;
ANALYZE public.program_delivery_modules;
`;
  psql([], sql);
  p.bulkModuleIds = ['synthetic_bulk_500'];
}

function runPlan(name, personId, query) {
  assertUuid(personId, `${name} plan actor`);
  const sql = `BEGIN;\nSET LOCAL ROLE authenticated;\n` +
    `SELECT set_config('request.jwt.claim.sub','${personId}',true);\n` +
    `SELECT set_config('request.jwt.claim.role','authenticated',true);\n` +
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query};\nROLLBACK;\n`;
  const stdout = psql(['--quiet', '--no-align', '--tuples-only'], sql);
  const line = stdout.split(/\r?\n/).map((part) => part.trim()).filter((part) => part.startsWith('[{')).at(-1);
  if (!line) fail(`Could not parse EXPLAIN output for ${name}`, 'plan_parse_failed');
  const [plan] = JSON.parse(line);
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node['Node Type']) nodes.push({ nodeType: node['Node Type'], indexName: node['Index Name'] || null });
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(plan.Plan);
  const summary = {
    name,
    planningTimeMs: plan['Planning Time'],
    executionTimeMs: plan['Execution Time'],
    sharedHitBlocks: plan.Plan?.['Shared Hit Blocks'] ?? 0,
    sharedReadBlocks: plan.Plan?.['Shared Read Blocks'] ?? 0,
    nodes,
  };
  evidence.queryPlans.push(summary);
  process.stdout.write(`PLAN ${name} executionMs=${summary.executionTimeMs} hit=${summary.sharedHitBlocks} read=${summary.sharedReadBlocks}\n`);
}

async function runHostedScenarios(rows) {
  const { users, people, program, otherProgram, module, otherModule, item, delivery, entitlements } = rows;
  const programQuery = { select: 'id,slug,status', slug: `eq.${program.slug}` };
  let response = await restRequest('programs', { query: programQuery });
  record('anonymous published program catalogue metadata', response.status === 200 && Array.isArray(response.data) && response.data.length === 1, {
    httpStatus: response.status, rowCount: Array.isArray(response.data) ? response.data.length : null,
  });
  response = await restRequest('program_modules', { query: { select: 'id', id: `eq.${module.id}` } });
  expectDenied('anonymous direct module read denied', response);
  response = await restRequest('program_content_items', { query: { select: 'id', id: `eq.${item.id}` } });
  expectDenied('anonymous direct content-item read denied', response);

  const readRows = (table, id, token) => restRequest(table, {
    token, query: { select: 'id', id: `eq.${id}` },
  });
  expectRows('valid entitlement reads own published module', await readRows('program_modules', module.id, users.entitled.accessToken), 1);
  expectRows('valid entitlement reads own protected item', await readRows('program_content_items', item.id, users.entitled.accessToken), 1);
  expectRows('valid entitlement reads enrolled delivery module', await readRows('program_delivery_modules', delivery.id, users.entitled.accessToken), 1);
  expectRows('entitled member cannot read another program module', await readRows('program_modules', otherModule.id, users.entitled.accessToken), 0);
  expectRows('no-entitlement member denied despite own active enrollment', await readRows('program_modules', module.id, users.none.accessToken), 0);
  expectRows('no-entitlement member denied delivery despite own enrollment', await readRows('program_delivery_modules', delivery.id, users.none.accessToken), 0);
  expectRows('no-entitlement member retains own enrollment metadata', await readRows('program_enrollments', rows.enrollments.none.id, users.none.accessToken), 1);
  expectRows('no-entitlement member retains published version metadata', await readRows('program_versions', rows.version.id, users.none.accessToken), 1);
  expectRows('expired entitlement denied', await readRows('program_modules', module.id, users.expired.accessToken), 0);
  expectRows('future entitlement denied', await readRows('program_modules', module.id, users.future.accessToken), 0);
  expectRows('active in-window assignment permits module read', await readRows('program_modules', module.id, users.assigned.accessToken), 1);
  expectRows('active assignment and own enrollment permit delivery', await readRows('program_delivery_modules', delivery.id, users.assigned.accessToken), 1);

  const unauthorizedWrite = await restRequest('program_modules', {
    method: 'POST', token: users.entitled.accessToken,
    body: { id: newId(), program_id: otherProgram.id, status: 'published', ordinal: 999 },
    prefer: 'return=representation',
  });
  expectDenied('authenticated curriculum write denied', unauthorizedWrite);

  response = await restRequest('person_entitlements', {
    token: users.admin.accessToken, query: { select: 'id', person_id: `eq.${people.none.id}` },
  });
  record('authenticated admin role can read entitlement administration data', response.status === 200 && Array.isArray(response.data), {
    httpStatus: response.status,
  });
  const adminGrant = await restRequest('person_entitlements', {
    method: 'POST', token: users.admin.accessToken,
    body: {
      id: newId(), person_id: people.none.id, entitlement_key: `program:${program.slug}`,
      is_active: true, starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: null,
    },
    prefer: 'return=representation',
  });
  record('authenticated admin can grant current program entitlement', adminGrant.status === 201 && Array.isArray(adminGrant.data) && adminGrant.data.length === 1, {
    httpStatus: adminGrant.status,
  });
  const adminGrantId = adminGrant.data?.[0]?.id;
  if (!adminGrantId) fail('Authenticated admin grant response', 'missing_grant_id');
  expectRows('admin-granted member now reads current program content', await readRows('program_modules', module.id, users.none.accessToken), 1);
  const revokeAdminGrant = await restRequest('person_entitlements', {
    method: 'PATCH', token: users.admin.accessToken,
    query: { id: `eq.${adminGrantId}` }, body: { is_active: false }, prefer: 'return=representation',
  });
  record('authenticated admin can revoke current program entitlement', revokeAdminGrant.status === 200, { httpStatus: revokeAdminGrant.status });
  expectRows('admin-revoked member loses current curriculum access', await readRows('program_modules', module.id, users.none.accessToken), 0);

  const serviceModule = await serviceInsert('program_modules', {
    id: newId(), program_id: otherProgram.id, status: 'draft', ordinal: 990,
  });
  const serviceItem = await serviceInsert('program_content_items', {
    id: newId(), module_id: otherModule.id, item_type: 'article', title: 'Service-role authoring',
    body: 'synthetic', status: 'draft', ordinal: 990,
  });
  const serviceDelivery = await serviceInsert('program_delivery_modules', {
    id: newId(), program_id: otherProgram.id, program_version_id: rows.otherVersion.id,
    module_key: 'service-role-authoring', module_type: 'guide', status: 'draft',
    status_visibility: ['active'], display_order: 990, day_start: 0, day_end: 1,
  });
  for (const [table, row] of [['program_modules', serviceModule], ['program_content_items', serviceItem], ['program_delivery_modules', serviceDelivery]]) {
    const changed = await restRequest(table, {
      method: 'PATCH', query: { id: `eq.${row.id}` }, body: { status: 'published' }, prefer: 'return=representation',
    });
    record(`service-role authoring update ${table}`, changed.status === 200 && Array.isArray(changed.data) && changed.data.length === 1, { httpStatus: changed.status });
    const deleted = await restRequest(table, { method: 'DELETE', query: { id: `eq.${row.id}` } });
    record(`service-role cleanup delete ${table}`, deleted.status === 204, { httpStatus: deleted.status });
  }
  response = await restRequest('program_modules', { token: users.entitled.accessToken, query: { select: 'id', id: `eq.${module.id}` } });
  // The original entitlement is still active at this point; the admin revoke
  // applies to a different person, so this member remains authorized here.
  expectRows('entitled member remains authorized after another member revocation', response, 1);

  const sqlExpiry = await adminClient.from('person_entitlements').update({ is_active: false }).eq('id', entitlements.entitled.id);
  if (sqlExpiry.error) fail('Service-role entitlement revocation', safeErrorCode(sqlExpiry.error));
  expectRows('revoked current entitlement denies direct module read', await readRows('program_modules', module.id, users.entitled.accessToken), 0);
  expectRows('revoked current entitlement denies protected item read', await readRows('program_content_items', item.id, users.entitled.accessToken), 0);
  expectRows('revoked access preserves own enrollment history', await readRows('program_enrollments', rows.enrollments.entitled.id, users.entitled.accessToken), 1);
  expectRows('revoked access preserves own published version metadata', await readRows('program_versions', rows.version.id, users.entitled.accessToken), 1);

}

function recapturePerformance(rows) {
  seedAndAnalyzePerformance(rows);
  const programId = rows.program.id;
  const moduleId = rows.module.id;
  const versionId = rows.version.id;
  const authUserId = rows.users.assigned.id;
  runPlan('program access helper with synthetic grant volume', authUserId,
    `SELECT programs_private.current_user_has_program_access('${programId}'::uuid)`);
  runPlan('module listing under current assignment policy', authUserId,
    `SELECT id FROM public.program_modules WHERE program_id='${programId}'::uuid ORDER BY ordinal`);
  runPlan('content items under current assignment policy', authUserId,
    `SELECT id FROM public.program_content_items WHERE module_id='${moduleId}'::uuid ORDER BY ordinal`);
  runPlan('delivery modules under enrollment and day policy', authUserId,
    `SELECT id FROM public.program_delivery_modules WHERE program_id='${programId}'::uuid AND program_version_id='${versionId}'::uuid ORDER BY display_order`);
  evidence.performanceFixture = {
    entitlementDecoys: 10000,
    assignmentDecoys: 10000,
    extraModules: 500,
    extraContentItems: 500,
    extraDeliveryModules: 500,
    note: 'Synthetic plan volume is representative for index-path observation, not production equivalence or a latency SLO.',
  };
}

async function cleanupSyntheticRows() {
  if (!adminClient || !syntheticRows) return;
  const rows = syntheticRows;
  const personIds = Object.values(rows.people || {}).map((p) => p.id);
  const programIds = [rows.program?.id, rows.otherProgram?.id].filter(Boolean);
  const userIds = Object.values(rows.users || {}).filter((u) => u?.id).map((u) => u.id);
  const errors = [];
  for (const [table, column, values] of [
    ['program_enrollments', 'person_id', personIds],
    ['program_assignments', 'person_id', personIds],
    ['person_entitlements', 'person_id', personIds],
    ['program_delivery_modules', 'program_id', programIds],
    ['program_modules', 'program_id', programIds],
    ['program_versions', 'program_id', programIds],
    ['programs', 'id', programIds],
    ['people', 'id', personIds],
    ['profiles', 'id', userIds],
  ]) {
    try { await serviceDelete(table, column, values); } catch (error) { errors.push(error.message); }
  }
  for (const user of syntheticUsers) {
    try {
      const { error } = await adminClient.auth.admin.deleteUser(user.id);
      if (error) errors.push(`Auth user cleanup (${safeErrorCode(error)})`);
    } catch (error) { errors.push(`Auth user cleanup (${safeErrorCode(error)})`); }
  }
  if (errors.length) evidence.cleanup.syntheticDataErrors = errors.map((x) => x.replace(/\b[a-f0-9-]{36}\b/gi, '[id]'));
}

async function deleteAndVerifyBranch() {
  if (!cleanupArmed || !branchRecord) return;
  evidence.cleanup.attempted = true;
  await cleanupSyntheticRows();
  await managementRequest('DELETE', `/branches/${encodeURIComponent(evidence.targetProjectRef)}`);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const branches = await managementRequest('GET', `/projects/${PRODUCTION_REF}/branches`);
    const list = Array.isArray(branches) ? branches : branches?.branches;
    if (Array.isArray(list) && !list.some((branch) => branch.project_ref === evidence.targetProjectRef || branch.id === branchRecord.id)) {
      evidence.cleanup.verifiedAbsent = true;
      record('temporary branch deleted and absent from parent branch inventory', true);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  fail('Temporary branch deletion was not verified within 90 seconds', 'branch_cleanup_unverified');
}

async function main() {
  const targetRef = required('FINE_DIET_RLS_TARGET_REF');
  const expectedRef = required('FINE_DIET_RLS_EXPECTED_REF');
  const branchName = required('FINE_DIET_RLS_BRANCH_NAME');
  const approval = required('FINE_DIET_RLS_COST_APPROVED');
  if (approval !== 'YES') fail('FINE_DIET_RLS_COST_APPROVED must be YES after explicit fresh cost approval', 'cost_approval_missing');
  validateRef(targetRef, 'FINE_DIET_RLS_TARGET_REF');
  validateRef(expectedRef, 'FINE_DIET_RLS_EXPECTED_REF');
  if (targetRef !== expectedRef) fail('Explicit target and expected project references differ', 'project_ref_mismatch');
  if (!/^fine-diet-pr225-rls-[0-9]{8}t[0-9]{6}z$/.test(branchName)) {
    fail('Branch name must use fine-diet-pr225-rls-<UTC timestamp>', 'invalid_branch_name');
  }
  await verifyBranchIdentity(targetRef, branchName);

  // After identity is proved, remaining readiness failures clean up this exact
  // ephemeral branch in the finally path.
  publishableKey = required('SUPABASE_PUBLISHABLE_KEY');
  const secretKey = required('SUPABASE_SECRET_KEY');
  const passfile = required('PGPASSFILE');
  const passStat = await stat(passfile).catch(() => null);
  if (!passStat?.isFile()) fail('PGPASSFILE must point to an existing protected passfile', 'missing_passfile');
  if ((passStat.mode & 0o077) !== 0) fail('PGPASSFILE must not be readable by group or others', 'unsafe_passfile_permissions');
  dbEnv = { ...process.env };
  for (const name of [
    'PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGPASSWORD', 'PGOPTIONS', 'DATABASE_URL',
    'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY',
  ]) delete dbEnv[name];
  Object.assign(dbEnv, {
    PGHOST: `db.${targetRef}.supabase.co`, PGPORT: '5432', PGUSER: 'postgres', PGDATABASE: 'postgres',
    PGSSLMODE: 'require', PGPASSFILE: passfile, PGAPPNAME: 'fine-diet-pr225-rls-hosted-check',
  });
  const psqlCheck = psql(['--quiet', '--no-align', '--tuples-only'], 'SELECT current_setting(\'server_version\');\n');
  evidence.postgresVersion = psqlCheck.trim().split(/\r?\n/).at(-1);
  if (!evidence.postgresVersion) fail('Could not verify target PostgreSQL version', 'database_identity_failed');
  record('direct TLS database connection to branch-ref-derived host', true, { postgresVersion: evidence.postgresVersion });

  projectUrl = `https://${targetRef}.supabase.co`;
  adminClient = createClient(projectUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await psqlFile(hostedSetup);
  evidence.hostedDatabaseWrites = true;
  record('hosted-safe targeted schema setup applied', true);
  await psqlFile(candidateMigration);
  record('unchanged PR #225 migration applied to isolated branch', true);

  const runId = branchName.slice('fine-diet-pr225-rls-'.length);
  const runSlug = runId.replaceAll('t', '').replaceAll('z', '');
  const users = {
    runSlug,
    entitled: await authUser('entitled', runId, publishableKey, projectUrl),
    none: await authUser('none', runId, publishableKey, projectUrl),
    assigned: await authUser('assigned', runId, publishableKey, projectUrl),
    expired: await authUser('expired', runId, publishableKey, projectUrl),
    future: await authUser('future', runId, publishableKey, projectUrl),
    admin: await authUser('admin', runId, publishableKey, projectUrl),
  };
  syntheticRows = await seedFixture(users);
  evidence.syntheticActors = ['entitled', 'no-entitlement', 'active-assignment', 'expired-entitlement', 'future-entitlement', 'admin'];
  evidence.httpProtocol = 'Supabase Auth Admin + password sign-in, then real PostgREST requests with publishable key and Auth-issued bearer tokens';
  await runHostedScenarios(syntheticRows);
  recapturePerformance(syntheticRows);
}

async function writeEvidence() {
  evidence.finishedAt = new Date().toISOString();
  evidence.targetProjectRef ??= process.env.FINE_DIET_RLS_TARGET_REF || null;
  evidence.targetBranchName ??= process.env.FINE_DIET_RLS_BRANCH_NAME || null;
  if (failureLabel) evidence.failureLabel = failureLabel;
  evidence.cleanup.armed = cleanupArmed;
  const defaultEvidence = path.join('/private/tmp', `fine-diet-pr225-hosted-${Date.now()}.json`);
  const outputPath = process.env.FINE_DIET_RLS_EVIDENCE_PATH || defaultEvidence;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600).catch(() => {});
  process.stdout.write(`Evidence manifest: ${outputPath}\n`);
}

try {
  await main();
} catch (error) {
  failureLabel ||= error?.message || 'hosted_runner_failed';
  process.stderr.write(`STOP: ${failureLabel}\n`);
  process.exitCode = 1;
} finally {
  if (cleanupArmed) {
    try { await deleteAndVerifyBranch(); }
    catch (error) {
      evidence.cleanup.failure = error?.safeCode || 'cleanup_failed';
      process.stderr.write(`CLEANUP FAILURE: ${evidence.cleanup.failure}\n`);
      process.exitCode = 1;
    }
  }
  await writeEvidence();
}
