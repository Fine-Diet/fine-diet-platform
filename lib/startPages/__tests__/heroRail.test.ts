/**
 * StartView hero rail normalization helpers — guard that legacy `string[]` rail
 * data and new structured items both normalize safely for rendering, and that
 * hrefs are only treated as link targets when they are safe.
 */
import { normalizeHeroRailItem, isSafeRailHref } from '@/lib/startPages/heroRail';

describe('normalizeHeroRailItem', () => {
  it('turns a legacy string into a { label } item', () => {
    expect(normalizeHeroRailItem('Food clarity')).toEqual({ label: 'Food clarity' });
  });

  it('passes structured items through unchanged', () => {
    const item = { id: 'rail-1', label: 'Food clarity', href: '#plans' };
    expect(normalizeHeroRailItem(item)).toEqual(item);
  });

  it('handles empty/blank strings without throwing (renderer filters blanks)', () => {
    expect(normalizeHeroRailItem('')).toEqual({ label: '' });
  });
});

describe('isSafeRailHref', () => {
  it('accepts relative paths starting with /', () => {
    expect(isSafeRailHref('/programs/nutrition')).toBe(true);
  });

  it('accepts hash anchors', () => {
    expect(isSafeRailHref('#plans')).toBe(true);
  });

  it('accepts http/https absolute URLs', () => {
    expect(isSafeRailHref('https://example.com/path')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeRailHref('javascript:alert(1)')).toBe(false);
  });

  it('rejects undefined/empty', () => {
    expect(isSafeRailHref(undefined)).toBe(false);
    expect(isSafeRailHref('')).toBe(false);
    expect(isSafeRailHref('   ')).toBe(false);
  });
});
