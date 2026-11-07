'use strict';
/** Kill only our own disposable-database worker after it has started fulfillment. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
if (process.env.FD_STRIPE_LOCAL_DB_TEST !== '1' || process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGUSER !== 'postgres' || process.env.PGDATABASE !== 'postgres' ||
    process.env.PGPASSWORD !== 'isolated_fixture_only') throw new Error('Disposable local database required');
const pool = new Pool({host:'127.0.0.1',port:Number(process.env.PGPORT||5432),user:'postgres',
  password:'isolated_fixture_only',database:'postgres',ssl:false,max:3,application_name:'fd-stripe-crash-fixture',statement_timeout:8000});
async function main() {
  const person=randomUUID(), instance=randomUUID(), key=randomUUID().replace(/-/g,''), offer=`crash_${key}`;
  await pool.query('INSERT INTO public.people(id) VALUES($1)',[person]);
  await pool.query("INSERT INTO public.offers(offer_key,assigns_program_slug) VALUES($1,'crash-test')",[offer]);
  await pool.query("INSERT INTO public.stripe_customer_accounts(person_id,stripe_account_id,livemode,stripe_customer_id) VALUES($1,'acct_Fixture',false,$2)",[person,`cus_${key}`]);
  await pool.query("INSERT INTO public.stripe_offer_instances(id,person_id,offer_key,stripe_customer_id,stripe_checkout_session_id,stripe_subscription_id) VALUES($1,$2,$3,$4,$5,$6)",[instance,person,offer,`cus_${key}`,`cs_${key}`,`sub_${key}`]);
  await pool.query("INSERT INTO public.stripe_events(stripe_event_id,type,processing_token,processing_lease_expires_at) VALUES($1,'checkout.session.completed','crash-token',clock_timestamp()+interval '1 minute')",[`evt_${key}`]);
  await pool.query(`CREATE FUNCTION public.fixture_crash_delay() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.program_slug='crash-test' THEN PERFORM pg_sleep(5); END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER fixture_crash_delay BEFORE INSERT ON public.program_assignments FOR EACH ROW EXECUTE FUNCTION public.fixture_crash_delay()');
  const input={instance_id:instance,person_id:person,offer_key:offer,customer_id:`cus_${key}`,account_id:'acct_Fixture',livemode:false,
    expected_revision:'0',event_id:`evt_${key}`,token:'crash-token',source_ref:`sub_${key}`,state:'active',
    paid_through:new Date(Date.now()+86400000).toISOString(),
    entitlements:[{entitlement_key:'journal',duration_days:null}],checkout_record:{stripe_checkout_session_id:`cs_${key}`}};
  const worker=await pool.connect(); worker.on('error',()=>{});
  try {
    const pid=(await worker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await worker.query('SET ROLE service_role');
    // Attach the rejection handler immediately: terminating a backend is expected.
    const pending=worker.query('SELECT public.fd_commit_stripe_fulfillment($1::jsonb)',[JSON.stringify(input)])
      .then(()=>({succeeded:true}),error=>({succeeded:false,code:error.code}));
    let sleeping=false;
    for(let attempt=0;attempt<100;attempt++) {
      const observed=await pool.query("SELECT wait_event FROM pg_stat_activity WHERE pid=$1 AND application_name='fd-stripe-crash-fixture'",[pid]);
      if(observed.rows[0]?.wait_event==='PgSleep'){sleeping=true;break;}
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert(sleeping,'worker did not reach the post-grant program insert');
    assert.equal((await pool.query('SELECT pg_terminate_backend($1) AS killed',[pid])).rows[0].killed,true);
    assert.equal((await pending).succeeded,false);
  } finally { worker.release(true); }
  const check=await pool.query(`SELECT
    (SELECT count(*)::integer FROM public.person_entitlements WHERE person_id=$1) AS grants,
    (SELECT count(*)::integer FROM public.program_assignments WHERE person_id=$1) AS programs,
    (SELECT count(*)::integer FROM public.checkout_events WHERE person_id=$1) AS checkouts,
    (SELECT processed_at IS NOT NULL FROM public.stripe_events WHERE stripe_event_id=$2) AS completed,
    (SELECT fulfillment_revision::text FROM public.stripe_offer_instances WHERE id=$3) AS revision`,[person,`evt_${key}`,instance]);
  assert.deepEqual(check.rows[0],{grants:0,programs:0,checkouts:0,completed:false,revision:'0'});
  console.log('PASS actual worker termination rolls back grants, program, checkout, revision and receipt');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
