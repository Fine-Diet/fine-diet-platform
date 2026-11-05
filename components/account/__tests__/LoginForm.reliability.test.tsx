/** @jest-environment jsdom */

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { LoginForm } from '@/components/account/LoginForm';
import { claimPendingAccessCodeOffer } from '@/lib/access/claimAccessCodeOffer';

jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('@/lib/supabaseBrowser', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/access/claimAccessCodeOffer', () => ({
  claimPendingAccessCodeOffer: jest.fn(async () => ({ status: 'no_claim' })),
}));
jest.mock('@/lib/auth/authContext', () => ({
  getAuthCopy: () => ({ title: 'Welcome back', subtitle: 'Log in' }),
  clearPersistedAuthContext: jest.fn(),
}));
jest.mock('@/components/account/SocialLoginButtons', () => ({
  SocialLoginButtons: () => null,
}));

const user = { id: '80ec2f53-4bbb-4ac0-b4a4-111a71112345', email: 'member@example.com' };
const mockedFetch = () => global.fetch as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

describe('LoginForm post-auth reliability', () => {
  let container: HTMLDivElement;
  let root: Root;
  let push: jest.Mock<(...args: any[]) => Promise<boolean>>;
  let onSuccess: jest.Mock<(...args: any[]) => void>;
  let signInWithPassword: jest.Mock<(...args: any[]) => Promise<any>>;

  const submit = async () => {
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
  };

  const fillCredentials = () => {
    const fields = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setValue?.call(fields[0], 'member@example.com');
      fields[0].dispatchEvent(new Event('input', { bubbles: true }));
      setValue?.call(fields[1], 'private-test-password');
      fields[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const render = async () => {
    await act(async () => {
      root.render(
        <LoginForm
          onSwitchToSignup={jest.fn()}
          onSuccess={onSuccess}
          onForgotPassword={jest.fn()}
          redirectTo="/app"
        />,
      );
      await Promise.resolve();
    });
    fillCredentials();
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    push = jest.fn<(...args: any[]) => Promise<boolean>>().mockResolvedValue(true);
    onSuccess = jest.fn<(...args: any[]) => void>();
    signInWithPassword = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      data: { user, session: { access_token: 'test-session' } },
      error: null,
    });
    (useRouter as jest.Mock).mockReturnValue({ push });
    (createClient as jest.Mock).mockReturnValue({ auth: { signInWithPassword } });
    (global.fetch as jest.Mock) = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, linked: true }),
    });
    window.localStorage.clear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('continues when identity is linked but optional profile creation warns', async () => {
    mockedFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        linked: true,
        profileCreated: false,
        profileError: "Could not find table 'public.profiles'",
      }),
    });
    await render();

    await submit();

    expect(push).toHaveBeenCalledWith('/app');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain('Log In');
  });

  it('blocks redirect when required identity linking did not succeed', async () => {
    mockedFetch().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, linked: false }),
    });
    await render();

    await submit();

    expect(push).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('verify your account link');
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('times out a stalled identity link and restores an actionable login form', async () => {
    jest.useFakeTimers();
    mockedFetch().mockImplementationOnce(() => new Promise(() => {}));
    await render();

    await submit();
    await act(async () => { jest.advanceTimersByTime(15_000); for (let i = 0; i < 8; i += 1) await Promise.resolve(); });

    expect(push).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('verify your account link');
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers a retry when router navigation is canceled', async () => {
    push.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render();

    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not open');
    const continueButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Continue');
    expect(continueButton).toBeTruthy();
    await act(async () => { continueButton?.click(); for (let i = 0; i < 8; i += 1) await Promise.resolve(); });

    expect(push).toHaveBeenNthCalledWith(2, '/app');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('recovers from a stalled router navigation and can retry it', async () => {
    jest.useFakeTimers();
    push.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(true);
    await render();

    await submit();
    await act(async () => { jest.advanceTimersByTime(10_000); for (let i = 0; i < 8; i += 1) await Promise.resolve(); });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not open');
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    const continueButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Continue');
    await act(async () => { continueButton?.click(); for (let i = 0; i < 8; i += 1) await Promise.resolve(); });

    expect(push).toHaveBeenNthCalledWith(2, '/app');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when an access-code claim has a terminal failure', async () => {
    (claimPendingAccessCodeOffer as jest.Mock<(...args: any[]) => Promise<any>>).mockResolvedValueOnce({ status: 'expired' });
    window.localStorage.setItem('fd_acc_claimToken:last', 'opaque-token');
    await render();

    await submit();

    expect(push).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('expired');
  });
});
