/** Actual route + RPC adapter; transport/provider/database RPC are synthetic. */
import type { NextApiRequest, NextApiResponse } from 'next';
const mockFrom=jest.fn(), mockRpc=jest.fn(), mockSession=jest.fn(), mockSubscription=jest.fn();
const mockClaim=jest.fn(), mockComplete=jest.fn(), mockRelease=jest.fn(), mockAssign=jest.fn();
let event: any, instance: any, session: any, subscription: any, model: string, live: boolean, order: string[];
jest.mock('micro',()=>({buffer:async()=>Buffer.from('atomic_fixture')}));
jest.mock('@/lib/stripe/stripeServer',()=>({stripe:{
  webhooks:{constructEvent:()=>event},checkout:{sessions:{retrieve:(...args:unknown[])=>mockSession(...args)}},
  subscriptions:{retrieve:(...args:unknown[])=>mockSubscription(...args)},
}}));
jest.mock('@/lib/stripe/stripeAccountContext',()=>({getStripeAccountContext:()=>({accountId:'acct_Fixture',livemode:live})}));
jest.mock('@/lib/supabaseServerClient',()=>({supabaseAdmin:{from:(...args:unknown[])=>mockFrom(...args),rpc:(...args:unknown[])=>mockRpc(...args)}}));
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
  return chain; // Deliberately has no update/insert methods: all writes must be RPC.
}
async function deliver() {
  const response={statusCode:200,status(code:number){response.statusCode=code;return response;},json(_body:unknown){return response;},end(){return response;},setHeader:jest.fn()};
  await handler({method:'POST',headers:{'stripe-signature':'fixture'}} as NextApiRequest,response as unknown as NextApiResponse);
  return response.statusCode;
}
beforeAll(()=>{process.env.STRIPE_WEBHOOK_SECRET='whsec_atomic_fixture';handler=require('@/pages/api/webhooks/stripe').default;});
afterAll(()=>{
  if(priorSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=priorSecret;
  if(priorFlag===undefined)delete process.env.STRIPE_ATOMIC_FULFILLMENT;else process.env.STRIPE_ATOMIC_FULFILLMENT=priorFlag;
});
beforeEach(()=>{
  jest.resetAllMocks();jest.spyOn(console,'error').mockImplementation(()=>{});
  process.env.STRIPE_ATOMIC_FULFILLMENT='1';live=false;model='subscription';order=[];
  instance={id:'instance_fixture',person_id:'person_fixture',offer_key:'method',stripe_customer_id:'cus_fixture',stripe_checkout_session_id:'cs_fixture',stripe_subscription_id:'sub_fixture',stripe_payment_intent_id:null,price_option_key:null,status:'pending',fulfillment_revision:'7'};
  session={id:'cs_fixture',customer:'cus_fixture',livemode:false,mode:'subscription',status:'complete',payment_status:'paid',subscription:'sub_fixture',payment_intent:null,metadata:{person_id:'person_fixture',offer_key:'method',billing_model:'subscription'}};
  subscription={id:'sub_fixture',customer:'cus_fixture',livemode:false,status:'active',latest_invoice:{id:'in_fixture',status:'paid'},metadata:{person_id:'person_fixture',offer_key:'method'}};
  event={id:'evt_fixture',type:'checkout.session.completed',created:1762000000,livemode:false,data:{object:session}};
  mockFrom.mockImplementation(query);mockSession.mockImplementation(async()=>{order.push('stripe:session');return session;});
  mockSubscription.mockImplementation(async()=>{order.push('stripe:subscription');return subscription;});
  mockRpc.mockResolvedValue({data:{status:'committed',receipt_completed:true},error:null});
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
    event.type='invoice.paid';event.data.object={id:'in_fixture',parent:{subscription_details:{subscription:'sub_fixture'}}};
    expect(await deliver()).toBe(200);expect(order.indexOf('db:stripe_offer_instances')).toBeLessThan(order.indexOf('stripe:subscription'));
    expect(mockRpc.mock.calls[0][1].p_input.checkout_record).toBeNull();
  });
  it('requires a fresh delivery after revision conflict rather than replaying stale provider data',async()=>{
    mockRpc.mockResolvedValue({data:null,error:{code:'40001',message:'revision changed'}});
    expect(await deliver()).toBe(500);expect(mockRpc).toHaveBeenCalledTimes(1);expect(mockComplete).not.toHaveBeenCalled();expect(mockRelease).toHaveBeenCalledWith('evt_fixture','claim_fixture');
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
    live=true;event.livemode=true;session.livemode=true;subscription.livemode=true;
    expect(await deliver()).toBe(200);expect(mockRpc.mock.calls[0][1].p_input.livemode).toBe(true);expect(mockComplete).not.toHaveBeenCalled();
  });
});
