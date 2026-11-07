'use strict';
/** Verifies the ordered additive migrations can roll back as one isolated unit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
if (process.env.FD_STRIPE_LOCAL_DB_TEST !== '1' || process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGUSER !== 'postgres' || process.env.PGDATABASE !== 'postgres' ||
    process.env.PGPASSWORD !== 'isolated_fixture_only') throw new Error('Disposable local database required');
const pool = new Pool({ host:'127.0.0.1',port:Number(process.env.PGPORT || 5432),user:'postgres',
  password:'isolated_fixture_only',database:'postgres',ssl:false,max:1,connectionTimeoutMillis:5000,statement_timeout:10000 });
const migrationFiles = [
  'scripts/sql/stripeCustomerAccountsPrelive.sql',
  'scripts/sql/stripeWebhookProcessingLeasePrelive.sql',
  'scripts/sql/stripeAtomicFulfillmentPrelive.sql',
  'scripts/sql/stripeEntitlementExpiryPrelive.sql',
];
function unwrap(sql) {
  return sql.replace(/^\s*BEGIN\s*;\s*/i, '').replace(/\s*COMMIT\s*;\s*$/i, '');
}
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of migrationFiles) await client.query(unwrap(fs.readFileSync(path.join(process.cwd(), file), 'utf8')));
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
  const result = await pool.query(`SELECT
    to_regclass('public.stripe_customer_accounts') IS NULL AS identity_absent,
    NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stripe_events' AND column_name='processing_token') AS lease_absent,
    NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stripe_offer_instances' AND column_name='paid_through') AS cutoff_absent,
    to_regclass('public.stripe_risk_reviews') IS NULL AS risk_table_absent,
    to_regprocedure('public.fd_commit_stripe_fulfillment(jsonb)') IS NULL AS fulfillment_absent,
    to_regprocedure('public.fd_record_stripe_risk_review(jsonb)') IS NULL AS risk_rpc_absent,
    to_regprocedure('public.fd_expire_stripe_fulfillment(integer)') IS NULL AS expiry_absent`);
  assert.deepEqual(result.rows[0], { identity_absent:true,lease_absent:true,cutoff_absent:true,
    risk_table_absent:true,fulfillment_absent:true,risk_rpc_absent:true,expiry_absent:true });
  console.log('PASS ordered Payments migrations roll back without partial schema changes');
}
main().catch(error=>{ console.error(error); process.exitCode=1; }).finally(()=>pool.end());
