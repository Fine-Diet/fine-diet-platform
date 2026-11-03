import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAuthSignUp = jest.fn();
jest.mock('@/lib/supabaseBrowser', () => ({
  createClient: () => ({ auth: { signUp: (...args: unknown[]) => mockAuthSignUp(...args) } }),
}));

import { signUp } from '@/lib/authHelpers';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = 'https://qa-preview.example';
  mockAuthSignUp.mockResolvedValue({ data: { user: { id: 'synthetic' } }, error: null });
});

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe('email signup confirmation destination', () => {
  it('returns a no-context signup to the protected /app entry', async () => {
    await signUp('member@example.test', 'test-password');

    const options = mockAuthSignUp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    const callbackUrl = new URL(options.options.emailRedirectTo);
    expect(callbackUrl.pathname).toBe('/auth/callback');
    expect(callbackUrl.searchParams.get('next')).toBe('/app');
  });

  it('keeps an explicit checkout-resume destination through confirmation', async () => {
    const checkoutResume = '/checkout/resume?offer=journal-monthly&source=start';
    await signUp('member@example.test', 'test-password', checkoutResume);

    const options = mockAuthSignUp.mock.calls[0][0] as {
      options: { emailRedirectTo: string };
    };
    const callbackUrl = new URL(options.options.emailRedirectTo);
    expect(callbackUrl.searchParams.get('next')).toBe(checkoutResume);
  });
});
