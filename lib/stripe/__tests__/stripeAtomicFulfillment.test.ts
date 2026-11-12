const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({ supabaseAdmin: {
  from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args),
} }));
import { atomicFulfillmentEnabled, fulfillmentRevision, commitStripeFulfillment, type AtomicFulfillmentInput } from '../stripeAtomicFulfillment';
const priorFlag = process.env.STRIPE_ATOMIC_FULFILLMENT;
let offerModel: string;
let optionModel: string;
let catalogError: unknown;
function query(table: string) {
  const result = () => ({ data: table === 'offers' ? { billing_model: offerModel }
    : table === 'price_options' ? { billing_model: optionModel }
    : [{ entitlement_key: 'journal', duration_days: null, is_active: true }], error: catalogError });
  const chain = {
    select: () => chain, eq: () => chain, maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
}
function input(): AtomicFulfillmentInput { return {
  instance: { id:'instance_fixture',person_id:'person_fixture',offer_key:'method',stripe_customer_id:'cus_fixture',price_option_key:null,fulfillment_revision:'7' },
  context:{accountId:'acct_Fixture',livemode:false},receipt:{eventId:'evt_fixture',token:'owner-token'},
  state:'active',sourceRef:'sub_fixture',identifiers:{stripe_subscription_id:'sub_fixture'},
}; }
beforeEach(() => {
  jest.resetAllMocks(); delete process.env.STRIPE_ATOMIC_FULFILLMENT;
  offerModel='subscription'; optionModel='subscription'; catalogError=null;
  mockFrom.mockImplementation(query);
  mockRpc.mockResolvedValue({ data:{status:'committed',receipt_completed:true},error:null });
});
afterEach(() => { if (priorFlag === undefined) delete process.env.STRIPE_ATOMIC_FULFILLMENT; else process.env.STRIPE_ATOMIC_FULFILLMENT=priorFlag; });
describe('atomic fulfillment activation and revisions', () => {
  it('allows legacy sandbox staging but never a legacy live fallback', () => {
    expect(atomicFulfillmentEnabled(false)).toBe(false);
    expect(()=>atomicFulfillmentEnabled(true)).toThrow('requires atomic');
    process.env.STRIPE_ATOMIC_FULFILLMENT='1';
    expect(atomicFulfillmentEnabled(false)).toBe(true); expect(atomicFulfillmentEnabled(true)).toBe(true);
  });
  it.each([undefined,null,-1,1.1,Number.MAX_SAFE_INTEGER+1,'-1','1e3','01','9223372036854775808','not-a-revision'])('rejects unsafe revision %s', value => {
    expect(()=>fulfillmentRevision(value)).toThrow('revision');
  });
  it('preserves exact bigint text without rounding', () => {
    expect(fulfillmentRevision('9223372036854775807')).toBe('9223372036854775807');
    expect(fulfillmentRevision(0)).toBe('0');
  });
});
describe('atomic RPC adapter', () => {
  it('passes the revision, owner, account and purchase to one RPC', async () => {
    await commitStripeFulfillment(input());
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('fd_commit_stripe_fulfillment',{p_input:expect.objectContaining({
      expected_revision:'7',event_id:'evt_fixture',token:'owner-token',account_id:'acct_Fixture',livemode:false,
      instance_id:'instance_fixture',person_id:'person_fixture',customer_id:'cus_fixture',source_ref:'sub_fixture',state:'active',
    })});
  });
  it('accepts an already-committed response after a lost HTTP response', async () => {
    mockRpc.mockResolvedValue({data:{status:'already_processed',receipt_completed:true},error:null});
    await expect(commitStripeFulfillment(input())).resolves.toBeUndefined();
  });
  it('propagates a serialization rejection instead of retrying an old snapshot', async () => {
    const error={code:'40001',message:'revision changed'}; mockRpc.mockResolvedValue({data:null,error});
    await expect(commitStripeFulfillment(input())).rejects.toEqual(error); expect(mockRpc).toHaveBeenCalledTimes(1);
  });
  it.each([null,{}, {status:'committed'}, {status:'not_committed',receipt_completed:true}])('rejects unconfirmed RPC result %s', async data => {
    mockRpc.mockResolvedValue({data,error:null}); await expect(commitStripeFulfillment(input())).rejects.toThrow('confirm');
  });
  it.each(['installment','intro_then_subscription','unknown'])('blocks unapproved active billing model %s', async model => {
    offerModel=model; await expect(commitStripeFulfillment(input())).rejects.toThrow('not approved'); expect(mockRpc).not.toHaveBeenCalled();
  });
  it('checks the selected price option rather than only the parent offer', async () => {
    const request=input(); request.instance.price_option_key='intro_option'; optionModel='intro_then_subscription';
    await expect(commitStripeFulfillment(request)).rejects.toThrow('not approved'); expect(mockRpc).not.toHaveBeenCalled();
  });
  it('still permits revocation when the original billing model is no longer eligible', async () => {
    const request=input(); request.state='ended'; offerModel='installment';
    await commitStripeFulfillment(request); expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc.mock.calls[0][1].p_input.entitlements).toEqual([]);
  });
  it('does not call the RPC when catalog reads fail', async () => {
    catalogError={message:'fixture_catalog_failure'};
    await expect(commitStripeFulfillment(input())).rejects.toEqual(catalogError); expect(mockRpc).not.toHaveBeenCalled();
  });
  it('fails before any catalog access when the schema revision is missing', async () => {
    const request=input(); delete request.instance.fulfillment_revision;
    await expect(commitStripeFulfillment(request)).rejects.toThrow('revision'); expect(mockFrom).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
  });
});
