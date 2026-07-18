import { buildLogHref } from '@/pages/journal/plans';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import type { ResolvedScheduleSlot } from '@/lib/plans/types';

/**
 * Corrective fix (Phase 3 authenticated QA — defect log-return-path):
 * Plans home's "Log Now" CTA sent the user to the Log page with no
 * `redirect` param, so the Log page's back arrow fell through to its
 * Log-overview default instead of returning to Plans home. buildLogHref now
 * always includes a `redirect` back to the canonical Plans route.
 *
 * This test intentionally lives OUTSIDE pages/ — a `.test.ts` file placed
 * inside pages/journal/plans/__tests__ is treated by Next.js as its own
 * route and breaks `next build`'s page-data collection step (it has no
 * default export and calls `describe`/`it` at module scope).
 */
function slot(overrides: Partial<ResolvedScheduleSlot> = {}): ResolvedScheduleSlot {
  return {
    key: 'lunch',
    label: 'Lunch',
    target_time: '12:00',
    ...overrides,
  } as ResolvedScheduleSlot;
}

describe('buildLogHref', () => {
  it('includes an encoded redirect back to the canonical Plans route', () => {
    const href = buildLogHref(slot());
    const url = new URL(href, 'https://example.test');
    expect(url.pathname).toBe(APP_ROUTES.logNew);
    expect(url.searchParams.get('redirect')).toBe(APP_ROUTES.plans);
  });

  it('the redirect value passes the Log page\'s existing safe-redirect contract', () => {
    const href = buildLogHref(slot());
    const url = new URL(href, 'https://example.test');
    const redirect = url.searchParams.get('redirect');
    // getSafeRedirectTarget is what pages/journal/log.tsx uses to read
    // ?redirect= — this proves the value we emit is accepted, not silently
    // rejected back to the Log page's own '/journal' fallback.
    expect(getSafeRedirectTarget(redirect, '/journal')).toBe(APP_ROUTES.plans);
  });

  it('still carries the existing tab/mealSlot/date/time params unchanged', () => {
    const href = buildLogHref(slot({ key: 'dinner', target_time: '17:00' }));
    const url = new URL(href, 'https://example.test');
    expect(url.searchParams.get('tab')).toBe('food');
    expect(url.searchParams.get('mealSlot')).toBe('dinner');
    expect(url.searchParams.get('time')).toBe('17:00');
    expect(url.searchParams.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
