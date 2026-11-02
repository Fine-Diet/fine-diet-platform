const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));
jest.mock('node:crypto', () => ({ randomUUID: () => 'claim-token' }));
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from '../stripeWebhookEventStore';

function chain(result: {data?: unknown;error?: unknown}, resultAt: 'insert'|'update'|'select'='insert') {
  const api: Record<string, any> = {};
  for (const k of ['eq','is','or']) api[k] = jest.fn(() => api);
  api.select = jest.fn(() => api);
  api.maybeSingle = jest.fn(async () => result);
  api.insert = jest.fn(async () => result);
  api.update = jest.fn(() => api);
  api.then = (resolve: (x: unknown) => void) => Promise.resolve(result).then(resolve);
  return api;
}
const event = {id:'evt_example',type:'checkout.session.completed',created:1762000000};

beforeEach(() => jest.clearAllMocks());
describe('Stripe webhook event claims', () => {
  it('claims a never-seen event', async () => {
    mockFrom.mockReturnValue(chain({error:null}));
    expect(await claimStripeEvent(event)).toEqual({status:'claimed',token:'claim-token'});
  });
  it('recognizes an already processed event', async () => {
    const duplicate = chain({error:{code:'23505'}});
    const completed = chain({data:{processed_at:'2026-11-01T00:00:00Z'},error:null});
    mockFrom.mockReturnValueOnce(duplicate).mockReturnValueOnce(completed);
    expect(await claimStripeEvent(event)).toEqual({status:'processed'});
  });
  it('refuses a still-active concurrent claim', async () => {
    const duplicate = chain({error:{code:'23505'}});
    const pending = chain({data:{processed_at:null},error:null});
    const busy = chain({data:[],error:null});
    mockFrom.mockReturnValueOnce(duplicate).mockReturnValueOnce(pending).mockReturnValueOnce(busy);
    await expect(claimStripeEvent(event)).rejects.toThrow('already being processed');
  });
  it('allows a reclaimable event to be claimed', async () => {
    const duplicate = chain({error:{code:'23505'}});
    const pending = chain({data:{processed_at:null},error:null});
    const reclaim = chain({data:[{stripe_event_id:event.id}],error:null});
    mockFrom.mockReturnValueOnce(duplicate).mockReturnValueOnce(pending).mockReturnValueOnce(reclaim);
    expect(await claimStripeEvent(event)).toEqual({status:'claimed',token:'claim-token'});
  });
  it('requires exclusive ownership to complete', async () => {
    mockFrom.mockReturnValue(chain({data:[],error:null}));
    await expect(completeStripeEvent(event.id,'lost-token')).rejects.toThrow('exclusive claim');
  });
  it('releases failed event claims for retry', async () => {
    mockFrom.mockReturnValue(chain({data:[],error:null}));
    await expect(releaseStripeEvent(event.id,'claim-token')).resolves.toBeUndefined();
  });
});
