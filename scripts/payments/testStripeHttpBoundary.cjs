'use strict';
/**
 * Disposable application/HTTP integration test. This is NOT a Stripe purchase.
 * Real: route, micro raw body, Stripe SDK/signatures, Supabase JS, PostgREST, SQL.
 * Simulated: Stripe service responses on a loopback HTTP fixture. No hosted Auth.
 * No production secrets, connections, account changes, or remote payments.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const ts = require('typescript');

if (process.env.FD_STRIPE_LOCAL_DB_TEST !== '1' || process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGUSER !== 'postgres' || process.env.PGDATABASE !== 'postgres' ||
    process.env.PGPASSWORD !== 'isolated_fixture_only' || process.env.PGPORT !== '5432') {
  throw new Error('Only the explicitly enabled disposable loopback database is accepted');
}
for (const name of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL']) {
  if (process.env[name]) throw new Error(`Refusing pre-existing credential/config variable: ${name}`);
}
const POSTGREST_PORT = 3300;
const POSTGREST_IMAGE = 'postgrest/postgrest:v12.2.12';
const pool = new Pool({ host:'127.0.0.1', port:5432, user:'postgres',
  password:'isolated_fixture_only', database:'postgres', ssl:false, max:16,
  connectionTimeoutMillis:5000, statement_timeout:10000 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'fd-stripe-http-'));
const containerName = `fd-stripe-http-${process.pid}`;
const jwtSecret = randomBytes(48).toString('hex');
const webhookSecret = `whsec_${randomBytes(32).toString('hex')}`;
const account = 'acct_LocalHttpFixture';
let startedContainer = false;
let gateway, provider, app;
let serviceClient, stripe, handler;
let droppedRpcResponse = false;
let passed = 0;
const dbTraffic = [], providerTraffic = [], snapshots = new Map();
const pass = label => { passed++; console.log(`PASS ${label}`); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role) {
  const now = Math.floor(Date.now()/1000);
  const payload = `${b64({alg:'HS256',typ:'JWT'})}.${b64({role,iat:now,exp:now+1800})}`;
  return `${payload}.${createHmac('sha256',jwtSecret).update(payload).digest('base64url')}`;
}
async function listen(server) {
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  return `http://127.0.0.1:${server.address().port}`;
}
const json = (res, status, data) => { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
const authOptions = { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false };
let gatewayUrl, appUrl;
function client(role) {
  const key = jwt(role);
  return createClient(gatewayUrl,key,{auth:authOptions,global:{fetch:async(input,init)=>{
    const url = new URL(typeof input==='string'?input:input.url || input.toString());
    assert.equal(url.origin,gatewayUrl,'Supabase request left the disposable gateway');
    assert(url.pathname.startsWith('/rest/v1/'),'Unexpected Supabase service request');
    return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(12000)});
  }}});
}

// Compile actual checked-out source; replace only service configuration and the
// forbidden legacy program writer. All business/receipt/RPC code is real.
const loaded = new Map();
function loadSource(relative) {
  const filename = path.resolve(relative);
  if (loaded.has(filename)) return loaded.get(filename).exports;
  const source = fs.readFileSync(filename,'utf8');
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const result = new Module(filename,module);
  result.filename=filename; result.paths=Module._nodeModulePaths(path.dirname(filename)); loaded.set(filename,result);
  result.require = name => {
    if (name==='@/lib/supabaseServerClient') return {
      supabaseAdmin:serviceClient,
      createSupabaseAdmin:()=>serviceClient,
    };
    if (name==='@/lib/stripe/stripeServer' || (name==='./stripeServer' && filename.includes('/lib/stripe/'))) return {stripe};
    if (name==='@/lib/plans/programAssignmentAutomationServerService') return {
      handleStripeCheckoutCompleted:()=>{throw new Error('Legacy program writer must never run in this test');},
    };
    let target;
    if (name.startsWith('@/lib/stripe/') || name==='@/lib/access/offerEntitlementMappings') target=path.resolve(name.slice(2)+'.ts');
    else if (name.startsWith('./') && filename.includes('/lib/stripe/')) target=path.resolve(path.dirname(filename),name+'.ts');
    if (target) return loadSource(target);
    if (['micro','stripe','node:crypto'].includes(name)) return require(name);
    throw new Error(`Unexpected dependency in isolated application test: ${name}`);
  };
  result._compile(compiled,filename);
  return result.exports;
}
async function start() {
  const envFile=path.join(tmp,'postgrest.env');
  fs.writeFileSync(envFile,[
    'PGRST_DB_URI=postgresql://postgres:isolated_fixture_only@127.0.0.1:5432/postgres',
    'PGRST_DB_SCHEMAS=public','PGRST_DB_ANON_ROLE=anon',`PGRST_JWT_SECRET=${jwtSecret}`,
    'PGRST_SERVER_HOST=127.0.0.1',`PGRST_SERVER_PORT=${POSTGREST_PORT}`,
    'PGRST_DB_POOL=16','PGRST_LOG_LEVEL=error',
  ].join('\n')+'\n',{mode:0o600});
  execFileSync('docker',['run','--rm','-d','--name',containerName,'--network','host',
    '--env-file',envFile,POSTGREST_IMAGE],{stdio:'pipe',timeout:120000});
  startedContainer=true;
  for(let i=0;i<60;i++) {
    try { const response=await fetch(`http://127.0.0.1:${POSTGREST_PORT}/`,{signal:AbortSignal.timeout(1000)});
      if(response.ok) break; if(i===59) throw new Error('PostgREST did not initialize');
    } catch(error) { if(i===59) throw error; }
    await sleep(250);
  }
  gateway=http.createServer((req,res)=>{
    if(!req.url.startsWith('/rest/v1/')) return json(res,404,{error:'Unknown fixture gateway path'});
    const route=req.url.slice('/rest/v1'.length);
    dbTraffic.push({method:req.method,path:route.split('?')[0]});
    const outgoing=http.request({host:'127.0.0.1',port:POSTGREST_PORT,path:route,
      method:req.method,headers:{...req.headers,host:`127.0.0.1:${POSTGREST_PORT}`}},incoming=>{
      if(droppedRpcResponse && req.method==='POST' && route==='/rpc/fd_commit_stripe_fulfillment' && incoming.statusCode===200) {
        droppedRpcResponse=false; incoming.resume(); incoming.on('end',()=>json(res,502,{message:'Simulated lost RPC response'})); return;
      }
      res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);
    });
    outgoing.on('error',()=>json(res,502,{error:'Fixture database transport unavailable'}));
    req.pipe(outgoing);
  });
  gatewayUrl=await listen(gateway); serviceClient=client('service_role');
  provider=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');providerTraffic.push(url.pathname);
    if(req.method!=='GET') return json(res,405,{error:{type:'invalid_request_error',message:'No fixture mutations'}});
    const segments=url.pathname.split('/');
    let fixture;
    if(url.pathname.startsWith('/v1/checkout/sessions/')) fixture=[...snapshots.values()].find(f=>f.session.id===segments.at(-1));
    else if(url.pathname.startsWith('/v1/subscriptions/')) fixture=snapshots.get(segments.at(-1));
    else if(url.pathname==='/v1/invoices') fixture=snapshots.get(url.searchParams.get('subscription'));
    if(!fixture) return json(res,404,{error:{type:'invalid_request_error',message:'Unknown fixture'}});
    if(fixture.providerFailure) return json(res,503,{error:{type:'api_error',message:'Simulated provider outage'}});
    if(url.pathname.startsWith('/v1/checkout/sessions/')) return json(res,200,fixture.session);
    if(url.pathname.startsWith('/v1/subscriptions/')) return json(res,200,fixture.subscription);
    return json(res,200,{object:'list',data:fixture.paidInvoices,has_more:false,url:'/v1/invoices'});
  });
  const providerUrl=new URL(await listen(provider));
  stripe=new Stripe('sk_test_local_fixture_only',{host:providerUrl.hostname,port:Number(providerUrl.port),
    protocol:'http',maxNetworkRetries:0,timeout:5000});
  process.env.STRIPE_ACCOUNT_ID=account;process.env.STRIPE_SECRET_KEY='sk_test_local_fixture_only';
  process.env.STRIPE_WEBHOOK_SECRET=webhookSecret;process.env.STRIPE_ATOMIC_FULFILLMENT='1';
  handler=loadSource('pages/api/webhooks/stripe.ts').default;
  app=http.createServer(async(req,res)=>{
    if(req.url!=='/api/webhooks/stripe') return json(res,404,{error:'Unknown fixture route'});
    res.status=code=>{res.statusCode=code;return res;};
    res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
    try { await handler(req,res); } catch { json(res,500,{error:'Unhandled route exception'}); }
  });
  appUrl=await listen(app);
}
async function seed(options={}) {
  const id=randomUUID(),person=randomUUID(),suffix=id.replace(/-/g,'');
  const f={id,person,offer:`http-${suffix}`,customer:`cus_${suffix}`,sub:`sub_${suffix}`,sessionId:`cs_${suffix}`,
    providerFailure:false,paidInvoices:[]};
  await pool.query('INSERT INTO public.people(id) VALUES($1)',[person]);
  await pool.query('INSERT INTO public.offers(offer_key,assigns_program_slug,billing_model) VALUES($1,$2,$3)',[f.offer,'baseline','subscription']);
  await pool.query('INSERT INTO public.offer_entitlements(offer_key,entitlement_key,duration_days) VALUES($1,$2,$3)',[f.offer,'journal',null]);
  await pool.query('INSERT INTO public.stripe_customer_accounts(person_id,stripe_account_id,livemode,stripe_customer_id) VALUES($1,$2,false,$3)',[person,account,f.customer]);
  await pool.query('INSERT INTO public.stripe_offer_instances(id,person_id,offer_key,stripe_customer_id,stripe_checkout_session_id) VALUES($1,$2,$3,$4,$5)',[id,person,f.offer,f.customer,f.sessionId]);
  const now=Math.floor(Date.now()/1000),meta={person_id:person,offer_key:f.offer,billing_model:'subscription'};
  f.invoice={id:`in_${suffix}`,object:'invoice',customer:f.customer,livemode:false,currency:'usd',status:'paid',
    amount_remaining:0,post_payment_credit_notes_amount:0,status_transitions:{paid_at:now-50},
    parent:{type:'subscription_details',subscription_details:{subscription:f.sub}},
    lines:{object:'list',has_more:false,data:[{id:`il_${suffix}`,object:'line_item',invoice:`in_${suffix}`,
      livemode:false,currency:'usd',quantity:1,amount:2499,period:{start:now-100,end:now+86400},
      parent:{type:'subscription_item_details',subscription_item_details:{subscription:f.sub,subscription_item:`si_${suffix}`,proration:false}},
      pricing:{type:'price_details',price_details:{price:`price_${suffix}`}}}]}};
  f.subscription={id:f.sub,object:'subscription',livemode:false,customer:f.customer,status:'active',metadata:meta,
    latest_invoice:f.invoice,items:{object:'list',has_more:false,data:[{id:`si_${suffix}`,quantity:1,
      price:{id:`price_${suffix}`,currency:'usd',recurring:{usage_type:'licensed'}}}]}};
  f.session={id:f.sessionId,object:'checkout.session',livemode:false,customer:f.customer,mode:'subscription',
    status:'complete',payment_status:options.unpaid?'unpaid':'paid',subscription:f.sub,payment_intent:null,metadata:meta};
  snapshots.set(f.sub,f);return f;
}
function eventFor(f,type='checkout.session.completed') {
  return {id:`evt_${randomUUID().replace(/-/g,'')}`,object:'event',type,created:Math.floor(Date.now()/1000),livemode:false,
    data:{object:type.startsWith('checkout.')?structuredClone(f.session):type.startsWith('invoice.')?structuredClone(f.invoice):structuredClone(f.subscription)}};
}
async function deliver(event,options={}) {
  const payload=JSON.stringify(event);
  const signature=stripe.webhooks.generateTestHeaderString({payload,secret:webhookSecret,
    ...(options.old?{timestamp:Math.floor(Date.now()/1000)-600}:{})});
  const response=await fetch(`${appUrl}/api/webhooks/stripe`,{method:'POST',
    headers:{'Content-Type':'application/json',...(options.missing?{}:{'stripe-signature':signature})},
    body:options.tampered?payload+' ':payload,signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
}
async function readState(f) {
  const instance=(await pool.query('SELECT status,fulfillment_revision::text AS revision FROM public.stripe_offer_instances WHERE id=$1',[f.id])).rows[0];
  const grants=(await pool.query('SELECT id,is_active,starts_at,ends_at FROM public.person_entitlements WHERE person_id=$1',[f.person])).rows;
  const programs=(await pool.query('SELECT id,status FROM public.program_assignments WHERE person_id=$1',[f.person])).rows;
  const checkout=(await pool.query("SELECT count(*)::int n FROM public.checkout_events WHERE event_type='checkout_completed' AND person_id=$1",[f.person])).rows[0].n;
  return {instance,grants,programs,checkout};
}
async function receipt(event) {return (await pool.query('SELECT * FROM public.stripe_events WHERE stripe_event_id=$1',[event.id])).rows[0];}
function assertActive(state) {
  assert.equal(state.instance.status,'active');assert.equal(state.grants.length,1);assert.equal(state.grants[0].is_active,true);
  assert.equal(state.programs.length,1);assert.equal(state.programs[0].status,'active');
}
async function main() {
  await start();
  for(const role of ['anon','authenticated']) {
    const denied=client(role);
    for(const table of ['stripe_customer_accounts','person_entitlements','stripe_events','stripe_offer_instances']) {
      const result=await denied.from(table).select('*').limit(1);assert(result.error,`${role} could read ${table}`);
    }
    const result=await denied.rpc('fd_commit_stripe_fulfillment',{p_input:{}});
    assert(result.error && ['42501','PGRST202'].includes(result.error.code),'RPC must be inaccessible to client roles');
  }
  pass('real JWT roles deny client reads and fulfillment RPC over PostgREST HTTP');

  const f=await seed(),first=eventFor(f);
  for(const options of [{missing:true},{tampered:true},{old:true}]) {
    const before=dbTraffic.length,providerBefore=providerTraffic.length;
    assert.equal((await deliver(first,options)).status,400);assert.equal(dbTraffic.length,before);assert.equal(providerTraffic.length,providerBefore);
  }
  pass('real Stripe SDK rejects missing, altered and stale signatures before database/provider calls');
  for(const patch of [{livemode:true},{account:'acct_WrongFixture'}]) {
    const wrong={...first,...patch},before=dbTraffic.length;
    assert.equal((await deliver(wrong)).status,400);assert.equal(dbTraffic.length,before);
  }
  pass('signed wrong-account and live-mode events fail before persistence');

  assert.equal((await deliver(first)).status,200);
  const active=await readState(f);assertActive(active);assert.equal(active.checkout,1);assert((await receipt(first)).processed_at);
  assert(dbTraffic.some(r=>r.method==='POST'&&r.path==='/rpc/fd_commit_stripe_fulfillment'));
  pass('raw HTTP webhook traverses real SDKs and commits purchase, access, program and receipt');
  assert.equal((await deliver(first)).body.duplicate,true);assert.deepEqual(await readState(f),active);
  pass('redelivered signed event returns duplicate without new grants or revision changes');

  f.paidInvoices=[structuredClone(f.invoice)];
  f.subscription.latest_invoice={...structuredClone(f.invoice),id:`in_draft_${f.id}`,status:'draft',amount_remaining:2499};
  assert.equal((await deliver(eventFor(f,'customer.subscription.updated'))).status,200);assertActive(await readState(f));
  pass('actual HTTP invoice history preserves already-paid access during draft renewal');
  f.paidInvoices=[];f.subscription.status='past_due';f.subscription.latest_invoice.status='open';
  assert.equal((await deliver(eventFor(f,'invoice.payment_failed'))).status,200);
  const suspended=await readState(f);assert.equal(suspended.instance.status,'canceled');assert.equal(suspended.grants[0].is_active,false);assert.equal(suspended.programs[0].status,'inactive');
  pass('verified loss of paid coverage suspends purchase-specific grants and program atomically');
  f.subscription.status='active';f.subscription.latest_invoice=f.invoice;
  assert.equal((await deliver(eventFor(f,'invoice.paid'))).status,200);
  const recovered=await readState(f);assertActive(recovered);assert.equal(recovered.grants[0].id,active.grants[0].id);
  assert.deepEqual(recovered.grants[0].starts_at,active.grants[0].starts_at);
  pass('payment recovery over real HTTP restores the same grant and original start date');
  f.subscription.status='canceled';
  assert.equal((await deliver(eventFor(f,'customer.subscription.deleted'))).status,200);
  assert.equal((await deliver(eventFor(f,'invoice.paid'))).status,200);
  const ended=await readState(f);assert.equal(ended.instance.status,'ended');assert.equal(ended.grants[0].is_active,false);
  pass('late paid invoice after terminal cancellation cannot reopen access');

  const unpaid=await seed({unpaid:true});assert.equal((await deliver(eventFor(unpaid))).status,200);
  assert.equal((await readState(unpaid)).grants.length,0);
  unpaid.session.payment_status='paid';assert.equal((await deliver(eventFor(unpaid,'checkout.session.async_payment_succeeded'))).status,200);assertActive(await readState(unpaid));
  pass('unpaid checkout creates no access until signed asynchronous payment confirmation');
  const trial=await seed();trial.session.payment_status='no_payment_required';trial.subscription.status='trialing';trial.subscription.trial_end=Math.floor(Date.now()/1000)+86400;
  assert.equal((await deliver(eventFor(trial))).status,200);assertActive(await readState(trial));
  pass('valid no-payment-required trial is fulfilled through the same atomic HTTP path');

  const outage=await seed(),retryEvent=eventFor(outage);outage.providerFailure=true;
  assert.equal((await deliver(retryEvent)).status,500);assert.equal((await readState(outage)).grants.length,0);
  const failedReceipt=await receipt(retryEvent);assert.equal(failedReceipt.processed_at,null);assert.equal(failedReceipt.processing_token,null);
  outage.providerFailure=false;assert.equal((await deliver(retryEvent)).status,200);assertActive(await readState(outage));
  pass('real provider HTTP failure releases the receipt and redelivery recovers without partial grants');

  const rollback=await seed(),rollbackEvent=eventFor(rollback);
  await pool.query('INSERT INTO public.offer_entitlements(offer_key,entitlement_key,duration_days) VALUES($1,$2,$3)',[rollback.offer,'zz-invalid',-1]);
  assert.equal((await deliver(rollbackEvent)).status,500);
  const untouched=await readState(rollback);assert.equal(untouched.grants.length,0);assert.equal(untouched.programs.length,0);assert.equal(untouched.instance.revision,'0');assert.equal(untouched.checkout,0);
  assert.equal((await receipt(rollbackEvent)).processed_at,null);
  await pool.query('DELETE FROM public.offer_entitlements WHERE offer_key=$1 AND entitlement_key=$2',[rollback.offer,'zz-invalid']);
  assert.equal((await deliver(rollbackEvent)).status,200);assertActive(await readState(rollback));
  pass('PostgREST SQL failure rolls back the earlier grant and remains replayable');

  const lost=await seed(),lostEvent=eventFor(lost);droppedRpcResponse=true;
  assert.equal((await deliver(lostEvent)).status,500);const committed=await readState(lost);assertActive(committed);assert((await receipt(lostEvent)).processed_at);
  assert.equal((await deliver(lostEvent)).body.duplicate,true);assert.deepEqual(await readState(lost),committed);
  pass('lost HTTP response after commit is recovered from the durable receipt without double fulfillment');

  const racing=await seed(),raceEvent=eventFor(racing);
  const responses=await Promise.all(Array.from({length:8},()=>deliver(raceEvent)));
  assert(responses.some(r=>r.status===200));assert(responses.every(r=>[200,503].includes(r.status)));
  assert.equal((await deliver(raceEvent)).status,200);
  const raced=await readState(racing);assertActive(raced);assert.equal(raced.instance.revision,'1');assert.equal(raced.checkout,1);
  pass('eight concurrent signed HTTP deliveries commit one purchase revision');

  // Test both reclaim predicates over actual HTTP. Keep the winner pending
  // until every competitor finishes, then verify stale-token fencing.
  const store=loadSource('lib/stripe/stripeWebhookEventStore.ts');
  for(const kind of ['released','expired']) {
    const identity={id:`evt_claim_${randomUUID().replace(/-/g,'')}`,type:'checkout.session.completed',created:Math.floor(Date.now()/1000)};
    const expiry=kind==='expired'?new Date(Date.now()-10000).toISOString():null;
    await pool.query('INSERT INTO public.stripe_events(stripe_event_id,type,processing_token,processing_lease_expires_at) VALUES($1,$2,$3,$4)',[identity.id,identity.type,'old_fixture_token',expiry]);
    const attempts=await Promise.allSettled(Array.from({length:8},()=>store.claimStripeEvent(identity)));
    const winners=attempts.filter(result=>result.status==='fulfilled');
    assert.equal(winners.length,1);assert.equal(winners[0].value.status,'claimed');
    for(const result of attempts.filter(result=>result.status==='rejected')) assert.match(String(result.reason),/already being processed/);
    const winningToken=winners[0].value.token;
    await assert.rejects(store.completeStripeEvent(identity.id,'old_fixture_token'),/exclusive claim/);
    await store.releaseStripeEvent(identity.id,'old_fixture_token');
    assert.equal((await receipt(identity)).processing_token,winningToken);
    await store.completeStripeEvent(identity.id,winningToken);
    assert.equal((await store.claimStripeEvent(identity)).status,'processed');
    pass(`eight concurrent ${kind}-lease HTTP reclaims choose one owner and reject the stale token`);
  }
  const expiredPurchase=await seed(),expiredEvent=eventFor(expiredPurchase);
  await pool.query("INSERT INTO public.stripe_events(stripe_event_id,type,processing_token,processing_lease_expires_at) VALUES($1,$2,$3,now()-interval '1 second')",[expiredEvent.id,expiredEvent.type,'crashed_fixture_token']);
  assert.equal((await deliver(expiredEvent)).status,200);assertActive(await readState(expiredPurchase));
  assert((await receipt(expiredEvent)).processed_at);
  pass('signed event reclaims an expired lease and completes fulfillment over HTTP');

  assert(providerTraffic.every(route=>route.startsWith('/v1/')));
  console.log(`RESULT: ${passed} application/PostgREST HTTP scenarios passed`);
  console.log('BOUNDARY: Stripe service is loopback-simulated; no hosted Auth, Checkout UI or external webhook delivery tested.');
}
main().catch(error=>{console.error('HTTP integration failed:',error.message);process.exitCode=1;}).finally(async()=>{
  for(const server of [app,provider,gateway]) if(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await pool.end();
  if(startedContainer) {try{execFileSync('docker',['rm','-f',containerName],{stdio:'pipe',timeout:15000});}catch{process.exitCode=1;}}
  fs.rmSync(tmp,{recursive:true,force:true});
});
