import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchWithSignal, WEBHOOK_ATTEMPT_BUDGET_MS, WEBHOOK_RELEASE_BUDGET_MS, STRIPE_WEBHOOK_TIMEOUT_MS } from '../stripeWebhookBudget';

describe('webhook attempt budget', () => {
  it('keeps the handler budget inside the 12 second relay abort', () => {
    expect(STRIPE_WEBHOOK_TIMEOUT_MS).toBeLessThan(WEBHOOK_ATTEMPT_BUDGET_MS);
    expect(WEBHOOK_ATTEMPT_BUDGET_MS + WEBHOOK_RELEASE_BUDGET_MS).toBeLessThan(12_000);
  });

  it('does not import node:async_hooks', () => {
    const source = readFileSync(join(__dirname, '../stripeWebhookBudget.ts'), 'utf8');
    expect(source).not.toContain('async_hooks');
    expect(source).not.toContain('AsyncLocalStorage');
  });

  it('aborts only the fetch bound to the cancelled request', async () => {
    const calls: AbortSignal[] = [];
    const fetchImpl = jest.fn<typeof fetch>(async (_input, init) => {
      if (!init?.signal) throw new Error('missing signal');
      calls.push(init.signal);
      return new Response('ok');
    });
    const first = new AbortController();
    const second = new AbortController();
    await fetchWithSignal(first.signal, fetchImpl)('https://example.test/first');
    await fetchWithSignal(second.signal, fetchImpl)('https://example.test/second');
    expect(calls).toEqual([first.signal, second.signal]);
    first.abort();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    const hanging = new Map<AbortSignal, (error: Error) => void>();
    const gated: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error('missing signal');
      const fail = (error: Error) => reject(error);
      hanging.set(signal, fail);
      signal.addEventListener('abort', () => fail(new Error('aborted')), { once: true });
    });
    const third = new AbortController();
    const fourth = new AbortController();
    const thirdFetch = fetchWithSignal(third.signal, gated)('https://example.test/third');
    const fourthFetch = fetchWithSignal(fourth.signal, gated)('https://example.test/fourth');
    third.abort();
    await expect(thirdFetch).rejects.toThrow('aborted');
    let fourthSettled = false;
    fourthFetch.then(() => { fourthSettled = true; }, () => { fourthSettled = true; });
    await Promise.resolve();
    expect(fourthSettled).toBe(false);
    hanging.get(fourth.signal)?.(new Error('finished'));
    await expect(fourthFetch).rejects.toThrow('finished');
  });
});
