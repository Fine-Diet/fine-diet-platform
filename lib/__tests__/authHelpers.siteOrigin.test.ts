const mockAuth = {
  signUp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  signInWithOAuth: jest.fn(),
};

jest.mock('@/lib/supabaseBrowser', () => ({
  createClient: () => ({ auth: mockAuth }),
}));

import { resetPasswordForEmail, signInWithOAuth, signUp } from '@/lib/authHelpers';
import { getSiteUrl, PAYMENTS_QA_BRANCH, PAYMENTS_QA_PROJECT_ID } from '@/lib/siteOrigin';

// Vercel supplies the branch URL and Git ref for the same deployment. These
// hostnames are synthetic fixtures. The resolver independently validates
// project, Preview, branch-ref identity, URL format, and explicit-origin
// conflicts.
const branchUrl =
  'fine-diet-payments-qa-target-git-synthetic-payments-integration-fine-diet.vercel.app';
const retiredBranchUrl =
  'fine-diet-payments-qa-target-git-synthetic-payments-reconstruction-fine-diet.vercel.app';
const origin = `https://${branchUrl}`;
const envKeys = [
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_PROJECT_ID',
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_BRANCH_URL',
  'NEXT_PUBLIC_VERCEL_ENV',
  'NEXT_PUBLIC_VERCEL_PROJECT_ID',
  'NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF',
  'NEXT_PUBLIC_VERCEL_BRANCH_URL',
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VERCEL_PROJECT_ID = PAYMENTS_QA_PROJECT_ID;
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_GIT_COMMIT_REF = PAYMENTS_QA_BRANCH;
  process.env.VERCEL_BRANCH_URL = branchUrl;
  process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_ID = PAYMENTS_QA_PROJECT_ID;
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF = PAYMENTS_QA_BRANCH;
  process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL = branchUrl;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin } },
  });
  mockAuth.signUp.mockResolvedValue({ data: {}, error: null });
  mockAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mockAuth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
});

afterAll(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete (globalThis as { window?: unknown }).window;
});

describe('Supabase auth return URLs in the QA Preview', () => {
  it('uses the generated origin for Checkout success and cancel URLs', () => {
    expect(getSiteUrl('/checkout/success', { includeServerSiteUrl: true }))
      .toBe(`${origin}/checkout/success`);
    expect(getSiteUrl('/start?checkout=canceled', { includeServerSiteUrl: true }))
      .toBe(`${origin}/start?checkout=canceled`);
  });

  it('uses the generated origin for email confirmation', async () => {
    await signUp('qa@example.test', 'synthetic-password');
    const options = mockAuth.signUp.mock.calls[0][0].options;
    const callback = new URL(options.emailRedirectTo);
    expect(callback.origin).toBe(origin);
    expect(callback.pathname).toBe('/auth/callback');
  });

  it('uses the generated origin for password reset', async () => {
    await resetPasswordForEmail('qa@example.test');
    expect(mockAuth.resetPasswordForEmail.mock.calls[0][1].redirectTo)
      .toBe(`${origin}/auth/reset-password`);
  });

  it('denies the retired reconstruction branch before issuing an auth redirect', async () => {
    const retiredReconstructionBranch = 'codex/payments-reconstruction-20261106';
    // The retired ref and hostname represent one deployment. Denial is the
    // branch-ref identity check.
    process.env.VERCEL_GIT_COMMIT_REF = retiredReconstructionBranch;
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF = retiredReconstructionBranch;
    process.env.VERCEL_BRANCH_URL = retiredBranchUrl;
    process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL = retiredBranchUrl;

    await expect(signUp('qa@example.test', 'synthetic-password')).rejects.toThrow(
      'Site origin resolution failed [SERVER_CONTEXT_MISMATCH]',
    );
    expect(mockAuth.signUp).not.toHaveBeenCalled();
    expect(() => getSiteUrl('/checkout/success', { includeServerSiteUrl: true })).toThrow(
      'Site origin resolution failed [SERVER_CONTEXT_MISMATCH]',
    );
  });

  it('uses the generated origin for OAuth callback', async () => {
    await signInWithOAuth('google', '/app/plans');
    const callback = new URL(mockAuth.signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(callback.origin).toBe(origin);
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('next')).toBe('/app/plans');
  });
});
