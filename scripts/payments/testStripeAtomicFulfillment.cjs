'use strict';
/** Real PostgreSQL function tests. Loopback disposable fixtures only; no provider calls. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
if (process.env.FD_STRIPE_LOCAL_DB_TEST !== '1' || process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGUSER !== 'postgres' || process.env.PGDATABASE !== 'postgres' ||
    process.env.PGPASSWORD !== 'isolated_fixture_only') throw new Error('Disposable local database required');
const pool = new Pool({ host:'127.0.0.1',port:Number(process.env.PGPORT || 5432),user:'postgres',
  password:'isolated_fixture_only',database:'postgres',ssl:false,max:16,connectionTimeoutMillis:5000,statement_timeout:6000 });
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${label}`); };
const ref = prefix => `${prefix}_${randomUUID().replace(/-/g,'')}`;
async function receipt(input, seconds = 60) {
  const next = { ...input, event_id:ref('evt_atomic'), token:randomUUID() };
  await pool.query(`INSERT INTO public.stripe_events(stripe_event_id,type,processed_at,processing_token,processing_lease_expires_at)
    VALUES($1,'checkout.session.completed',NULL,$2,clock_timestamp()+$3*interval '1 second')`,[next.event_id,next.token,seconds]);
  return next;
}
async function seed(slug = 'baseline') {
  const person = randomUUID(), instance = randomUUID(), offer = ref('atomic-offer'), customer = ref('cus'), sub = ref('sub'), session = ref('cs');
  await pool.query('INSERT INTO public.people(id) VALUES($1)',[person]);
  await pool.query('INSERT INTO public.offers(offer_key,assigns_program_slug) VALUES($1,$2)',[offer,slug]);
  await pool.query(`INSERT INTO public.stripe_customer_accounts(person_id,stripe_account_id,livemode,stripe_customer_id)
    VALUES($1,'acct_Fixture',false,$2)`,[person,customer]);
  await pool.query(`INSERT INTO public.stripe_offer_instances(id,person_id,offer_key,stripe_customer_id,stripe_checkout_session_id,stripe_subscription_id)
    VALUES($1,$2,$3,$4,$5,$6)`,[instance,person,offer,customer,session,sub]);
  return receipt({ instance_id:instance,person_id:person,offer_key:offer,customer_id:customer,
    account_id:'acct_Fixture',livemode:false,expected_revision:'0',source_ref:sub,state:'active',
    paid_through:new Date(Date.now()+86400000).toISOString(),
    identifiers:{stripe_subscription_id:sub},entitlements:[{entitlement_key:'journal',duration_days:null}],
    checkout_record:{stripe_checkout_session_id:session} });
}
async function commit(input, role='service_role') {
  assert(['service_role','anon','authenticated'].includes(role));
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return (await client.query('SELECT public.fd_commit_stripe_fulfillment($1::jsonb) AS result',[JSON.stringify(input)])).rows[0].result;
  } finally { await client.query('RESET ROLE'); client.release(); }
}
async function recordRisk(input, role='service_role') {
  assert(['service_role','anon','authenticated'].includes(role));
  const client=await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return (await client.query('SELECT public.fd_record_stripe_risk_review($1::jsonb) AS result',[JSON.stringify(input)])).rows[0].result;
  } finally { await client.query('RESET ROLE'); client.release(); }
}
async function riskReceipt(instanceInput, kind='dispute') {
  const value=await receipt(instanceInput);
  await pool.query("UPDATE public.stripe_events SET type='charge.dispute.created' WHERE stripe_event_id=$1",[value.event_id]);
  return {event_id:value.event_id,token:value.token,account_id:'acct_Fixture',livemode:false,risk_kind:kind,
    source_ref:instanceInput.source_ref,instance_id:instanceInput.instance_id,person_id:instanceInput.person_id,
    customer_id:instanceInput.customer_id};
}
async function state(input) {
  const [instance,entitlements,programs,events,checkouts] = await Promise.all([
    pool.query('SELECT status,fulfillment_revision::text AS revision,paid_through FROM public.stripe_offer_instances WHERE id=$1',[input.instance_id]),
    pool.query('SELECT id,entitlement_key,is_active,starts_at::text,ends_at::text,source_ref,stripe_is_recurring FROM public.person_entitlements WHERE person_id=$1 ORDER BY entitlement_key,id',[input.person_id]),
    pool.query('SELECT id,status,source_ref,auto_created FROM public.program_assignments WHERE person_id=$1 ORDER BY id',[input.person_id]),
    pool.query('SELECT processed_at IS NOT NULL AS completed FROM public.stripe_events WHERE stripe_event_id=$1',[input.event_id]),
    pool.query('SELECT count(*)::integer AS n FROM public.checkout_events WHERE person_id=$1',[input.person_id]),
  ]);
  return { instance:instance.rows[0], grants:entitlements.rows,programs:programs.rows,completed:events.rows[0].completed,checkouts:checkouts.rows[0].n };
}
async function unchangedFailure(input, pattern) {
  const before = await state(input);
  await assert.rejects(commit(input),pattern);
  assert.deepEqual(await state(input),before);
}
async function main() {
  let input = await seed();
  assert.equal((await commit(input)).status,'committed');
  let view = await state(input);
  assert.equal(view.instance.revision,'1'); assert.equal(view.instance.status,'active');
  assert.ok(Date.parse(view.instance.paid_through)>Date.now());
  assert.equal(view.grants[0].stripe_is_recurring,true); assert.ok(Date.parse(view.grants[0].ends_at)>Date.now());
  assert.equal(view.grants.length,1); assert.equal(view.programs.length,1); assert.equal(view.checkouts,1); assert.equal(view.completed,true);
  pass('purchase, grant, program, checkout and receipt commit together as service_role');
  const before = view;
  assert.equal((await commit(input)).status,'already_processed');
  assert.deepEqual(await state(input),before);
  pass('lost-response replay does not repeat business writes or advance revision');

  input = await seed();
  await unchangedFailure({...input,token:'wrong-owner'},/claim lost or expired/);
  await pool.query("UPDATE public.stripe_events SET processing_lease_expires_at=clock_timestamp()-interval '1 second' WHERE stripe_event_id=$1",[input.event_id]);
  await unchangedFailure(input,/claim lost or expired/);
  pass('wrong token and expired lease cannot change access');

  input = await seed();
  await pool.query("UPDATE public.stripe_offer_instances SET status='active' WHERE id=$1",[input.instance_id]);
  await pool.query("UPDATE public.stripe_offer_instances SET status='canceled' WHERE id=$1",[input.instance_id]);
  await pool.query("UPDATE public.stripe_offer_instances SET status='pending' WHERE id=$1",[input.instance_id]);
  assert.equal((await state(input)).instance.revision,'3');
  await unchangedFailure(input,/revision changed/);
  pass('revision fence catches ABA and legacy-writer changes, not just status changes');

  input = await seed();
  const rivals = await Promise.all(Array.from({length:12},()=>receipt(input)));
  const results = await Promise.allSettled(rivals.map(commitInput=>commit(commitInput)));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  results.filter(result=>result.status==='rejected').forEach(result=>assert.equal(result.reason.code,'40001'));
  view = await state(input);
  assert.equal(view.grants.length,1); assert.equal(view.programs.length,1); assert.equal(view.checkouts,1);
  assert.equal(view.instance.revision,'1');
  pass('12 different events for one purchase commit one revision; competitors must refetch');

  input = await seed(); await commit(input);
  const old = await receipt({...input,expected_revision:'1',checkout_record:null});
  const cancel = await receipt({...old,state:'ended',entitlements:[]});
  await commit(cancel);
  await unchangedFailure(old,/revision changed/);
  const retry = await receipt({...old,expected_revision:'2'}); await commit(retry);
  view = await state(retry);
  assert.equal(view.instance.status,'ended'); assert.equal(view.grants[0].is_active,false); assert.equal(view.programs[0].status,'inactive');
  pass('late grant cannot follow cancellation; even refreshed requests cannot reopen terminal purchases');

  input = await seed();
  const brokenGrant = {...input,entitlements:[...input.entitlements,{entitlement_key:'zz-invalid',duration_days:-1}]};
  await unchangedFailure(brokenGrant,/Invalid entitlement mapping/);
  assert.equal((await state(input)).grants.length,0);
  pass('failure after first entitlement insert rolls back every write');

  input = await seed();
  await unchangedFailure({...input,checkout_record:{stripe_checkout_session_id:'cs_wrong'}},/record mismatch/);
  assert.equal((await state(input)).programs.length,0);
  pass('late checkout-record failure rolls back instance, grants, program and completion');

  await pool.query("ALTER TABLE public.program_assignments ADD CONSTRAINT fixture_program_failure CHECK (program_slug <> 'fixture_fail')");
  input = await seed('fixture_fail'); await unchangedFailure(input,/fixture_program_failure/);
  pass('program-assignment failure rolls back paid-access grant and receipt');

  await pool.query(`CREATE FUNCTION public.fixture_slow_grant() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.entitlement_key='zz-slow' THEN PERFORM pg_sleep(1.3); END IF; RETURN NEW; END; $$`);
  await pool.query('CREATE TRIGGER fixture_slow_grant BEFORE INSERT ON public.person_entitlements FOR EACH ROW EXECUTE FUNCTION public.fixture_slow_grant()');
  input = await seed();
  await pool.query("UPDATE public.stripe_events SET processing_lease_expires_at=clock_timestamp()+interval '1 second' WHERE stripe_event_id=$1",[input.event_id]);
  await unchangedFailure({...input,entitlements:[...input.entitlements,{entitlement_key:'zz-slow',duration_days:1}]},/lease expired before commit/);
  pass('lease expiry during database work rolls back all side effects');

  input = await seed();
  await unchangedFailure({...input,account_id:'acct_Wrong'},/account or customer mapping/);
  await unchangedFailure({...input,livemode:true},/account or customer mapping/);
  pass('customer account and mode binding prevents cross-environment fulfillment');

  input = await seed(); await commit(input);
  await pool.query(`INSERT INTO public.person_entitlements(person_id,entitlement_key,source,source_ref)
    VALUES($1,'other-access','stripe','sub_other')`,[input.person_id]);
  await pool.query(`INSERT INTO public.program_assignments(person_id,program_slug,source_ref,auto_created,acquisition_source)
    VALUES($1,'manual-program','manual_other',false,'admin_grant')`,[input.person_id]);
  const suspended = await receipt({...input,expected_revision:'1',state:'canceled',checkout_record:null,entitlements:[]});
  await commit(suspended);
  view = await state(suspended);
  assert.equal(view.grants.find(grant=>grant.source_ref==='sub_other').is_active,true);
  assert.equal(view.programs.find(program=>program.source_ref==='manual_other').status,'active');
  assert.equal(view.programs.find(program=>program.source_ref===input.source_ref).status,'inactive');
  const recovered = await receipt({...input,expected_revision:'2',checkout_record:null}); await commit(recovered);
  view = await state(recovered);
  assert.equal(view.grants.filter(grant=>grant.source_ref===input.source_ref).length,1);
  assert.equal(view.programs.find(program=>program.source_ref===input.source_ref).status,'active');
  pass('suspend/recover affects only purchase-owned access and resumable program assignments');

  input = await seed(); input.entitlements=[{entitlement_key:'journal',duration_days:21}]; await commit(input);
  const originalGrant = (await state(input)).grants[0];
  await commit(await receipt({...input,expected_revision:'1',state:'canceled',checkout_record:null,entitlements:[]}));
  await commit(await receipt({...input,expected_revision:'2',checkout_record:null}));
  const restoredGrant = (await state(input)).grants[0];
  assert.equal(restoredGrant.id,originalGrant.id); assert.equal(restoredGrant.starts_at,originalGrant.starts_at); assert.equal(restoredGrant.ends_at,originalGrant.ends_at);
  pass('recovery preserves the exact original grant identity and time bounds');

  input = await seed(); await commit(input);
  await pool.query("UPDATE public.program_assignments SET status='completed' WHERE person_id=$1",[input.person_id]);
  await commit(await receipt({...input,expected_revision:'1',state:'canceled',checkout_record:null,entitlements:[]}));
  await commit(await receipt({...input,expected_revision:'2',checkout_record:null}));
  assert.equal((await state(input)).programs[0].status,'completed');
  pass('completed/manual program decisions are not automatically reactivated');

  input = await seed();
  await pool.query(`INSERT INTO public.person_entitlements(person_id,entitlement_key,source,source_ref)
    VALUES($1,'journal','manual','manual_existing')`,[input.person_id]);
  await commit(input);
  view=await state(input);
  assert.equal(view.grants.find(grant=>grant.source_ref==='manual_existing').is_active,true);
  assert.equal(view.grants.find(grant=>grant.source_ref===input.source_ref).is_active,true);
  pass('Stripe fulfillment preserves an independent manual entitlement alongside its own paid-through grant');

  input=await seed();
  await unchangedFailure({...input,person_id:randomUUID()},/attribution mismatch/);
  pass('person mismatch cannot fulfill a purchase or cross-write another person\'s grants');

  input = await seed();
  for (const role of ['anon','authenticated']) await assert.rejects(commit(input,role),/permission denied/);
  const privileges = await pool.query(`SELECT p.prosecdef AS definer,
    has_function_privilege('service_role','public.fd_commit_stripe_fulfillment(jsonb)','EXECUTE') AS service,
    has_function_privilege('anon','public.fd_commit_stripe_fulfillment(jsonb)','EXECUTE') AS anon,
    has_function_privilege('authenticated','public.fd_commit_stripe_fulfillment(jsonb)','EXECUTE') AS authenticated
    FROM pg_proc p WHERE p.oid='public.fd_commit_stripe_fulfillment(jsonb)'::regprocedure`);
  assert.deepEqual(privileges.rows[0],{definer:false,service:true,anon:false,authenticated:false});
  const protectedGates = await pool.query(`SELECT
    has_function_privilege('service_role','public.fd_expire_stripe_fulfillment(integer)','EXECUTE') AS expiry_service,
    has_function_privilege('anon','public.fd_expire_stripe_fulfillment(integer)','EXECUTE') AS expiry_anon,
    has_function_privilege('authenticated','public.fd_expire_stripe_fulfillment(integer)','EXECUTE') AS expiry_authenticated,
    has_function_privilege('service_role','public.fd_record_stripe_risk_review(jsonb)','EXECUTE') AS risk_service,
    has_function_privilege('anon','public.fd_record_stripe_risk_review(jsonb)','EXECUTE') AS risk_anon,
    has_function_privilege('authenticated','public.fd_record_stripe_risk_review(jsonb)','EXECUTE') AS risk_authenticated,
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.stripe_risk_reviews'::regclass) AS risk_rls`);
  assert.deepEqual(protectedGates.rows[0],{expiry_service:true,expiry_anon:false,expiry_authenticated:false,
    risk_service:true,risk_anon:false,risk_authenticated:false,risk_rls:true});
  for (const role of ['anon','authenticated']) await assert.rejects(recordRisk(await riskReceipt(input),role),/permission denied/);
  pass('SECURITY INVOKER fulfillment, expiry, and risk RPCs are service_role-only; risk queue RLS is enabled');
  await assert.rejects(pool.query('SELECT public.fd_expire_stripe_fulfillment(501)'),/Expiry batch/);
  pass('expiry worker rejects any requested batch over its hard cap');

  input=await seed();
  const risk=await riskReceipt(input,'dispute');
  assert.equal((await recordRisk(risk)).status,'committed');
  assert.equal((await pool.query("SELECT status FROM public.stripe_risk_reviews WHERE stripe_event_id=$1",[risk.event_id])).rows[0].status,'open');
  await unchangedFailure(input,/open Stripe risk review/);
  assert.equal((await state(input)).grants.length,0);
  pass('verified risk queue receipt holds later fulfillment without granting or revoking access');

  input=await seed();
  const racingRisk=await riskReceipt(input,'dispute');
  let riskClient=null, fulfillmentClient=null, fixtureFunction=false, fixtureTrigger=false;
  try {
    await pool.query(`CREATE FUNCTION public.fixture_delay_risk_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(1.2); RETURN NEW; END; $$`); fixtureFunction=true;
    await pool.query('CREATE TRIGGER fixture_delay_risk_insert BEFORE INSERT ON public.stripe_risk_reviews FOR EACH ROW EXECUTE FUNCTION public.fixture_delay_risk_insert()'); fixtureTrigger=true;
    riskClient=await pool.connect(); fulfillmentClient=await pool.connect();
    await riskClient.query('SET ROLE service_role'); await fulfillmentClient.query('SET ROLE service_role');
    const riskPending=riskClient.query('SELECT public.fd_record_stripe_risk_review($1::jsonb)',[JSON.stringify(racingRisk)])
      .then(()=>({ok:true}),error=>({ok:false,error}));
    let riskSleeping=false;
    for(let attempt=0;attempt<100;attempt++) {
      const observed=await pool.query("SELECT count(*)::integer AS n FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%fd_record_stripe_risk_review%'");
      if(observed.rows[0].n>0){riskSleeping=true;break;}
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert(riskSleeping,'risk event did not acquire its source lock before fulfillment race');
    const fulfillmentPending=fulfillmentClient.query('SELECT public.fd_commit_stripe_fulfillment($1::jsonb)',[JSON.stringify(input)])
      .then(()=>({ok:true}),error=>({ok:false,error}));
    const [riskResult,fulfillmentResult]=await Promise.all([riskPending,fulfillmentPending]);
    assert.equal(riskResult.ok,true);
    assert.equal(fulfillmentResult.ok,false);
    assert.match(fulfillmentResult.error.message,/open Stripe risk review/);
  } finally {
    if(riskClient){try{await riskClient.query('RESET ROLE');}catch{} riskClient.release();}
    if(fulfillmentClient){try{await fulfillmentClient.query('RESET ROLE');}catch{} fulfillmentClient.release();}
    if(fixtureTrigger) await pool.query('DROP TRIGGER fixture_delay_risk_insert ON public.stripe_risk_reviews');
    if(fixtureFunction) await pool.query('DROP FUNCTION public.fixture_delay_risk_insert()');
  }
  assert.equal((await state(input)).grants.length,0);
  pass('simultaneous dispute review and fulfillment serialize on the source; review hold wins before entitlement grant');

  input=await seed();
  await commit(input);
  const cutoffRows=await pool.query('SELECT paid_through FROM public.stripe_offer_instances WHERE id=$1',[input.instance_id]);
  const cutoff=cutoffRows.rows[0].paid_through;
  const boundary=await pool.query(`SELECT
    (SELECT ends_at FROM public.person_entitlements WHERE person_id=$1 AND source_ref=$2)>$3::timestamptz-interval '1 microsecond' AS before_cutoff,
    (SELECT ends_at FROM public.person_entitlements WHERE person_id=$1 AND source_ref=$2)>$3::timestamptz AS at_cutoff,
    (SELECT active_to FROM public.program_assignments WHERE person_id=$1 AND source_ref=$2)>$3::timestamptz AS assignment_at_cutoff`,[input.person_id,input.source_ref,cutoff]);
  assert.deepEqual(boundary.rows[0],{before_cutoff:true,at_cutoff:false,assignment_at_cutoff:false});
  await pool.query("UPDATE public.stripe_offer_instances SET paid_through=clock_timestamp() WHERE id=$1",[input.instance_id]);
  await pool.query(`INSERT INTO public.person_entitlements(person_id,entitlement_key,source,source_ref,is_active)
    VALUES($1,'manual-access','manual','manual_fixture',true)`,[input.person_id]);
  await pool.query(`INSERT INTO public.program_assignments(person_id,program_slug,source_ref,auto_created,acquisition_source,status)
    VALUES($1,'manual-program','manual_fixture',false,'admin_grant','active')`,[input.person_id]);
  const expired=await pool.query('SELECT public.fd_expire_stripe_fulfillment(100) AS result');
  assert.equal(expired.rows[0].result.expired_purchases,1);
  assert.equal((await pool.query("SELECT is_active FROM public.person_entitlements WHERE person_id=$1 AND source_ref=$2",[input.person_id,input.source_ref])).rows[0].is_active,false);
  assert.equal((await pool.query("SELECT status FROM public.program_assignments WHERE person_id=$1 AND source_ref=$2",[input.person_id,input.source_ref])).rows[0].status,'inactive');
  assert.equal((await pool.query("SELECT is_active FROM public.person_entitlements WHERE person_id=$1 AND source_ref='manual_fixture'",[input.person_id])).rows[0].is_active,true);
  assert.equal((await pool.query("SELECT status FROM public.program_assignments WHERE person_id=$1 AND source_ref='manual_fixture'",[input.person_id])).rows[0].status,'active');
  assert.equal((await pool.query('SELECT (public.fd_expire_stripe_fulfillment(100)->>\'expired_purchases\')::integer AS n')).rows[0].n,0);
  pass('cutoff expiry is idempotent and changes only same-subscription grants and purchase-created assignments');

  const renewed=await receipt({...input,expected_revision:'3',checkout_record:null});
  renewed.paid_through=new Date(Date.now()+86400000).toISOString();
  assert.equal((await commit(renewed)).status,'committed');
  const renewedGrant=(await pool.query("SELECT is_active,ends_at>now() AS current FROM public.person_entitlements WHERE person_id=$1 AND source_ref=$2",[input.person_id,input.source_ref])).rows[0];
  const renewedAssignment=(await pool.query("SELECT status,active_to>now() AS current FROM public.program_assignments WHERE person_id=$1 AND source_ref=$2",[input.person_id,input.source_ref])).rows[0];
  assert.equal(renewedGrant.is_active,true); assert.equal(renewedGrant.current,true);
  assert.equal(renewedAssignment.status,'active'); assert.equal(renewedAssignment.current,true);
  pass('verified late renewal reuses the same Stripe grant and tracked assignment after no-event expiry');
  console.log(`RESULT: ${passed} PostgreSQL-backed atomic fulfillment checks passed`);
}
main().catch(error=>{ console.error(error); process.exitCode=1; }).finally(()=>pool.end());
