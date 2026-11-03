const mockFrom = jest.fn();
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));
jest.mock('node:crypto', () => ({ randomUUID: () => 'claim-token' }));
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from '../stripeWebhookEventStore';

function chain(result: { data?: unknown; error?: unknown }) {
  const api: Record<string, any> = {};
  // Deliberately no .or(): mutation logical filters caused a real HTTP failure.
  for (const name of ['eq', 'is', 'lte', 'select', 'update']) api[name] = jest.fn(() => api);
  api.maybeSingle = jest.fn(async () => result);
  api.insert = jest.fn(async () => result);
  api.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  return api;
}
const event = { id: 'evt_example', type: 'checkout.session.completed', created: 1762000000 };
const now = '2026-11-01T12:00:00.000Z';
const expired = '2026-11-01T11:59:00.000Z';
function existingReceipt(expiry: unknown, result: { data?: unknown; error?: unknown } = {
  data: [{ stripe_event_id: event.id }], error: null,
}) {
  const duplicate = chain({ error: { code: '23505' } });
  const pending = chain({ data: { processed_at: null, processing_lease_expires_at: expiry }, error: null });
  const update = chain(result);
  mockFrom.mockReturnValueOnce(duplicate).mockReturnValueOnce(pending).mockReturnValueOnce(update);
  return { pending, update };
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(now));
});
afterEach(() => jest.useRealTimers());

describe('Stripe webhook event claims', () => {
  it('claims a never-seen event', async () => {
    mockFrom.mockReturnValue(chain({ error: null }));
    expect(await claimStripeEvent(event)).toEqual({ status: 'claimed', token: 'claim-token' });
  });
  it('recognizes an already processed event without changing the receipt', async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { code: '23505' } }))
      .mockReturnValueOnce(chain({ data: { processed_at: now, processing_lease_expires_at: null }, error: null }));
    expect(await claimStripeEvent(event)).toEqual({ status: 'processed' });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
  it('refuses a still-active claim before attempting to update it', async () => {
    const { update } = existingReceipt('2026-11-01T12:01:00.000Z');
    await expect(claimStripeEvent(event)).rejects.toThrow('already being processed');
    expect(update.update).not.toHaveBeenCalled();
  });
  it('reclaims a released NULL lease using an atomic IS NULL update predicate', async () => {
    const { pending, update } = existingReceipt(null);
    expect(await claimStripeEvent(event)).toEqual({ status: 'claimed', token: 'claim-token' });
    expect(pending.select).toHaveBeenCalledWith('processed_at, processing_lease_expires_at');
    expect(update.is).toHaveBeenCalledWith('processed_at', null);
    expect(update.is).toHaveBeenCalledWith('processing_lease_expires_at', null);
    expect(update.lte).not.toHaveBeenCalled();
  });
  it.each([expired, now])('reclaims expiry %s using a conditional timestamp update', async expiry => {
    const { update } = existingReceipt(expiry);
    expect(await claimStripeEvent(event)).toEqual({ status: 'claimed', token: 'claim-token' });
    expect(update.lte).toHaveBeenCalledWith('processing_lease_expires_at', now);
    expect(update.is).not.toHaveBeenCalledWith('processing_lease_expires_at', null);
    expect(update.update).toHaveBeenCalledWith({ processing_token: 'claim-token', processing_lease_expires_at: '2026-11-01T12:10:00.000Z' });
  });
  it.each([null, expired])('does not report ownership after another worker wins the %s claim', async expiry => {
    existingReceipt(expiry, { data: [], error: null });
    await expect(claimStripeEvent(event)).rejects.toThrow('already being processed');
  });
  it.each([undefined, 'not-a-timestamp', 42])('fails closed for malformed receipt expiry %s', async expiry => {
    const { update } = existingReceipt(expiry);
    await expect(claimStripeEvent(event)).rejects.toThrow('invalid processing lease');
    expect(update.update).not.toHaveBeenCalled();
  });
  it('propagates reclaim database failures', async () => {
    const error = { code: '42703', message: 'fixture database failure' };
    existingReceipt(null, { data: null, error });
    await expect(claimStripeEvent(event)).rejects.toEqual(error);
  });
  it('propagates an initial database failure without treating it as a duplicate', async () => {
    const error = { code: '08006', message: 'fixture connection failure' };
    mockFrom.mockReturnValue(chain({ error }));
    await expect(claimStripeEvent(event)).rejects.toEqual(error);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
  it('rejects a disappeared receipt after a duplicate insert', async () => {
    mockFrom.mockReturnValueOnce(chain({ error: { code: '23505' } }))
      .mockReturnValueOnce(chain({ data: null, error: null }));
    await expect(claimStripeEvent(event)).rejects.toThrow('disappeared');
  });
  it('requires the expected event in a successful reclaim response', async () => {
    existingReceipt(null, { data: [{ stripe_event_id: 'evt_other' }], error: null });
    await expect(claimStripeEvent(event)).rejects.toThrow('already being processed');
  });
  it('requires exclusive ownership to complete', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(completeStripeEvent(event.id, 'lost-token')).rejects.toThrow('exclusive claim');
  });
  it('releases failed claims for retry with token and completion guards', async () => {
    const update = chain({ data: [], error: null });
    mockFrom.mockReturnValue(update);
    await expect(releaseStripeEvent(event.id, 'claim-token')).resolves.toBeUndefined();
    expect(update.eq).toHaveBeenCalledWith('processing_token', 'claim-token');
    expect(update.is).toHaveBeenCalledWith('processed_at', null);
  });
});
