import {
  PAYMENTS_QA_BRANCH,
  PAYMENTS_QA_PROJECT_ID,
  resolveSiteOrigin,
  resolveSiteOriginOrDefault,
  resolveAbsoluteSiteUrl,
  resolveSiteUrl,
  type SiteOriginContext,
} from '@/lib/siteOrigin';

// Vercel supplies the branch URL and Git ref for the same deployment. These
// hostnames are synthetic fixtures. The resolver independently validates
// project, Preview, branch-ref identity, URL format, and explicit-origin
// conflicts.
const branchUrl =
  'fine-diet-payments-qa-target-git-synthetic-payments-integration-fine-diet.vercel.app';
const retiredBranchUrl =
  'fine-diet-payments-qa-target-git-synthetic-payments-reconstruction-fine-diet.vercel.app';
const origin = `https://${branchUrl}`;

function serverQaContext(overrides: Partial<SiteOriginContext> = {}): SiteOriginContext {
  return {
    vercelProjectId: PAYMENTS_QA_PROJECT_ID,
    vercelEnvironment: 'preview',
    vercelGitBranch: PAYMENTS_QA_BRANCH,
    vercelBranchUrl: branchUrl,
    ...overrides,
  };
}

describe('QA Preview origin resolver', () => {
  it('uses Vercel generated branch origin for exact project, Preview, and branch', () => {
    expect(resolveSiteOrigin(serverQaContext())).toBe(origin);
  });

  it('denies the retired reconstruction branch', () => {
    const retiredReconstructionBranch = 'codex/payments-reconstruction-20261106';

    expect(PAYMENTS_QA_BRANCH).toBe('codex/payments-release-integration-20261109');
    // The retired ref and hostname represent one deployment. Denial is the
    // branch-ref identity check.
    expect(() => resolveSiteOrigin(serverQaContext({
      vercelGitBranch: retiredReconstructionBranch,
      vercelBranchUrl: retiredBranchUrl,
    }))).toThrow('Site origin resolution failed [SERVER_CONTEXT_MISMATCH]');
    expect(() => resolveSiteOrigin({
      publicVercelProjectId: PAYMENTS_QA_PROJECT_ID,
      publicVercelEnvironment: 'preview',
      publicVercelGitBranch: retiredReconstructionBranch,
      publicVercelBranchUrl: retiredBranchUrl,
      explicitSiteUrl: 'https://myfinediet.com',
    })).toThrow('Site origin resolution failed [PUBLIC_CONTEXT_MISMATCH]');
  });

  it('accepts an explicit matching origin after URL normalization', () => {
    expect(resolveSiteOrigin(serverQaContext({ explicitSiteUrl: `${origin}/` }))).toBe(origin);
  });

  it('rejects a conflicting explicit site origin', () => {
    expect(() => resolveSiteOrigin(serverQaContext({
      explicitSiteUrl: 'https://myfinediet.com',
    }))).toThrow('Site origin resolution failed [EXPLICIT_ORIGIN_CONFLICT]');
  });

  it.each([
    ['missing generated host', { vercelBranchUrl: undefined }],
    ['wrong project', { vercelProjectId: 'prj_other' }],
    ['wrong environment', { vercelEnvironment: 'production' }],
    ['wrong branch', { vercelGitBranch: 'main' }],
    ['wrong project host', { vercelBranchUrl: 'fine-diet-platform-git-payments-fine-diet.vercel.app' }],
    ['URL with protocol', { vercelBranchUrl: `https://${branchUrl}` }],
    ['URL with port', { vercelBranchUrl: `${branchUrl}:8443` }],
    ['URL with path', { vercelBranchUrl: `${branchUrl}/path` }],
  ])('fails closed for %s', (_label, overrides) => {
    expect(() => resolveSiteOrigin(serverQaContext(overrides))).toThrow('Site origin resolution failed');
  });

  it('uses the framework-prefixed generated branch URL in a browser bundle', () => {
    expect(resolveSiteOrigin({
      publicVercelProjectId: PAYMENTS_QA_PROJECT_ID,
      publicVercelEnvironment: 'preview',
      publicVercelGitBranch: PAYMENTS_QA_BRANCH,
      publicVercelBranchUrl: branchUrl,
    })).toBe(origin);
  });

  it('fails closed when the candidate branch is not a Preview', () => {
    expect(() => resolveSiteOrigin({
      publicVercelProjectId: PAYMENTS_QA_PROJECT_ID,
      publicVercelEnvironment: 'production',
      publicVercelGitBranch: PAYMENTS_QA_BRANCH,
      publicVercelBranchUrl: branchUrl,
      explicitSiteUrl: 'https://myfinediet.com',
    })).toThrow('Site origin resolution failed [PUBLIC_CONTEXT_MISMATCH]');
  });

  it('fails closed when public QA identity is present but branch variables are missing', () => {
    expect(() => resolveSiteOrigin({
      publicVercelProjectId: PAYMENTS_QA_PROJECT_ID,
      publicVercelEnvironment: 'preview',
      explicitSiteUrl: 'https://myfinediet.com',
      browserOrigin: 'https://myfinediet.com',
    })).toThrow('Site origin resolution failed [PUBLIC_CONTEXT_MISMATCH]');
  });

  it('rejects a candidate-looking public host bound to the wrong project', () => {
    expect(() => resolveSiteOrigin({
      publicVercelProjectId: 'prj_other',
      publicVercelEnvironment: 'preview',
      publicVercelGitBranch: PAYMENTS_QA_BRANCH,
      publicVercelBranchUrl: branchUrl,
      explicitSiteUrl: 'https://myfinediet.com',
    })).toThrow('Site origin resolution failed [PUBLIC_CONTEXT_MISMATCH]');
  });

  it('rejects public and server project identity disagreement', () => {
    expect(() => resolveSiteOrigin({
      ...serverQaContext(),
      publicVercelProjectId: 'prj_other',
      publicVercelEnvironment: 'preview',
      publicVercelGitBranch: PAYMENTS_QA_BRANCH,
      publicVercelBranchUrl: branchUrl,
    })).toThrow('Site origin resolution failed [PUBLIC_CONTEXT_MISMATCH]');
  });

  it('rejects public and server generated-origin disagreement', () => {
    expect(() => resolveSiteOrigin({
      ...serverQaContext(),
      publicVercelProjectId: PAYMENTS_QA_PROJECT_ID,
      publicVercelEnvironment: 'preview',
      publicVercelGitBranch: PAYMENTS_QA_BRANCH,
      publicVercelBranchUrl: `${branchUrl.slice(0, -'.vercel.app'.length)}-other.vercel.app`,
    })).toThrow('Site origin resolution failed [SERVER_PUBLIC_CONTEXT_MISMATCH]');
  });

  it.each([
    ['auth', ''],
    ['Checkout', 'https://myfinediet.com'],
    ['email', 'https://myfinediet.com'],
    ['operator links', 'https://myfinediet.com'],
  ])('fails closed before the %s default can be used when QA branch context is incomplete', (_consumer, fallback) => {
    expect(() => resolveSiteOriginOrDefault({
      vercelProjectId: PAYMENTS_QA_PROJECT_ID,
      vercelEnvironment: 'preview',
      explicitSiteUrl: fallback || undefined,
    }, fallback)).toThrow('Site origin resolution failed [SERVER_CONTEXT_MISMATCH]');
  });

  it.each([
    '/checkout/success',
    '/start?checkout=canceled',
    '/account',
  ])('preserves production Checkout URL bytes for %s', (path) => {
    expect(resolveAbsoluteSiteUrl(path, {
      vercelProjectId: 'prj_production',
      vercelEnvironment: 'production',
      vercelGitBranch: 'main',
      explicitSiteUrl: 'https://myfinediet.com',
    })).toBe(`https://myfinediet.com${path}`);
  });

  it('preserves configured Production behavior outside the exact QA Preview', () => {
    expect(resolveSiteOrigin({
      vercelProjectId: 'prj_production',
      vercelEnvironment: 'production',
      vercelGitBranch: 'main',
      explicitSiteUrl: 'https://myfinediet.com/',
    })).toBe('https://myfinediet.com');
  });

  it.each([
    ['/checkout/success', `${origin}/checkout/success`],
    ['/start?checkout=canceled', `${origin}/start?checkout=canceled`],
    ['/auth/callback', `${origin}/auth/callback`],
    ['/auth/reset-password', `${origin}/auth/reset-password`],
  ])('normalizes %s against the generated origin', (path, expected) => {
    expect(resolveSiteUrl(path, serverQaContext())).toBe(expected);
  });
});
