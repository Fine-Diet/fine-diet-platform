/**
 * @jest-environment jsdom
 *
 * Checkout success bridge — polls /api/checkout/reconcile; never fabricates
 * entitlements client-side.
 */

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

const replace = jest.fn();
let query: Record<string, string | string[] | undefined> = {
  session_id: 'cs_test_abc',
  returnTo: '/app/log',
};
let isReady = true;

jest.mock('next/router', () => ({
  useRouter: () => ({
    isReady,
    query,
    replace,
  }),
}));

import CheckoutSuccessPage from '@/pages/checkout/success';

(globalThis as any).React = React;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(CheckoutSuccessPage));
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLDivElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

beforeEach(() => {
  jest.useFakeTimers();
  replace.mockReset();
  query = { session_id: 'cs_test_abc', returnTo: '/app/log' };
  isReady = true;
  (global as any).fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('/checkout/success', () => {
  it('rejects invalid session_id without calling reconcile', async () => {
    query = { session_id: 'not-a-checkout-session', returnTo: '/app' };
    const { container, root } = mount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(container.textContent).toContain('could not verify this checkout session');
    cleanup(root, container);
  });

  it('polls reconcile with credentials and preserves safe returnTo', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({
        status: 'pending',
        reason: 'entitlement_not_visible',
        returnTo: '/app/log',
        maxAttemptsHint: 8,
      }),
    });

    const { container, root } = mount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalled();
    const firstUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(firstUrl).toContain('/api/checkout/reconcile?');
    expect(firstUrl).toContain('session_id=cs_test_abc');
    expect(firstUrl).toContain(encodeURIComponent('/app/log'));
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({
      credentials: 'include',
    });
    expect(firstUrl).not.toMatch(/sk_live|sk_test|STRIPE|SERVICE_ROLE/);
    expect(container.textContent).toContain('Confirming your access');
    cleanup(root, container);
  });

  it('navigates to server-provided nextPath on ready (does not invent entitlement)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({
        status: 'ready',
        nextPath: '/app/onboarding?returnTo=%2Fapp%2Flog',
        returnTo: '/app/log',
        grantSource: 'entitlement',
      }),
    });

    const { container, root } = mount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(replace).toHaveBeenCalledWith('/app/onboarding?returnTo=%2Fapp%2Flog');
    expect(container.textContent).toContain('Access confirmed');
    // Client never writes grants — only consumes nextPath from reconcile.
    expect(JSON.stringify((global.fetch as jest.Mock).mock.calls)).not.toMatch(
      /person_entitlements|grant_entitlement|insert/,
    );
    cleanup(root, container);
  });

  it('stops on failed reconcile without fabricating access', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({
        status: 'failed',
        reason: 'session_expired',
        returnTo: '/app',
      }),
    });

    const { container, root } = mount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('have not been charged');
    cleanup(root, container);
  });

  it('surfaces person mismatch from 403 without granting access', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 403,
      json: async () => ({
        status: 'error',
        reason: 'session_person_mismatch',
        returnTo: '/app',
      }),
    });

    const { container, root } = mount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(replace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('does not belong to your account');
    cleanup(root, container);
  });

  it('times out after the polling attempt cap matching reconcile maxAttemptsHint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      json: async () => ({
        status: 'pending',
        reason: 'entitlement_not_visible',
        maxAttemptsHint: 8,
        returnTo: '/app/log',
      }),
    });

    const { container, root } = mount();

    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(1500);
        await Promise.resolve();
      });
    }

    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(container.textContent).toMatch(/still be processing|could not confirm access/i);
    expect(replace).not.toHaveBeenCalled();
    cleanup(root, container);
  });
});
