import { describe, it, expect, jest } from '@jest/globals';

// Mock the service-role client so the service never touches the network or
// env vars. Each query chain resolves to { data: null, error: null }, i.e.
// "no published/draft row exists" → the resolver must fall back to default.
jest.mock('@/lib/supabaseServerClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    order: () => chain,
    upsert: async () => ({ error: null }),
    delete: async () => ({ error: null }),
  };
  return {
    supabaseAdmin: {
      from: () => chain,
    },
  };
});

import {
  resolveLiveOnboardingFlow,
  resolveOnboardingFlowForPreview,
  getPublishedFlow,
  getDraftFlow,
} from '../onboardingFlowServerService';
import {
  DEFAULT_ONBOARDING_FLOW_CONFIG,
  DEFAULT_ONBOARDING_FLOW_TITLE,
} from '../onboardingFlowTypes';

describe('resolveLiveOnboardingFlow — fallback', () => {
  it('falls back to the default config when no published flow exists', async () => {
    const resolved = await resolveLiveOnboardingFlow();
    expect(resolved.source).toBe('default');
    expect(resolved.title).toBe(DEFAULT_ONBOARDING_FLOW_TITLE);
    expect(resolved.config).toEqual(DEFAULT_ONBOARDING_FLOW_CONFIG);
  });

  it('getPublishedFlow returns null when no published row exists', async () => {
    expect(await getPublishedFlow()).toBeNull();
  });

  it('getDraftFlow returns null when no draft row exists', async () => {
    expect(await getDraftFlow()).toBeNull();
  });
});

describe('resolveOnboardingFlowForPreview — source fallbacks', () => {
  it('source=draft with no draft falls back to default', async () => {
    const resolved = await resolveOnboardingFlowForPreview('draft');
    expect(resolved.source).toBe('default');
    expect(resolved.config).toEqual(DEFAULT_ONBOARDING_FLOW_CONFIG);
  });

  it('source=published with no published falls back to default', async () => {
    const resolved = await resolveOnboardingFlowForPreview('published');
    expect(resolved.source).toBe('default');
  });

  it('source=default returns the default config', async () => {
    const resolved = await resolveOnboardingFlowForPreview('default');
    expect(resolved.source).toBe('default');
    expect(resolved.config).toEqual(DEFAULT_ONBOARDING_FLOW_CONFIG);
  });
});
