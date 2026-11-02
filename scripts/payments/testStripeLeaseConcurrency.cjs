'use strict';
/**
 * Exercise the actual TypeScript receipt store against disposable PostgreSQL.
 * The adapter translates its small PostgREST query surface into parameterized
 * SQL. This tests database concurrency, not PostgREST HTTP or Stripe delivery.
 * No production connection or Stripe/Supabase credentials are accepted.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const ts = require('typescript');

if (process.env.FD_STRIPE_LOCAL_DB_TEST !== '1' ||
    process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGUSER !== 'postgres' ||
    process.env.PGDATABASE !== 'postgres' ||
    process.env.PGPASSWORD !== 'isolated_fixture_only') {
  throw new Error('Refusing to run outside the explicitly enabled disposable loopback fixture');
}
const pool = new Pool({
  host: '127.0.0.1', port: Number(process.env.PGPORT || 5432),
  user: 'postgres', password: 'isolated_fixture_only', database: 'postgres',
  ssl: false, max: 16, connectionTimeoutMillis: 5000, statement_timeout: 5000,
});
const columns = new Set(['stripe_event_id', 'type', 'created_at', 'processed_at', 'processing_token', 'processing_lease_expires_at']);
const identifier = name => {
  assert(columns.has(name), `Unexpected test column: ${name}`);
  return `"${name}"`;
};
function from(table) {
  assert.equal(table, 'stripe_events');
  let operation = 'select', payload = {}, selected = '*';
  const filters = [];
  const chain = {
    insert(value) { operation = 'insert'; payload = value; return chain; },
    update(value) { operation = 'update'; payload = value; return chain; },
    select(value) { selected = value; return chain; },
    eq(key, value) { filters.push({ key, value, kind: 'eq' }); return chain; },
    is(key, value) { assert.equal(value, null); filters.push({ key, kind: 'null' }); return chain; },
    or(expression) {
      const prefix = 'processing_lease_expires_at.is.null,processing_lease_expires_at.lte.';
      assert(expression.startsWith(prefix), 'Unexpected lease predicate');
      const value = expression.slice(prefix.length);
      assert(Number.isFinite(Date.parse(value)), 'Invalid lease timestamp');
      filters.push({ key: 'processing_lease_expires_at', kind: 'expired', value });
      return chain;
    },
    maybeSingle() { return execute(true); },
    then(resolve, reject) { return execute(false).then(resolve, reject); },
  };
  async function execute(single) {
    const values = [];
    const param = value => { values.push(value); return `$${values.length}`; };
    const selection = selected === '*' ? '*' : selected.split(',').map(x => identifier(x.trim())).join(', ');
    let sql;
    if (operation === 'insert') {
      const entries = Object.entries(payload);
      sql = `INSERT INTO public.stripe_events (${entries.map(([key]) => identifier(key)).join(',')}) VALUES (${entries.map(([,value]) => param(value)).join(',')})`;
    } else {
      sql = operation === 'select'
        ? `SELECT ${selection} FROM public.stripe_events`
        : `UPDATE public.stripe_events SET ${Object.entries(payload).map(([key,value]) => `${identifier(key)}=${param(value)}`).join(',')}`;
      if (filters.length) {
        sql += ' WHERE ' + filters.map(filter => {
          const key = identifier(filter.key);
          if (filter.kind === 'null') return `${key} IS NULL`;
          if (filter.kind === 'expired') return `(${key} IS NULL OR ${key} <= ${param(filter.value)}::timestamptz)`;
          return `${key} = ${param(filter.value)}`;
        }).join(' AND ');
      }
      if (operation === 'update') sql += ` RETURNING ${selection}`;
    }
    try {
      const result = await pool.query(sql, values);
      if (single && result.rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      return { data: single ? (result.rows[0] || null) : result.rows, error: null };
    } catch (error) {
      return { data: null, error: { code: error.code, message: error.message } };
    }
  }
  return chain;
}
const filename = path.resolve('lib/stripe/stripeWebhookEventStore.ts');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const implementation = new Module(filename, module);
implementation.filename = filename;
implementation.paths = Module._nodeModulePaths(path.dirname(filename));
implementation.require = name => {
  if (name === '@/lib/supabaseServerClient') return { supabaseAdmin: { from } };
  if (name === 'node:crypto') return require(name);
  throw new Error(`Unexpected dependency in isolated receipt test: ${name}`);
};
implementation._compile(compiled, filename);
const { claimStripeEvent, completeStripeEvent, releaseStripeEvent } = implementation.exports;
const event = suffix => ({ id: `evt_local_${suffix}_${randomUUID().replace(/-/g, '')}`, type: 'checkout.session.completed', created: 1762000000 });
let passed = 0;
function pass(label) { passed += 1; console.log(`PASS ${label}`); }
async function exclusiveClaim(identity) {
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => claimStripeEvent(identity)));
  const winners = attempts.filter(result => result.status === 'fulfilled');
  assert.equal(winners.length, 1, 'exactly one delivery owns the receipt');
  assert.equal(winners[0].value.status, 'claimed');
  for (const result of attempts.filter(result => result.status === 'rejected')) {
    assert.match(String(result.reason), /already being processed/);
  }
  return winners[0].value.token;
}
async function read(identity) {
  return (await pool.query('SELECT * FROM public.stripe_events WHERE stripe_event_id=$1', [identity.id])).rows[0];
}
async function main() {
  const initial = event('race');
  const firstToken = await exclusiveClaim(initial);
  assert.equal((await read(initial)).processing_token, firstToken);
  pass('12 concurrent first deliveries produce one owner');

  await assert.rejects(completeStripeEvent(initial.id, 'wrong-token'), /exclusive claim/);
  await releaseStripeEvent(initial.id, 'wrong-token');
  assert.equal((await read(initial)).processing_token, firstToken);
  pass('wrong owner cannot complete or release a receipt');

  await completeStripeEvent(initial.id, firstToken);
  const duplicates = await Promise.all(Array.from({ length: 12 }, () => claimStripeEvent(initial)));
  assert(duplicates.every(value => value.status === 'processed'));
  assert.equal((await read(initial)).processing_token, null);
  pass('completed receipt acknowledges duplicates without reprocessing');

  const released = event('release');
  const releasedClaim = await claimStripeEvent(released);
  await releaseStripeEvent(released.id, releasedClaim.token);
  const retryClaim = await claimStripeEvent(released);
  assert.equal(retryClaim.status, 'claimed');
  assert.notEqual(retryClaim.token, releasedClaim.token);
  pass('failed delivery can release and reclaim immediately');

  const crashed = event('crash');
  const oldClaim = await claimStripeEvent(crashed);
  await pool.query("UPDATE public.stripe_events SET processing_lease_expires_at=now()-interval '1 second' WHERE stripe_event_id=$1", [crashed.id]);
  const newToken = await exclusiveClaim(crashed);
  assert.notEqual(newToken, oldClaim.token);
  pass('12 concurrent retries reclaim an expired lease once');

  await assert.rejects(completeStripeEvent(crashed.id, oldClaim.token), /exclusive claim/);
  await releaseStripeEvent(crashed.id, oldClaim.token);
  assert.equal((await read(crashed)).processing_token, newToken);
  await completeStripeEvent(crashed.id, newToken);
  pass('stale worker cannot overwrite the new owner receipt');

  const legacyPending = event('legacy_pending');
  await pool.query('INSERT INTO public.stripe_events(stripe_event_id,type) VALUES ($1,$2)', [legacyPending.id, legacyPending.type]);
  assert.equal((await claimStripeEvent(legacyPending)).status, 'claimed');
  const legacyDone = event('legacy_done');
  await pool.query('INSERT INTO public.stripe_events(stripe_event_id,type,processed_at) VALUES ($1,$2,now())', [legacyDone.id, legacyDone.type]);
  assert.equal((await claimStripeEvent(legacyDone)).status, 'processed');
  pass('historical pending and completed receipts retain their intended semantics');

  const left = event('independent_a'), right = event('independent_b');
  const separate = await Promise.all([claimStripeEvent(left), claimStripeEvent(right)]);
  assert(separate.every(value => value.status === 'claimed'));
  pass('different events remain independently processable');

  for (const role of ['anon', 'authenticated']) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(client.query('SELECT * FROM public.stripe_customer_accounts'), error => error.code === '42501');
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  pass('anon and authenticated cannot read scoped customer identities');
  console.log(`RESULT: ${passed} PostgreSQL-backed receipt/isolation checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
