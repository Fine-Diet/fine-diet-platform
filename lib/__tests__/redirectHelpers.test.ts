import { getSafeRedirectTarget, isSafeRedirectTarget } from '../redirectHelpers';
import { APP_ROUTES } from '../routes/appRoutes';

/**
 * Corrective fix (Phase 3 authenticated QA — defect log-return-path):
 * pages/journal/log.tsx's handleClose (`router.push(redirectTarget)`) reads
 * `?redirect=` through this exact contract and falls back to '/journal'
 * when it's absent or unsafe. These tests pin that contract directly so a
 * future regression in either buildLogHref (Plans home) or
 * buildPlannedMealLogHref (Adjust & log) is caught without mounting the
 * whole Log page. The Log page intentionally never relies on browser
 * history (router.back()) for this — an explicit, safe-listed redirect
 * target is the only supported mechanism.
 */
describe('isSafeRedirectTarget', () => {
  it('accepts a relative app path', () => {
    expect(isSafeRedirectTarget(APP_ROUTES.plans)).toBe(true);
    expect(isSafeRedirectTarget('/app/plans/day/2026-07-17')).toBe(true);
  });

  it('rejects absolute and protocol-relative URLs (no open redirects)', () => {
    expect(isSafeRedirectTarget('https://evil.example.com')).toBe(false);
    expect(isSafeRedirectTarget('http://evil.example.com')).toBe(false);
    expect(isSafeRedirectTarget('//evil.example.com')).toBe(false);
  });

  it('rejects blank/missing values', () => {
    expect(isSafeRedirectTarget(null)).toBe(false);
    expect(isSafeRedirectTarget(undefined)).toBe(false);
    expect(isSafeRedirectTarget('')).toBe(false);
  });
});

describe('getSafeRedirectTarget — the contract Log handleClose relies on', () => {
  it('honors a valid redirect (e.g. the Plans-origin redirect this packet adds)', () => {
    expect(getSafeRedirectTarget(APP_ROUTES.plans, '/journal')).toBe(APP_ROUTES.plans);
  });

  it('falls back to the caller-supplied default when the redirect is absent', () => {
    expect(getSafeRedirectTarget(null, '/journal')).toBe('/journal');
    expect(getSafeRedirectTarget(undefined, APP_ROUTES.log)).toBe(APP_ROUTES.log);
  });

  it('falls back to the caller-supplied default when the redirect is unsafe, never trusting it', () => {
    expect(getSafeRedirectTarget('https://evil.example.com', '/journal')).toBe('/journal');
  });
});
