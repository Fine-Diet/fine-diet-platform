import { APP_DRAWER_HUBS, getLogDrawerItems, isDrawerChildActive } from '@/lib/navigation/appDrawerNavigation';

describe('Log drawer destinations', () => {
  it('matches exact cross-hub routes without query parameters', () => {
    const allItems = APP_DRAWER_HUBS.flatMap((hub) => [hub, ...(hub.items ?? [])]);
    const byId = (id: string) => allItems.find((item) => item.id === id)!;
    for (const id of ['plans-overview', 'food-home', 'my-programs', 'log-overview']) {
      const item = byId(id);
      expect(isDrawerChildActive(item, item.href!)).toBe(true);
    }
    expect(isDrawerChildActive(byId('plans-day'), `${byId('plans-day').href}?date=2026-10-25`)).toBe(true);
  });

  it('keeps structural rows and derives only enabled tracker rows', () => {
    const items = getLogDrawerItems(['hydration', 'glucose', 'disabled-unknown']);
    expect(items.slice(0, 2).map((item) => item.id)).toEqual(['log-overview', 'log-new']);
    expect(items.find((item) => item.id === 'log-tracking-water')).toMatchObject({ label: 'Hydration', href: '/app/log/new?tab=water' });
    expect(items.find((item) => item.id === 'log-tracking-glucose')).toMatchObject({ label: 'Glucose', disabled: true, status: 'coming-soon' });
    expect(items.find((item) => item.id === 'log-tracking-glucose')?.href).toBeUndefined();
    expect(items.some((item) => item.id === 'log-tracking-intake')).toBe(false);
    expect(items.slice(-2).map((item) => item.id)).toEqual(['log-summary', 'log-tracking']);
    expect(items[items.length - 1]?.href).toBe('/app/profile?section=tracking#tracking-prefs');
  });

  it('matches a single tracker by canonical query values, independent of query order', () => {
    const items = getLogDrawerItems(['intake', 'water', 'mood']);
    const water = items.find((item) => item.id === 'log-tracking-water')!;
    const food = items.find((item) => item.id === 'log-tracking-intake')!;
    const mood = items.find((item) => item.id === 'log-tracking-mood')!;
    const newEntry = items.find((item) => item.id === 'log-new')!;

    expect(isDrawerChildActive(water, '/app/log/new?date=2026-10-25&tab=water&block=morning')).toBe(true);
    expect(isDrawerChildActive(water, '/app/log/new?block=morning&tab=water&date=2026-10-25')).toBe(true);
    expect(isDrawerChildActive(water, '/app/log/new?tab=mood')).toBe(false);
    expect(isDrawerChildActive(water, '/app/log/new?tab=water&tab=mood')).toBe(false);
    expect(isDrawerChildActive(water, '/app/log/new?tab=water&tab=water')).toBe(false);
    expect(isDrawerChildActive(water, '/app/log/new?tab=unknown')).toBe(false);
    expect(isDrawerChildActive(food, '/app/log/new?tab=food&type=intake')).toBe(true);
    expect(isDrawerChildActive(mood, '/app/log/new?tab=water')).toBe(false);
    expect(isDrawerChildActive(newEntry, '/app/log/new')).toBe(true);
    expect(isDrawerChildActive(newEntry, '/app/log/new?tab=water')).toBe(false);
  });

  it('distinguishes Log overview, Daily Summary, and expanded Tracking Preferences', () => {
    const items = getLogDrawerItems(['water']);
    const overview = items.find((item) => item.id === 'log-overview')!;
    const summary = items.find((item) => item.id === 'log-summary')!;
    const tracking = items.find((item) => item.id === 'log-tracking')!;
    expect(isDrawerChildActive(overview, '/app/log')).toBe(true);
    expect(isDrawerChildActive(overview, '/app/log?section=summary')).toBe(false);
    expect(isDrawerChildActive(summary, '/app/log?section=summary')).toBe(true);
    expect(isDrawerChildActive(tracking, '/app/profile?section=tracking#tracking-prefs')).toBe(true);
  });
});
