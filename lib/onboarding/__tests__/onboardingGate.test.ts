/**
 * Unit tests for the onboarding first-run gate helpers.
 *
 * The middleware delegates all "is this path exempt", "is this returnTo
 * safe", and "where does the user go next" decisions to these pure helpers,
 * so the gate logic is fully covered without spinning up Next.js middleware.
 */
import { describe, it, expect } from '@jest/globals';
import {
  LEGACY_ONBOARDING_PATH,
  ONBOARDING_PATH,
  buildOnboardingRedirectDestination,
  getSafeOnboardingReturnTo,
  isOnboardingComplete,
  isOnboardingGateExempt,
  resolveCompletedUserDestination,
  resolveOnboardingFinishDestination,
} from '../onboardingGate';

describe('isOnboardingGateExempt', () => {
  it('exempts the onboarding routes themselves (loop avoidance)', () => {
    expect(isOnboardingGateExempt(ONBOARDING_PATH)).toBe(true);
    expect(isOnboardingGateExempt(LEGACY_ONBOARDING_PATH)).toBe(true);
  });

  it('exempts profile and settings so users can manage their account mid-onboarding', () => {
    expect(isOnboardingGateExempt('/app/profile')).toBe(true);
    expect(isOnboardingGateExempt('/app/settings')).toBe(true);
    expect(isOnboardingGateExempt('/journal/profile')).toBe(true);
    expect(isOnboardingGateExempt('/journal/settings')).toBe(true);
  });

  it('does not exempt normal app routes', () => {
    expect(isOnboardingGateExempt('/app')).toBe(false);
    expect(isOnboardingGateExempt('/app/log/new')).toBe(false);
    expect(isOnboardingGateExempt('/app/programs')).toBe(false);
    expect(isOnboardingGateExempt('/journal')).toBe(false);
    expect(isOnboardingGateExempt('/journal/log')).toBe(false);
  });

  it('ignores a query string when checking the path', () => {
    expect(isOnboardingGateExempt(`${ONBOARDING_PATH}?returnTo=/app`)).toBe(true);
  });
});

describe('getSafeOnboardingReturnTo', () => {
  it('accepts canonical app and legacy journal paths', () => {
    expect(getSafeOnboardingReturnTo('/app')).toBe('/app');
    expect(getSafeOnboardingReturnTo('/app/log/new')).toBe('/app/log/new');
    expect(getSafeOnboardingReturnTo('/journal/log')).toBe('/journal/log');
    expect(getSafeOnboardingReturnTo('/app/programs?series=nutrition')).toBe(
      '/app/programs?series=nutrition',
    );
  });

  it('rejects external and protocol-relative URLs (no open redirects)', () => {
    expect(getSafeOnboardingReturnTo('https://evil.example.com')).toBeNull();
    expect(getSafeOnboardingReturnTo('//evil.example.com')).toBeNull();
    expect(getSafeOnboardingReturnTo('http://evil.example.com')).toBeNull();
  });

  it('rejects non-relative paths', () => {
    expect(getSafeOnboardingReturnTo('app/log')).toBeNull();
    expect(getSafeOnboardingReturnTo('')).toBeNull();
    expect(getSafeOnboardingReturnTo(null)).toBeNull();
    expect(getSafeOnboardingReturnTo(undefined)).toBeNull();
  });

  it('rejects paths outside the app/journal surface', () => {
    expect(getSafeOnboardingReturnTo('/admin')).toBeNull();
    expect(getSafeOnboardingReturnTo('/login')).toBeNull();
    expect(getSafeOnboardingReturnTo('/create-account')).toBeNull();
    expect(getSafeOnboardingReturnTo('/journal-waitlist')).toBeNull();
    expect(getSafeOnboardingReturnTo('/some/other/page')).toBeNull();
  });

  it('never returns an onboarding route (loop avoidance)', () => {
    expect(getSafeOnboardingReturnTo(ONBOARDING_PATH)).toBeNull();
    expect(getSafeOnboardingReturnTo(LEGACY_ONBOARDING_PATH)).toBeNull();
    expect(getSafeOnboardingReturnTo(`${ONBOARDING_PATH}?returnTo=/app`)).toBeNull();
  });
});

describe('buildOnboardingRedirectDestination', () => {
  it('redirects /app to /app/onboarding with returnTo=/app', () => {
    expect(buildOnboardingRedirectDestination('/app', '')).toBe('/app/onboarding?returnTo=%2Fapp');
  });

  it('preserves the original path+query as returnTo for /app/log/new', () => {
    expect(buildOnboardingRedirectDestination('/app/log/new', '')).toBe(
      '/app/onboarding?returnTo=%2Fapp%2Flog%2Fnew',
    );
  });

  it('preserves query strings on the original destination', () => {
    expect(buildOnboardingRedirectDestination('/app/programs', '?series=nutrition')).toBe(
      '/app/onboarding?returnTo=%2Fapp%2Fprograms%3Fseries%3Dnutrition',
    );
  });

  it('drops returnTo when the destination is unsafe (no open redirect)', () => {
    expect(buildOnboardingRedirectDestination('/journal/onboarding', '')).toBe(ONBOARDING_PATH);
    // Subdomain root is not an app path → no returnTo.
    expect(buildOnboardingRedirectDestination('/', '')).toBe(ONBOARDING_PATH);
  });
});

describe('resolveOnboardingFinishDestination', () => {
  it('honors a safe returnTo after completion', () => {
    expect(resolveOnboardingFinishDestination('/app/log/new')).toBe('/app/log/new');
    expect(resolveOnboardingFinishDestination('/app/programs?series=nutrition')).toBe(
      '/app/programs?series=nutrition',
    );
  });

  it('falls back to /app?onboarded=1 when returnTo is missing or unsafe', () => {
    expect(resolveOnboardingFinishDestination(null)).toBe('/app?onboarded=1');
    expect(resolveOnboardingFinishDestination(undefined)).toBe('/app?onboarded=1');
    expect(resolveOnboardingFinishDestination('https://evil.example.com')).toBe('/app?onboarded=1');
    expect(resolveOnboardingFinishDestination(ONBOARDING_PATH)).toBe('/app?onboarded=1');
  });
});

describe('resolveCompletedUserDestination', () => {
  it('honors a safe returnTo for a completed user who visits onboarding', () => {
    expect(resolveCompletedUserDestination('/app/log/new')).toBe('/app/log/new');
  });

  it('falls back to /app when returnTo is missing or unsafe', () => {
    expect(resolveCompletedUserDestination(null)).toBe('/app');
    expect(resolveCompletedUserDestination('https://evil.example.com')).toBe('/app');
    expect(resolveCompletedUserDestination(ONBOARDING_PATH)).toBe('/app');
  });
});

describe('isOnboardingComplete', () => {
  it('reads the onboarding_completed_at flag from people.metadata', () => {
    expect(isOnboardingComplete({ onboarding_completed_at: '2026-06-28T00:00:00Z' })).toBe(true);
    expect(isOnboardingComplete({})).toBe(false);
    expect(isOnboardingComplete(null)).toBe(false);
    expect(isOnboardingComplete(undefined)).toBe(false);
  });

  it('treats a falsy value as incomplete', () => {
    expect(isOnboardingComplete({ onboarding_completed_at: '' })).toBe(false);
    expect(isOnboardingComplete({ onboarding_completed_at: null })).toBe(false);
  });
});
