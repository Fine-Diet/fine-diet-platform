/** Actual route + RPC adapter + paid-period resolver; transports are synthetic. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { WEBHOOK_ATTEMPT_BUDGET_MS, WEBHOOK_RELEASE_BUDGET_MS } from '@/lib/stripe/stripeWebhookBudget';
const mockFrom=jest.fn(), mockRpc=jest.fn(), mockSession=jest.fn(), mockSubscription=jest.fn(), mockCharge=jest.fn();
const mockBoundFetches: Array<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> = [];
const mockClaim=jest.fn(), mockComplete=jest.fn(), mockRelease=jest.fn(), mockAssign=jest.fn();
const mockInvoices=jest.fn(), mockLines=jest.fn();
let event: any, instance: any, session: any, subscription: any, model: string, live: boolean, order: string[], paid: any;
jest.mock('micro',()=>({buffer:async()=>Buffer.from('atomic_fixture')}));
jest.mock('@/lib/stripe/stripeServer',()=>({stripe:{
  webhooks:{constructEvent:()=>event},checkout:{sessions:{retrieve:(...args:unknown[])=>mockSession(...args)}},
  subscriptions:{retrieve:(...args:unknown[])=>mockSubscription(...args)},
  charges:{retrieve:(...args:unknown[])=>mockCharge(...args)},
  invoices:{list:(...args:unknown[])=>mockInvoices(...args),listLineItems:(...args:unknown[])=>mockLines(...args)},
}}));
jest.mock('@/lib/stripe/stripeAccountContext',()=>({getStripeAccountContext:()=>({accountId:'acct_Fixture',livemode:live})}));
jest.mock('@/lib/supabaseServerClient',()=>({
  supabaseAdmin:{from:(...args:unknown[])=>mockFrom(...args),rpc:(...args:unknown[])=>mockRpc(...args)},
  createSupabaseAdmin:(fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)=>{
    if (fetchImpl) mockBoundFetches.push(fetchImpl);
    return {from:(...args:unknown[])=>mockFrom(...args),rpc:(...args:unknown[])=>mockRpc(...args)};
  },
}));
jest.mock('@/lib/stripe/stripeWebhookEventStore',()=>({
  claimStripeEvent:(...args:unknown[])=>mockClaim(...args),completeStripeEvent:(...args:unknown[])=>mockComplete(...args),releaseStripeEvent:(...args:unknown[])=>mockRelease(...args),
}));
jest.mock('@/lib/plans/programAssignmentAutomationServerService',()=>({handleStripeCheckoutCompleted:(...args:unknown[])=>mockAssign(...args)}));
const priorSecret=process.env.STRIPE_WEBHOOK_SECRET, priorFlag=process.env.STRIPE_ATOMIC_FULFILLMENT;
let handler: typeof import('@/pages/api/webhooks/stripe').default;
function query(table:string) {
  if (!['stripe_offer_instances','offers','offer_entitlements'].includes(table)) throw new Error(`Forbidden direct business table: ${table}`);
  const result=()=>{
    order.push(`db:${table}`);
    return {data:table==='stripe_offer_instances'?{...instance}:table==='offers'?{billing_model:model}:[{entitlement_key:'journal',duration_days:null,is_active:true}],error:null};
  };
  const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>result(),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
  return chain; // No update/insert: required business writes must remain atomic.
}
async function deliver() {
  const response={statusCode:200,status(code:number){response.statusCode=code;return response;},json(_body:unknown){return response;},end(){return response;},setHeader:jest.fn()};
  await handler({method:'POST',headers:{'stripe-signature':'fixture'}} as NextApiRequest,response as unknown as NextApiResponse);
  return response.statusCode;
}
function invoiceEvent(type='invoice.payment_failed') {
  event.type=type; event.data.object={id:'in_snapshot',parent:{subscription_details:{subscription:'sub_fixture'}}};
}
beforeAll(()=>{process.env.STRIPE_WEBHOOK_SECRET='whsec_atomic_fixture';handler=require('@/pages/api/webhooks/stripe').default;});
afterAll(()=>{
  if(priorSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=priorSecret;
  if(priorFlag===undefined)delete process.env.STRIPE_ATOMIC_FULFILLMENT;else process.env.STRIPE_ATOMIC_FULFILLMENT=priorFlag;
});
beforeEach(()=>{
  jest.resetAllMocks();mockBoundFetches.length=0;jest.spyOn(console,'error').mockImplementation(()=>{});
  process.env.STRIPE_ATOMIC_FULFILLMENT='1';live=false;model='subscription';order=[];
  instance={id:'instance_fixture',person_id:'person_fixture',offer_key:'method',stripe_customer_id:'cus_fixture',stripe_checkout_session_id:'cs_fixture',stripe_subscription_id:'sub_fixture',stripe_payment_intent_id:null,price_option_key:null,status:'pending',fulfillment_revision:'7'};
  session={id:'cs_fixture',customer:'cus_fixture',livemode:false,mode:'subscription',status:'complete',payment_status:'paid',subscription:'sub_fixture',payment_intent:null,metadata:{person_id:'person_fixture',offer_key:'method',billing_model:'subscription'}};
  const now=Math.floor(Date.now()/1000);
  paid={id:'in_fixture',status:'paid',amount_remaining:0,livemode:false,currency:'usd',customer:'cus_fixture',
    parent:{subscription_details:{subscription:'sub_fixture'}},post_payment_credit_notes_amount:0,status_transitions:{paid_at:now-100},
    lines:{has_more:false,data:[{id:'il_fixture',livemode:false,currency:'usd',amount:2499,quantity:1,
      parent:{type:'subscription_item_details',subscription_item_details:{subscription:'sub_fixture',subscription_item:'si_fixture',proration:false}},
      pricing:{price_details:{price:'price_Fixture'}},period:{start:now-100,end:now+3600}}]}};
  subscription={id:'sub_fixture',customer:'cus_fixture',livemode:false,status:'active',latest_invoice:paid,
    items:{has_more:false,data:[{id:'si_fixture',quantity:1,price:{id:'price_Fixture',currency:'usd',recurring:{usage_type:'licensed'}}}]},
    metadata:{person_id:'person_fixture',offer_key:'method'}};
  mockCharge.mockResolvedValue({id:'ch_fixture',livemode:false,customer:'cus_fixture',payment_intent:'pi_fixture',invoice:paid});
  event={id:'evt_fixture',type:'checkout.session.completed',created:1762000000,livemode:false,data:{object:session}};
  mockFrom.mockImplementation(query);mockSession.mockImplementation(async()=>{order.push('stripe:session');return session;});
  mockSubscription.mockImplementation(async()=>{order.push('stripe:subscription');return subscription;});
  mockRpc.mockImplementation(async()=>{order.push('rpc');return {data:{status:'committed',receipt_completed:true},error:null};});
  mockInvoices.mockImplementation(async()=>{order.push('stripe:invoices');return {data:[],has_more:false};});
  mockLines.mockResolvedValue({data:[],has_more:false});
  mockClaim.mockResolvedValue({status:'claimed',token:'claim_fixture'});mockComplete.mockResolvedValue(undefined);mockRelease.mockResolvedValue(undefined);
});
afterEach(()=>jest.restoreAllMocks());
describe('atomic webhook integration',()=>{
  it('reads the revision before provider state and uses one business/receipt RPC',async()=>{
    expect(await deliver()).toBe(200);expect(order.indexOf('db:stripe_offer_instances')).toBeLessThan(order.indexOf('stripe:session'));
    expect(mockRpc).toHaveBeenCalledTimes(1);expect(mockRpc.mock.calls[0][1].p_input).toEqual(expect.objectContaining({expected_revision:'7',event_id:'evt_fixture',token:'claim_fixture',checkout_record:expect.objectContaining({stripe_checkout_session_id:'cs_fixture'})}));
    expect(mockAssign).not.toHaveBeenCalled();expect(mockComplete).not.toHaveBeenCalled();expect(mockRelease).not.toHaveBeenCalled();
  });
  it('also captures revision before retrieving subscription events',async()=>{
    invoiceEvent('invoice.paid');expect(await deliver()).toBe(200);
    expect(order.indexOf('db:stripe_offer_instances')).toBeLessThan(order.indexOf('stripe:subscription'));
    expect(mockRpc.mock.calls[0][1].p_input.checkout_record).toBeNull();
  });
  it('requires a fresh delivery after revision conflict rather than replaying stale provider data',async()=>{
    mockRpc.mockResolvedValue({data:null,error:{code:'40001',message:'revision changed'}});
    expect(await deliver()).toBe(500);expect(mockRpc).toHaveBeenCalledTimes(1);expect(mockComplete).not.toHaveBeenCalled();expect(mockRelease).toHaveBeenCalledWith('evt_fixture','claim_fixture', expect.anything());
  });
  it('does not silently switch back when the atomic schema is missing',async()=>{
    delete instance.fulfillment_revision;expect(await deliver()).toBe(500);expect(mockRpc).not.toHaveBeenCalled();expect(mockAssign).not.toHaveBeenCalled();expect(mockComplete).not.toHaveBeenCalled();
  });
  it('does not acknowledge an unconfirmed RPC response',async()=>{
    mockRpc.mockResolvedValue({data:null,error:null});expect(await deliver()).toBe(500);expect(mockComplete).not.toHaveBeenCalled();
  });
  it('handles a lost RPC response through the durable receipt on redelivery',async()=>{
    mockRpc.mockRejectedValue(new Error('lost_response'));expect(await deliver()).toBe(500);
    mockClaim.mockResolvedValue({status:'processed'});expect(await deliver()).toBe(200);expect(mockRpc).toHaveBeenCalledTimes(1);
  });
  it('suspends access and programs through the same RPC',async()=>{
    subscription.status='canceled';expect(await deliver()).toBe(200);
    expect(mockRpc.mock.calls[0][1].p_input).toEqual(expect.objectContaining({state:'ended',entitlements:[],checkout_record:null}));expect(mockAssign).not.toHaveBeenCalled();
  });
  it('does not grant or invoke fulfillment for an unpaid checkout',async()=>{
    session.payment_status='unpaid';expect(await deliver()).toBe(200);expect(mockRpc).not.toHaveBeenCalled();expect(mockComplete).toHaveBeenCalled();
  });
  it.each(['installment','intro_then_subscription'])('does not fulfill unsupported schedule model %s',async billingModel=>{
    model=billingModel;expect(await deliver()).toBe(500);expect(mockRpc).not.toHaveBeenCalled();expect(mockComplete).not.toHaveBeenCalled();
  });
  it('blocks live legacy processing before receipt or business writes',async()=>{
    delete process.env.STRIPE_ATOMIC_FULFILLMENT;live=true;event.livemode=true;
    expect(await deliver()).toBe(503);expect(mockClaim).not.toHaveBeenCalled();expect(mockFrom).not.toHaveBeenCalled();expect(mockRpc).not.toHaveBeenCalled();
  });
  it('allows matching live mode only through the atomic path',async()=>{
    live=true;event.livemode=true;session.livemode=true;subscription.livemode=true;paid.livemode=true;paid.lines.data[0].livemode=true;
    expect(await deliver()).toBe(200);expect(mockRpc.mock.calls[0][1].p_input.livemode).toBe(true);expect(mockComplete).not.toHaveBeenCalled();
  });
  it.each(['draft','open'])('does not suspend paid coverage because latest invoice is %s',async status=>{
    invoiceEvent();subscription.latest_invoice={...paid,id:'in_next',status};
    mockInvoices.mockImplementation(async()=>{order.push('stripe:invoices');return {data:[paid],has_more:false};});
    expect(await deliver()).toBe(200);expect(mockRpc.mock.calls[0][1].p_input.state).toBe('active');
    expect(order.indexOf('db:stripe_offer_instances')).toBeLessThan(order.indexOf('stripe:invoices'));
    expect(order.indexOf('stripe:invoices')).toBeLessThan(order.indexOf('rpc'));
    expect(mockRpc.mock.calls[0][1].p_input.paid_through).toEqual(expect.any(String));
  });
  it('suspends only when the verified prior paid period has ended',async()=>{
    invoiceEvent();paid.lines.data[0].period.end=Math.floor(Date.now()/1000)-1;
    subscription.latest_invoice={...paid,id:'in_next',status:'open'};mockInvoices.mockResolvedValue({data:[paid],has_more:false});
    expect(await deliver()).toBe(200);expect(mockRpc.mock.calls[0][1].p_input.state).toBe('canceled');
  });
  it('does not change access when invoice evidence is unavailable',async()=>{
    invoiceEvent();subscription.latest_invoice={...paid,status:'open'};mockInvoices.mockRejectedValue(new Error('Stripe unavailable'));
    expect(await deliver()).toBe(500);expect(mockRpc).not.toHaveBeenCalled();expect(mockComplete).not.toHaveBeenCalled();expect(mockRelease).toHaveBeenCalled();
  });
  it('does not change access when paid invoice ownership is inconsistent',async()=>{
    paid.customer='cus_other';expect(await deliver()).toBe(500);expect(mockRpc).not.toHaveBeenCalled();expect(mockComplete).not.toHaveBeenCalled();
  });
  it('does not use an exhausted evidence budget to revoke access',async()=>{
    invoiceEvent();subscription.latest_invoice={...paid,status:'open'};
    mockInvoices.mockImplementation(async()=>({data:[{...paid,id:`in_${mockInvoices.mock.calls.length}`,lines:{data:[],has_more:false}}],has_more:true}));
    expect(await deliver()).toBe(500);expect(mockRpc).not.toHaveBeenCalled();expect(mockRelease).toHaveBeenCalled();
  });
  it.each([
    ['charge.refunded','refund',{id:'ch_fixture'}],
    ['charge.dispute.created','dispute',{id:'dp_fixture',charge:'ch_fixture'}],
    ['radar.early_fraud_warning.created','early_fraud_warning',{id:'issfr_fixture',charge:'ch_fixture'}],
  ])('queues verified %s for review without direct access writes',async(type,riskKind,obj)=>{
    event.type=type;event.data.object=obj;
    expect(await deliver()).toBe(200);
    expect(mockCharge).toHaveBeenCalledWith('ch_fixture',{expand:['invoice']},{timeout:5000});
    expect(mockRpc.mock.calls[0][0]).toBe('fd_record_stripe_risk_review');
    expect(mockRpc.mock.calls[0][1].p_input).toEqual(expect.objectContaining({risk_kind:riskKind,source_ref:'sub_fixture',instance_id:'instance_fixture',person_id:'person_fixture'}));
    expect(mockFrom.mock.calls.every(call=>call[0]==='stripe_offer_instances')).toBe(true);
    expect(mockComplete).not.toHaveBeenCalled();
  });
  it('releases the claim when provider work exceeds the relay budget',async()=>{
    jest.useFakeTimers();
    mockSubscription.mockImplementation(()=>new Promise(()=>{}));
    invoiceEvent('invoice.paid');
    const pending=deliver();
    await jest.advanceTimersByTimeAsync(WEBHOOK_ATTEMPT_BUDGET_MS);
    await expect(pending).resolves.toBe(500);
    expect(mockRelease).toHaveBeenCalledWith('evt_fixture','claim_fixture', expect.anything());
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
  it('returns before the relay abort when lease release also hangs',async()=>{
    jest.useFakeTimers();
    mockSubscription.mockImplementation(()=>new Promise(()=>{}));
    mockRelease.mockImplementation(()=>new Promise(()=>{}));
    invoiceEvent('invoice.paid');
    const pending=deliver();
    await jest.advanceTimersByTimeAsync(WEBHOOK_ATTEMPT_BUDGET_MS+WEBHOOK_RELEASE_BUDGET_MS);
    await expect(pending).resolves.toBe(500);
    expect(mockRelease).toHaveBeenCalledWith('evt_fixture','claim_fixture', expect.anything());
    jest.useRealTimers();
  });
  it('cancels only the attempt fetch and releases through a separate signal',async()=>{
    jest.useFakeTimers();
    mockSubscription.mockImplementation(()=>new Promise(()=>{}));
    invoiceEvent('invoice.paid');
    const signals: AbortSignal[]=[];
    const fetchMock=jest.spyOn(global,'fetch').mockImplementation(async(_input, init)=>{
      signals.push(init!.signal!);
      return new Response('{}');
    });
    const pending=deliver();
    await jest.advanceTimersByTimeAsync(WEBHOOK_ATTEMPT_BUDGET_MS);
    await expect(pending).resolves.toBe(500);
    expect(mockBoundFetches.length).toBeGreaterThanOrEqual(2);
    await mockBoundFetches[0]('https://attempt.test');
    await mockBoundFetches[mockBoundFetches.length-1]('https://release.test');
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(signals[0]).not.toBe(signals[1]);
    fetchMock.mockRestore();
    jest.useRealTimers();
  });
  it('accepts a retry of a budget failure without a second fulfillment',async()=>{
    jest.useFakeTimers();
    mockSubscription.mockImplementation(()=>new Promise(()=>{}));
    invoiceEvent('invoice.paid');
    const first=deliver();
    await jest.advanceTimersByTimeAsync(WEBHOOK_ATTEMPT_BUDGET_MS+WEBHOOK_RELEASE_BUDGET_MS);
    await expect(first).resolves.toBe(500);
    jest.useRealTimers();
    mockClaim.mockResolvedValue({status:'processed'});
    mockSubscription.mockResolvedValue(subscription);
    expect(await deliver()).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('does not reopen a terminal purchase even with current paid coverage',async()=>{
    invoiceEvent('invoice.paid');instance.status='ended';expect(await deliver()).toBe(200);
    expect(mockRpc.mock.calls[0][1].p_input.state).toBe('ended');
  });
});
